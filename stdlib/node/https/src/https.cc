#include "inox/https.h"

#include <array>
#include <memory>
#include <new>
#include <span>
#include <string>
#include <utility>

#include "inox/binary.h"
#include "inox/http_server_transport.h"
#include "inox/loop.h"
#include "inox/net.h"
#include "inox/object.h"
#include "inox/tls.h"

namespace {

void throwHttpsError(const char* message) {
  inox::throw_value(inox::String(message));
}

inox::Value materializeHttpsError(const char* message) {
  static const inox_field_info fields[] = {
    {"message", INOX_FIELD_READONLY},
  };
  static const inox_shape shape = {1, fields};

  inox::ObjectValue object = inox::ObjectValue::create(&shape);

  if (!object.valid() || inox::thrown()) {
    return inox::Value();
  }

  object.init(0, inox::String(message));
  return inox::thrown() ? inox::Value() : inox::Value(object);
}

bool readRequiredBytes(const inox::Value& options, const char* name, std::string& out) {
  inox::Value value = inox::get(options.raw(), name);

  if (inox::thrown()) {
    return false;
  }

  try {
    if (value.tag == INOX_TAG_STRING && value.raw().as.ref != nullptr) {
      const inox::StringView text = inox::String(value);
      out.assign(text.bytes, text.len);
      return true;
    }

    Uint8Array bytes(value);

    if (bytes.valid()) {
      const std::span<const std::uint8_t> view = bytes.bytes();
      out.assign(reinterpret_cast<const char*>(view.data()), view.size());
      return true;
    }
  } catch (const std::bad_alloc&) {
    throwHttpsError("TypeError: node:https server identity allocation failed");
    return false;
  }

  throwHttpsError("TypeError: node:https server cert and key must be strings or Uint8Array values");
  return false;
}

bool readOptionalBoolean(const inox::Value& options, const char* name, bool& out) {
  inox::Value value = inox::get(options.raw(), name);

  if (inox::thrown()) {
    return false;
  }

  if (value.tag == INOX_TAG_UNDEFINED) {
    return true;
  }

  if (value.tag != INOX_TAG_BOOL) {
    throwHttpsError("TypeError: node:https boolean option is invalid");
    return false;
  }

  out = value.as.boolean;
  return true;
}

bool readOptionalString(
  const inox::Value& options,
  const char* name,
  std::optional<inox::String>& out
) {
  inox::Value value = inox::get(options.raw(), name);

  if (inox::thrown()) {
    return false;
  }

  if (value.tag == INOX_TAG_UNDEFINED) {
    return true;
  }

  if (value.tag != INOX_TAG_STRING || value.raw().as.ref == nullptr) {
    throwHttpsError("TypeError: node:https string option is invalid");
    return false;
  }

  out = inox::String(value);
  return !inox::thrown();
}

template <typename State>
struct WeakCallbackContext {
  std::weak_ptr<State> state;
};

template <typename State>
void destroyWeakCallbackContext(void* raw_context) {
  delete static_cast<WeakCallbackContext<State>*>(raw_context);
}

template <typename State>
inox::Callback makeWeakCallback(
  const std::shared_ptr<State>& state,
  inox_callback_call_fn call
) {
  auto* context = new (std::nothrow) WeakCallbackContext<State>{state};

  if (context == nullptr) {
    throwHttpsError("TypeError: HTTPS server callback allocation failed");
    return inox::Callback();
  }

  inox_value value = inox_undefined_value();
  const inox_status status = inox_callback_new(
    &inox_default_allocator,
    call,
    context,
    destroyWeakCallbackContext<State>,
    &value
  );

  if (status != INOX_OK) {
    delete context;
    throwHttpsError("TypeError: HTTPS server callback allocation failed");
    return inox::Callback();
  }

  return inox::Callback(inox::adopt(value));
}

template <typename State>
std::shared_ptr<State> lockCallbackState(void* raw_context) {
  if (raw_context == nullptr) {
    return {};
  }

  return static_cast<WeakCallbackContext<State>*>(raw_context)->state.lock();
}

void setCallbackResult(inox_value* out) {
  if (out != nullptr) {
    *out = inox_undefined_value();
  }
}

inox_status callbackStatus() {
  return inox::thrown() ? INOX_ERR_THROW : INOX_OK;
}

class HttpsServerConnectionTransport final
  : public HttpServerConnectionTransport,
    public std::enable_shared_from_this<HttpsServerConnectionTransport> {
public:
  HttpsServerConnectionTransport(HttpServer server, NetSocket socket)
    : server_(std::move(server)),
      socket_(std::move(socket)),
      connection_(nullptr),
      close_(),
      error_(),
      data_(),
      native_owner_(),
      started_(false),
      closed_(false),
      had_error_(false) {}

  static std::shared_ptr<HttpsServerConnectionTransport> create(
    inox_tls_server* tls_server,
    HttpServer server,
    NetSocket socket
  ) {
    std::shared_ptr<HttpsServerConnectionTransport> transport;

    try {
      transport = std::make_shared<HttpsServerConnectionTransport>(
        std::move(server),
        socket
      );
    } catch (const std::bad_alloc&) {
      socket.destroy();
      throwHttpsError("TypeError: HTTPS connection allocation failed");
      return {};
    }

    transport->native_owner_ = transport;
    const inox_status status = inox_tls_server_accept(
      tls_server,
      socket.raw(),
      onHandshake,
      onData,
      onError,
      onClose,
      transport.get(),
      &transport->connection_
    );

    if (status != INOX_OK) {
      transport->native_owner_.reset();
      socket.destroy();
      throwHttpsError("TypeError: HTTPS TLS connection setup failed");
      return {};
    }

    return transport;
  }

  void destroy() override {
    if (connection_ != nullptr) {
      (void)inox_tls_server_connection_destroy(connection_);
    } else if (!closed_) {
      socket_.destroy();
    }
  }

  void end(inox::StringView data, inox::Callback callback) override {
    if (!writeTls(data) ||
        inox_tls_server_connection_shutdown(connection_) != INOX_OK) {
      throwHttpsError("TypeError: HTTPS response end failed");
      destroy();
      return;
    }

    socket_.end(std::move(callback));
  }

  NetSocket socket() const override {
    return socket_;
  }

  void start(
    inox::Callback close,
    inox::Callback error,
    inox::Callback data
  ) override {
    if (started_ || closed_) {
      throwHttpsError("TypeError: HTTPS connection transport start failed");
      return;
    }

    close_ = std::move(close);
    error_ = std::move(error);
    data_ = std::move(data);
    started_ = true;
  }

  bool write(inox::StringView data) override {
    return writeTls(data);
  }

  bool write(inox::StringView data, inox::Callback callback) override {
    if (!writeTls(data)) {
      return false;
    }

    return socket_.write(inox::StringView(), std::move(callback));
  }

private:
  HttpServer server_;
  NetSocket socket_;
  inox_tls_server_connection* connection_;
  inox::Callback close_;
  inox::Callback error_;
  inox::Callback data_;
  std::shared_ptr<HttpsServerConnectionTransport> native_owner_;
  bool started_;
  bool closed_;
  bool had_error_;

  bool writeTls(inox::StringView data) {
    if (closed_ || connection_ == nullptr ||
        inox_tls_server_connection_write(connection_, data.bytes, data.len) != INOX_OK) {
      throwHttpsError("TypeError: HTTPS response write failed");
      return false;
    }

    return true;
  }

  static inox_status onHandshake(
    void* user,
    inox_tls_server_connection* connection,
    inox_status status
  ) {
    auto* transport = static_cast<HttpsServerConnectionTransport*>(user);

    if (transport == nullptr || transport->connection_ != connection) {
      return INOX_ERR_TYPE;
    }

    if (status != INOX_OK) {
      transport->had_error_ = true;
      return INOX_OK;
    }

    std::shared_ptr<HttpsServerConnectionTransport> owner = transport->native_owner_;

    if (!owner) {
      return INOX_ERR_FIELD;
    }

    acceptHttpServerConnection(transport->server_, owner);

    if (inox::thrown()) {
      transport->destroy();
      return INOX_ERR_THROW;
    }

    transport->native_owner_.reset();
    return INOX_OK;
  }

  static inox_status onData(
    void* user,
    inox_tls_server_connection* connection,
    const char* bytes,
    std::size_t length
  ) {
    auto* transport = static_cast<HttpsServerConnectionTransport*>(user);

    if (transport == nullptr || transport->connection_ != connection ||
        !transport->started_ || !transport->data_.valid()) {
      return INOX_ERR_TYPE;
    }

    inox::String chunk(bytes, length);
    const std::array<inox::Value, 1> arguments = {chunk};
    inox::Value result = transport->data_.call(arguments);
    (void)result;
    return callbackStatus();
  }

  static inox_status onError(
    void* user,
    inox_tls_server_connection* connection,
    inox_status status
  ) {
    (void)status;
    auto* transport = static_cast<HttpsServerConnectionTransport*>(user);

    if (transport == nullptr || transport->connection_ != connection) {
      return INOX_ERR_TYPE;
    }

    transport->had_error_ = true;

    if (!transport->started_ || !transport->error_.valid()) {
      return INOX_OK;
    }

    inox::Value error = materializeHttpsError("HTTPS TLS connection failed");

    if (inox::thrown()) {
      return INOX_ERR_THROW;
    }

    const std::array<inox::Value, 1> arguments = {error};
    inox::Value result = transport->error_.call(arguments);
    (void)result;
    return callbackStatus();
  }

  static void onClose(
    void* user,
    inox_tls_server_connection* connection
  ) {
    auto* transport = static_cast<HttpsServerConnectionTransport*>(user);

    if (transport == nullptr || transport->connection_ != connection) {
      return;
    }

    std::shared_ptr<HttpsServerConnectionTransport> owner = transport->shared_from_this();
    transport->connection_ = nullptr;
    transport->closed_ = true;

    if (transport->started_ && transport->close_.valid()) {
      const std::array<inox::Value, 1> arguments = {
        inox::Value(inox_bool_value(transport->had_error_))
      };
      inox::Value result = transport->close_.call(arguments);
      (void)result;
    }

    transport->native_owner_.reset();
  }
};

class HttpsServerState;

inox_status onHttpsServerConnection(
  void* context,
  const inox_value* args,
  std::size_t arg_count,
  inox_value* out
);
inox_status onHttpsServerClose(
  void* context,
  const inox_value* args,
  std::size_t arg_count,
  inox_value* out
);

class HttpsServerState : public std::enable_shared_from_this<HttpsServerState> {
public:
  NetServer net_server_;
  HttpServer http_server_;
  inox_tls_server* tls_server_;
  std::shared_ptr<HttpsServerState> native_owner_;

  HttpsServerState()
    : net_server_(), http_server_(), tls_server_(nullptr), native_owner_() {}

  ~HttpsServerState() {
    disposeTls();
  }

  static std::shared_ptr<HttpsServerState> create(
    const HttpsServerOptions& options,
    inox::Callback listener
  ) {
    if (!options.valid()) {
      throwHttpsError("TypeError: node:https server options are invalid");
      return {};
    }

    std::shared_ptr<HttpsServerState> state;

    try {
      state = std::make_shared<HttpsServerState>();
    } catch (const std::bad_alloc&) {
      throwHttpsError("TypeError: HTTPS server allocation failed");
      return {};
    }

    const inox::StringView certificate = options.certificate();
    const inox::StringView private_key = options.privateKey();
    const inox_status tls_status = inox_tls_server_create(
      inox::loop(),
      certificate.bytes,
      certificate.len,
      private_key.bytes,
      private_key.len,
      &state->tls_server_
    );

    if (tls_status != INOX_OK) {
      throwHttpsError("TypeError: HTTPS server certificate or private key is invalid");
      return {};
    }

    state->native_owner_ = state;
    inox::Callback connection = makeWeakCallback(state, onHttpsServerConnection);
    inox::Callback close = makeWeakCallback(state, onHttpsServerClose);

    if (inox::thrown()) {
      state->native_owner_.reset();
      return {};
    }

    state->net_server_ = net.createServer(std::move(connection));

    if (!inox::thrown()) {
      state->net_server_.on("close", std::move(close));
    }

    if (!inox::thrown()) {
      state->http_server_ = makeHttpServer(state->net_server_, std::move(listener));
    }

    if (inox::thrown()) {
      state->net_server_.close();
      return {};
    }

    return state;
  }

  void accept(NetSocket socket) {
    (void)HttpsServerConnectionTransport::create(
      tls_server_,
      http_server_,
      std::move(socket)
    );
  }

  void onClose() {
    disposeTls();
    native_owner_.reset();
  }

private:
  void disposeTls() {
    if (tls_server_ != nullptr) {
      inox_tls_server_destroy(tls_server_);
      tls_server_ = nullptr;
    }
  }
};

inox_status onHttpsServerConnection(
  void* context,
  const inox_value* args,
  std::size_t arg_count,
  inox_value* out
) {
  setCallbackResult(out);

  if (args == nullptr || arg_count != 1 || args[0].tag != INOX_TAG_CLASS_INSTANCE) {
    return INOX_ERR_TYPE;
  }

  NetSocket socket{inox::Value(args[0])};
  std::shared_ptr<HttpsServerState> state = lockCallbackState<HttpsServerState>(context);

  if (!state) {
    socket.destroy();
    return callbackStatus();
  }

  state->accept(std::move(socket));
  return callbackStatus();
}

inox_status onHttpsServerClose(
  void* context,
  const inox_value* args,
  std::size_t arg_count,
  inox_value* out
) {
  setCallbackResult(out);
  (void)args;

  if (arg_count != 0) {
    return INOX_ERR_TYPE;
  }

  std::shared_ptr<HttpsServerState> state = lockCallbackState<HttpsServerState>(context);

  if (state) {
    state->onClose();
  }

  return INOX_OK;
}

HttpClientTransportOptions transport(const HttpsRequestOptions& options) {
  return HttpClientTransportOptions::tls(options.verifyPeer(), options.serverName());
}

HttpClientRequest createHttpsClientRequest(
  inox::StringView url,
  const HttpsRequestOptions* options,
  inox::Callback listener,
  bool end_immediately
) {
  if (options != nullptr && !options->valid()) {
    throwHttpsError("TypeError: node:https request options are invalid");
    return HttpClientRequest();
  }

  const HttpClientTransportOptions transport_options = options == nullptr
    ? HttpClientTransportOptions::tls()
    : transport(*options);

  if (options == nullptr) {
    return createHttpClientRequest(url, std::move(listener), end_immediately, transport_options);
  }

  return createHttpClientRequest(url, options->requestOptions(), std::move(listener), end_immediately, transport_options);
}

} // namespace

HttpsRequestOptions::HttpsRequestOptions()
  : request_options_(), verify_peer_(true), server_name_(), valid_(true) {}

HttpsRequestOptions::HttpsRequestOptions(const inox::Value& value)
  : request_options_(value), verify_peer_(true), server_name_(), valid_(false) {
  if (!request_options_.valid() ||
      !readOptionalBoolean(value, "rejectUnauthorized", verify_peer_) ||
      !readOptionalString(value, "servername", server_name_)) {
    return;
  }

  valid_ = true;
}

const HttpRequestOptions& HttpsRequestOptions::requestOptions() const {
  return request_options_;
}

bool HttpsRequestOptions::verifyPeer() const {
  return verify_peer_;
}

const std::optional<inox::String>& HttpsRequestOptions::serverName() const {
  return server_name_;
}

bool HttpsRequestOptions::valid() const {
  return valid_;
}

HttpsServerOptions::HttpsServerOptions()
  : certificate_(), private_key_(), valid_(false) {}

HttpsServerOptions::HttpsServerOptions(const inox::Value& value)
  : certificate_(), private_key_(), valid_(false) {
  if (!readRequiredBytes(value, "cert", certificate_) ||
      !readRequiredBytes(value, "key", private_key_)) {
    return;
  }

  valid_ = true;
}

inox::StringView HttpsServerOptions::certificate() const {
  return inox::StringView(certificate_.data(), certificate_.size());
}

inox::StringView HttpsServerOptions::privateKey() const {
  return inox::StringView(private_key_.data(), private_key_.size());
}

bool HttpsServerOptions::valid() const {
  return valid_;
}

HttpServer HttpsModule::createServer(const HttpsServerOptions& options) const {
  return createServer(options, inox::Callback());
}

HttpServer HttpsModule::createServer(
  const HttpsServerOptions& options,
  inox::Callback listener
) const {
  std::shared_ptr<HttpsServerState> state = HttpsServerState::create(
    options,
    std::move(listener)
  );
  return state ? state->http_server_ : HttpServer();
}

HttpClientRequest HttpsModule::get(inox::StringView url) const {
  return createHttpsClientRequest(url, nullptr, inox::Callback(), true);
}

HttpClientRequest HttpsModule::get(inox::StringView url, inox::Callback listener) const {
  return createHttpsClientRequest(url, nullptr, std::move(listener), true);
}

HttpClientRequest HttpsModule::get(inox::StringView url, const HttpsRequestOptions& options) const {
  return createHttpsClientRequest(url, &options, inox::Callback(), true);
}

HttpClientRequest HttpsModule::get(
  inox::StringView url,
  const HttpsRequestOptions& options,
  inox::Callback listener
) const {
  return createHttpsClientRequest(url, &options, std::move(listener), true);
}

HttpClientRequest HttpsModule::get(const HttpsRequestOptions& options) const {
  return createHttpsClientRequest(inox::StringView(), &options, inox::Callback(), true);
}

HttpClientRequest HttpsModule::get(const HttpsRequestOptions& options, inox::Callback listener) const {
  return createHttpsClientRequest(inox::StringView(), &options, std::move(listener), true);
}

HttpClientRequest HttpsModule::request(inox::StringView url) const {
  return createHttpsClientRequest(url, nullptr, inox::Callback(), false);
}

HttpClientRequest HttpsModule::request(inox::StringView url, inox::Callback listener) const {
  return createHttpsClientRequest(url, nullptr, std::move(listener), false);
}

HttpClientRequest HttpsModule::request(
  inox::StringView url,
  const HttpsRequestOptions& options
) const {
  return createHttpsClientRequest(url, &options, inox::Callback(), false);
}

HttpClientRequest HttpsModule::request(
  inox::StringView url,
  const HttpsRequestOptions& options,
  inox::Callback listener
) const {
  return createHttpsClientRequest(url, &options, std::move(listener), false);
}

HttpClientRequest HttpsModule::request(const HttpsRequestOptions& options) const {
  return createHttpsClientRequest(inox::StringView(), &options, inox::Callback(), false);
}

HttpClientRequest HttpsModule::request(
  const HttpsRequestOptions& options,
  inox::Callback listener
) const {
  return createHttpsClientRequest(inox::StringView(), &options, std::move(listener), false);
}

const HttpsModule https;
