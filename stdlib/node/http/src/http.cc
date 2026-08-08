#include "inox/http.h"

#include <array>
#include <charconv>
#include <cmath>
#include <cstddef>
#include <cstdint>
#include <cstring>
#include <limits>
#include <memory>
#include <new>
#include <span>
#include <string>
#include <utility>
#include <vector>

#include "inox/class_descriptor.h"
#include "inox/loop.h"
#include "inox/net.h"
#include "inox/object.h"
#include "inox/tls.h"

namespace {

constexpr std::size_t maxRequestBytes = 64 * 1024;
constexpr std::size_t maxRequestChunkFramingBytes = 64 * 1024;
constexpr std::size_t maxRequestHeaders = 64;
constexpr std::size_t maxResponseBodyBytes = 64 * 1024;
constexpr std::size_t maxResponseHeaders = 64;
constexpr std::size_t maxResponseHeaderBytes = 16 * 1024;
constexpr std::size_t maxClientRequestBodyBytes = 64 * 1024;
constexpr std::size_t maxClientResponseBytes = 1024 * 1024;
constexpr std::size_t maxClientChunkFramingBytes = 256 * 1024;
constexpr std::size_t maxChunkMetadataLineBytes = 16 * 1024;

enum class HttpClientResponseBodyMode {
  close_delimited,
  content_length,
  chunked,
  none
};

enum class HttpChunkDecodeState {
  size,
  data,
  data_crlf,
  trailers,
  complete
};

enum class HttpOutgoingBodyMode {
  undecided,
  content_length,
  chunked,
  close_delimited
};

void throwHttpError(const char* message) {
  inox::throw_value(inox::String(message == nullptr ? "TypeError: HTTP operation failed" : message));
}

inox::Value materializeHttpError(const char* message) {
  static const inox_field_info fields[] = {
    {"message", INOX_FIELD_READONLY},
  };
  static const inox_shape shape = {1, fields};
  inox::ObjectValue object = inox::ObjectValue::create(&shape);

  if (!object.valid() || inox::thrown()) {
    return inox::Value();
  }

  object.init(0, inox::String(message == nullptr ? "HTTP operation failed" : message).raw());
  return inox::thrown() ? inox::Value() : inox::Value(std::move(object));
}

bool hasText(inox::StringView value, const char* expected) {
  const std::size_t length = std::strlen(expected);
  return value.len == length && std::memcmp(value.bytes, expected, length) == 0;
}

bool readObjectField(const inox::Value& object, const char* name, inox::Value& out, bool& present) {
  const inox_value raw = object.raw();

  if (raw.tag != INOX_TAG_OBJECT && raw.tag != INOX_TAG_CLASS_INSTANCE) {
    throwHttpError("TypeError: HTTP options must be an object");
    return false;
  }

  const inox_status status = inox_object_get(raw, name, std::strlen(name), out.out());

  if (status == INOX_ERR_FIELD) {
    present = false;
    return true;
  }

  if (status != INOX_OK) {
    throwHttpError("TypeError: HTTP option read failed");
    return false;
  }

  present = true;
  return true;
}

bool readOptionalNumber(
  const inox::Value& object,
  const char* name,
  std::optional<double>& out,
  double minimum,
  double maximum
) {
  inox::Value field;
  bool present = false;

  if (!readObjectField(object, name, field, present)) {
    return false;
  }

  if (!present || field.tag == INOX_TAG_UNDEFINED) {
    out.reset();
    return true;
  }

  if (field.tag != INOX_TAG_NUMBER || !std::isfinite(field.as.number) || std::floor(field.as.number) != field.as.number ||
      field.as.number < minimum || field.as.number > maximum) {
    throwHttpError("TypeError: HTTP numeric option is invalid");
    return false;
  }

  out = field.as.number;
  return true;
}

bool readOptionalString(const inox::Value& object, const char* name, std::optional<inox::String>& out) {
  inox::Value field;
  bool present = false;

  if (!readObjectField(object, name, field, present)) {
    return false;
  }

  if (!present || field.tag == INOX_TAG_UNDEFINED) {
    out.reset();
    return true;
  }

  if (field.tag != INOX_TAG_STRING) {
    throwHttpError("TypeError: HTTP string option is invalid");
    return false;
  }

  out = inox::String(std::move(field));
  return true;
}

bool readOptionalObject(const inox::Value& object, const char* name, inox::Value& out) {
  inox::Value field;
  bool present = false;

  if (!readObjectField(object, name, field, present)) {
    return false;
  }

  if (!present || field.tag == INOX_TAG_UNDEFINED) {
    out = inox::Value();
    return true;
  }

  if (field.tag != INOX_TAG_OBJECT) {
    throwHttpError("TypeError: HTTP object option is invalid");
    return false;
  }

  out = std::move(field);
  return true;
}

bool equalsIgnoreCase(inox::StringView left, inox::StringView right) {
  if (left.len != right.len) {
    return false;
  }

  for (std::size_t index = 0; index < left.len; index += 1) {
    unsigned char left_byte = static_cast<unsigned char>(left.bytes[index]);
    unsigned char right_byte = static_cast<unsigned char>(right.bytes[index]);

    if (left_byte >= 'A' && left_byte <= 'Z') {
      left_byte = static_cast<unsigned char>(left_byte - 'A' + 'a');
    }

    if (right_byte >= 'A' && right_byte <= 'Z') {
      right_byte = static_cast<unsigned char>(right_byte - 'A' + 'a');
    }

    if (left_byte != right_byte) {
      return false;
    }
  }

  return true;
}

bool validHeaderName(inox::StringView name) {
  if (name.len == 0) {
    return false;
  }

  for (std::size_t index = 0; index < name.len; index += 1) {
    const unsigned char byte = static_cast<unsigned char>(name.bytes[index]);
    const bool alpha_numeric = (byte >= 'a' && byte <= 'z') || (byte >= 'A' && byte <= 'Z') ||
                               (byte >= '0' && byte <= '9');
    const bool punctuation = byte == '!' || byte == '#' || byte == '$' || byte == '%' || byte == '&' ||
                             byte == '\'' || byte == '*' || byte == '+' || byte == '-' || byte == '.' ||
                             byte == '^' || byte == '_' || byte == '`' || byte == '|' || byte == '~';

    if (!alpha_numeric && !punctuation) {
      return false;
    }
  }

  return true;
}

bool validHeaderValue(inox::StringView value) {
  for (std::size_t index = 0; index < value.len; index += 1) {
    const unsigned char byte = static_cast<unsigned char>(value.bytes[index]);

    if (byte == '\r' || byte == '\n' || byte == 0 || (byte < 0x20 && byte != '\t') || byte == 0x7f) {
      return false;
    }
  }

  return true;
}

class HttpServerState;
class HttpRequestState;
class HttpResponseState;
class HttpConnectionState;
class HttpClientConnectionState;
class HttpClientRequestState;

struct HttpServerHolder {
  std::shared_ptr<HttpServerState> state;
};

struct HttpRequestHolder {
  std::shared_ptr<HttpRequestState> state;
};

struct HttpResponseHolder {
  std::shared_ptr<HttpResponseState> state;
};

struct HttpClientRequestHolder {
  std::shared_ptr<HttpClientRequestState> state;
};

struct ResponseHeader {
  inox::String name;
  inox::String value;
};

class HttpRequestState {
public:
  inox::Value headers_;
  inox::String http_version_;
  inox::String method_;
  NetSocket socket_;
  inox::String url_;
  std::optional<double> status_code_;
  std::optional<inox::String> status_message_;
  std::vector<inox::Callback> data_listeners_;
  std::vector<inox::Callback> end_listeners_;
  std::vector<inox::Callback> close_listeners_;
  std::vector<inox::Callback> error_listeners_;
  bool ended_;
  bool closed_;

  HttpRequestState(
    inox::Value headers,
    inox::String http_version,
    inox::String method,
    NetSocket socket,
    inox::String url,
    std::optional<double> status_code = {},
    std::optional<inox::String> status_message = {}
  )
    : headers_(std::move(headers)),
      http_version_(std::move(http_version)),
      method_(std::move(method)),
      socket_(std::move(socket)),
      url_(std::move(url)),
      status_code_(std::move(status_code)),
      status_message_(std::move(status_message)),
      data_listeners_(),
      end_listeners_(),
      close_listeners_(),
      error_listeners_(),
      ended_(false),
      closed_(false) {}

  void emitClose();
  void emitData(inox::StringView data);
  void emitEnd();
  void emitError(const inox::Value& error);
  void on(inox::StringView event_name, inox::Callback listener);
};

class HttpResponseState : public std::enable_shared_from_this<HttpResponseState> {
public:
  std::shared_ptr<HttpConnectionState> connection_;
  std::vector<ResponseHeader> headers_;
  std::optional<std::size_t> content_length_;
  std::size_t body_bytes_written_;
  HttpOutgoingBodyMode body_mode_;
  double status_code_;
  bool sent_;
  bool ending_;
  bool ended_;

  explicit HttpResponseState(std::shared_ptr<HttpConnectionState> connection);

  void applyHeaders(const inox::Value& headers);
  void end(std::span<const std::uint8_t> body);
  inox::Value getHeader(inox::StringView name) const;
  Array getHeaderNames() const;
  bool hasHeader(inox::StringView name) const;
  bool headersSent() const;
  void removeHeader(inox::StringView name);
  void setHeader(inox::StringView name, inox::StringView value);
  void setStatusCode(double value);
  bool write(std::span<const std::uint8_t> body);
  bool writableEnded() const;

private:
  bool appendBody(std::string& output, std::span<const std::uint8_t> body);
  bool begin(bool streaming, std::size_t initial_body_size, std::string& output);
  bool send(std::string& output, bool final);
};

class HttpServerState : public std::enable_shared_from_this<HttpServerState> {
public:
  NetServer net_server_;
  std::vector<inox::Callback> request_listeners_;
  std::vector<std::weak_ptr<HttpConnectionState>> connections_;
  std::shared_ptr<HttpServerState> native_owner_;
  bool closed_;

  HttpServerState();

  static std::shared_ptr<HttpServerState> create(inox::Callback listener);
  void accept(NetSocket socket);
  void close(inox::Callback callback);
  void connectionClosed(const HttpConnectionState* connection);
  void listen(double port, inox::StringView host, double backlog, inox::Callback callback);
  void on(inox::StringView event_name, inox::Callback listener);
  void onNetClosed();
};

class HttpConnectionState : public std::enable_shared_from_this<HttpConnectionState> {
public:
  std::shared_ptr<HttpServerState> server_;
  NetSocket socket_;
  std::vector<char> request_bytes_;
  std::shared_ptr<HttpConnectionState> native_owner_;
  std::size_t active_request_bytes_;
  bool active_keep_alive_;
  bool active_http_1_0_;
  bool request_dispatched_;
  bool closed_;

  HttpConnectionState(std::shared_ptr<HttpServerState> server, NetSocket socket);

  static std::shared_ptr<HttpConnectionState> create(
    const std::shared_ptr<HttpServerState>& server,
    NetSocket socket
  );
  void completeResponse(bool keep_alive);
  void onClose();
  void onData(inox::StringView data);
  void sendError(double status, inox::StringView message);
};

class HttpClientConnectionState : public std::enable_shared_from_this<HttpClientConnectionState> {
public:
  inox::String host_;
  double port_;
  HttpClientTransportKind transport_kind_;
  bool verify_peer_;
  std::optional<inox::String> server_name_;
  NetSocket socket_;
  inox_tls_client* tls_;
  std::shared_ptr<HttpClientRequestState> request_;
  std::shared_ptr<HttpClientConnectionState> native_owner_;
  bool connected_;
  bool closed_;
  bool destroying_;
  std::size_t idle_generation_;

  HttpClientConnectionState(
    inox::String host,
    double port,
    const HttpClientTransportOptions& transport
  );

  static std::shared_ptr<HttpClientConnectionState> create(
    inox::StringView host,
    double port,
    const HttpClientTransportOptions& transport
  );
  bool attach(const std::shared_ptr<HttpClientRequestState>& request);
  void complete(const std::shared_ptr<HttpClientRequestState>& request);
  bool release(const std::shared_ptr<HttpClientRequestState>& request);
  void destroy();
  bool matches(
    inox::StringView host,
    double port,
    const HttpClientTransportOptions& transport
  ) const;
  void onClose();
  void onConnect();
  void onData(inox::StringView data);
  void onEnd();
  void onError(const inox::Value& error);
  void onWrite(inox_status status);
  NetSocket responseSocket() const;
  void setIdle(bool idle);
  bool write(inox::StringView data, bool final, bool& accepted);
};

class HttpClientRequestState : public std::enable_shared_from_this<HttpClientRequestState> {
public:
  inox::String host_;
  inox::String method_;
  inox::String path_;
  double port_;
  std::vector<ResponseHeader> headers_;
  std::string pending_write_bytes_;
  std::vector<char> response_bytes_;
  std::vector<inox::Callback> response_listeners_;
  std::vector<inox::Callback> finish_listeners_;
  std::vector<inox::Callback> close_listeners_;
  std::vector<inox::Callback> error_listeners_;
  HttpClientTransportKind transport_kind_;
  std::shared_ptr<HttpClientConnectionState> connection_;
  std::shared_ptr<HttpRequestState> response_;
  std::shared_ptr<HttpClientRequestState> native_owner_;
  std::optional<std::size_t> response_content_length_;
  std::vector<char> response_chunk_bytes_;
  std::size_t response_body_received_;
  std::size_t response_chunk_framing_received_;
  std::size_t response_chunk_remaining_;
  std::size_t response_trailer_count_;
  HttpClientResponseBodyMode response_body_mode_;
  HttpChunkDecodeState response_chunk_state_;
  std::optional<std::size_t> request_content_length_;
  std::size_t request_body_bytes_;
  HttpOutgoingBodyMode request_body_mode_;
  bool response_keep_alive_;
  bool request_keep_alive_;
  bool pending_write_final_;
  bool ending_;
  bool sent_;
  bool finished_;
  bool response_started_;
  bool failed_;
  bool closed_;

  HttpClientRequestState(
    inox::String host,
    double port,
    inox::String method,
    inox::String path,
    const HttpClientTransportOptions& transport
  );

  static std::shared_ptr<HttpClientRequestState> create(
    inox::StringView url,
    const HttpRequestOptions* options,
    inox::Callback listener,
    const HttpClientTransportOptions& transport
  );
  void applyHeaders(const inox::Value& headers);
  void destroy();
  void end(std::span<const std::uint8_t> body);
  inox::Value getHeader(inox::StringView name) const;
  Array getHeaderNames() const;
  bool hasHeader(inox::StringView name) const;
  bool headersSent() const;
  void on(inox::StringView event_name, inox::Callback listener);
  void onClose();
  void onConnect();
  void onData(inox::StringView data);
  void onEnd();
  void onError(const inox::Value& error);
  void onFinish();
  void removeHeader(inox::StringView name);
  void setHeader(inox::StringView name, inox::StringView value);
  bool writableEnded() const;
  bool write(std::span<const std::uint8_t> body);

private:
  bool appendRequestBody(std::string& output, std::span<const std::uint8_t> body);
  bool beginRequest(bool streaming, std::size_t initial_body_size, std::string& output);
  bool consumeChunkedBody(inox::StringView data);
  bool consumeResponseBody(inox::StringView data);
  bool deliverResponseBody(inox::StringView data);
  void completeResponseBody();
  bool send(std::string& output, bool final);
};

template <typename Holder>
inox_status copyHolder(inox_allocator* allocator, const void* instance, void** out) {
  if (allocator == nullptr || allocator->alloc == nullptr || instance == nullptr || out == nullptr) {
    return INOX_ERR_TYPE;
  }

  void* memory = allocator->alloc(allocator->user, sizeof(Holder), alignof(Holder));

  if (memory == nullptr) {
    *out = nullptr;
    return INOX_ERR_OOM;
  }

  try {
    *out = new (memory) Holder(*static_cast<const Holder*>(instance));
  } catch (const std::bad_alloc&) {
    allocator->free(allocator->user, memory, sizeof(Holder), alignof(Holder));
    *out = nullptr;
    return INOX_ERR_OOM;
  }

  return INOX_OK;
}

template <typename Holder>
void destroyHolder(inox_allocator* allocator, void* instance) {
  if (allocator == nullptr || allocator->free == nullptr || instance == nullptr) {
    return;
  }

  static_cast<Holder*>(instance)->~Holder();
  allocator->free(allocator->user, instance, sizeof(Holder), alignof(Holder));
}

inox_status readServerField(const void* instance, std::uint32_t index, inox_value* out) {
  (void)instance;
  (void)index;
  (void)out;
  return INOX_ERR_FIELD;
}

inox_status readRequestField(const void* instance, std::uint32_t index, inox_value* out);
inox_status readResponseField(const void* instance, std::uint32_t index, inox_value* out);
inox_status readClientRequestField(const void* instance, std::uint32_t index, inox_value* out);

const inox_class_field_descriptor requestFields[] = {
  {"headers", "object", "IncomingHttpHeaders", "owned", INOX_CLASS_FIELD_READONLY | INOX_CLASS_FIELD_ENUMERABLE},
  {"httpVersion", "string", "string", "owned", INOX_CLASS_FIELD_READONLY | INOX_CLASS_FIELD_ENUMERABLE},
  {"method", "string", "string", "owned", INOX_CLASS_FIELD_READONLY | INOX_CLASS_FIELD_ENUMERABLE},
  {"socket", "object", "Socket", "owned", INOX_CLASS_FIELD_READONLY | INOX_CLASS_FIELD_ENUMERABLE},
  {"statusCode", "number", "number", "value", INOX_CLASS_FIELD_READONLY | INOX_CLASS_FIELD_ENUMERABLE},
  {"statusMessage", "string", "string", "owned", INOX_CLASS_FIELD_READONLY | INOX_CLASS_FIELD_ENUMERABLE},
  {"url", "string", "string", "owned", INOX_CLASS_FIELD_READONLY | INOX_CLASS_FIELD_ENUMERABLE},
};

const inox_class_field_descriptor responseFields[] = {
  {"headersSent", "boolean", "boolean", "value", INOX_CLASS_FIELD_READONLY | INOX_CLASS_FIELD_ENUMERABLE},
  {"statusCode", "number", "number", "value", INOX_CLASS_FIELD_ENUMERABLE},
  {"writableEnded", "boolean", "boolean", "value", INOX_CLASS_FIELD_READONLY | INOX_CLASS_FIELD_ENUMERABLE},
};

const inox_class_field_descriptor clientRequestFields[] = {
  {"headersSent", "boolean", "boolean", "value", INOX_CLASS_FIELD_READONLY | INOX_CLASS_FIELD_ENUMERABLE},
  {"writableEnded", "boolean", "boolean", "value", INOX_CLASS_FIELD_READONLY | INOX_CLASS_FIELD_ENUMERABLE},
};

const inox_class_descriptor serverDescriptor = {
  "Server",
  0,
  nullptr,
  readServerField,
  copyHolder<HttpServerHolder>,
  destroyHolder<HttpServerHolder>,
};

const inox_class_descriptor requestDescriptor = {
  "IncomingMessage",
  7,
  requestFields,
  readRequestField,
  copyHolder<HttpRequestHolder>,
  destroyHolder<HttpRequestHolder>,
};

const inox_class_descriptor clientRequestDescriptor = {
  "ClientRequest",
  2,
  clientRequestFields,
  readClientRequestField,
  copyHolder<HttpClientRequestHolder>,
  destroyHolder<HttpClientRequestHolder>,
};

const inox_class_descriptor responseDescriptor = {
  "ServerResponse",
  3,
  responseFields,
  readResponseField,
  copyHolder<HttpResponseHolder>,
  destroyHolder<HttpResponseHolder>,
};

template <typename Holder>
const Holder* holderFromValue(const inox::Value& value, const inox_class_descriptor& descriptor) {
  const inox_value raw = value.raw();

  if (raw.tag != INOX_TAG_CLASS_INSTANCE || raw.as.ref == nullptr) {
    return nullptr;
  }

  const auto* ref = reinterpret_cast<const inox_class_instance_ref*>(raw.as.ref);

  if (ref->descriptor != &descriptor || ref->instance == nullptr) {
    return nullptr;
  }

  return static_cast<const Holder*>(ref->instance);
}

std::shared_ptr<HttpServerState> serverState(const HttpServer& server) {
  const HttpServerHolder* holder = holderFromValue<HttpServerHolder>(server, serverDescriptor);
  return holder == nullptr ? std::shared_ptr<HttpServerState>() : holder->state;
}

std::shared_ptr<HttpRequestState> requestState(const HttpRequest& request) {
  const HttpRequestHolder* holder = holderFromValue<HttpRequestHolder>(request, requestDescriptor);
  return holder == nullptr ? std::shared_ptr<HttpRequestState>() : holder->state;
}

std::shared_ptr<HttpResponseState> responseState(const HttpResponse& response) {
  const HttpResponseHolder* holder = holderFromValue<HttpResponseHolder>(response, responseDescriptor);
  return holder == nullptr ? std::shared_ptr<HttpResponseState>() : holder->state;
}

std::shared_ptr<HttpClientRequestState> clientRequestState(const HttpClientRequest& request) {
  const HttpClientRequestHolder* holder = holderFromValue<HttpClientRequestHolder>(request, clientRequestDescriptor);
  return holder == nullptr ? std::shared_ptr<HttpClientRequestState>() : holder->state;
}

HttpServer materializeServer(const std::shared_ptr<HttpServerState>& state) {
  if (!state) {
    return HttpServer();
  }

  const HttpServerHolder holder = {state};
  inox_value value = inox_undefined_value();
  const inox_status status = inox_class_instance_ref_copy(
    &inox_default_allocator,
    &serverDescriptor,
    &holder,
    &value
  );

  if (status != INOX_OK) {
    throwHttpError("TypeError: HttpServer materialization failed");
    return HttpServer();
  }

  return HttpServer(inox::adopt(value));
}

HttpRequest materializeRequest(const std::shared_ptr<HttpRequestState>& state) {
  if (!state) {
    return HttpRequest();
  }

  const HttpRequestHolder holder = {state};
  inox_value value = inox_undefined_value();
  const inox_status status = inox_class_instance_ref_copy(
    &inox_default_allocator,
    &requestDescriptor,
    &holder,
    &value
  );

  if (status != INOX_OK) {
    throwHttpError("TypeError: HttpRequest materialization failed");
    return HttpRequest();
  }

  return HttpRequest(inox::adopt(value));
}

HttpResponse materializeResponse(const std::shared_ptr<HttpResponseState>& state) {
  if (!state) {
    return HttpResponse();
  }

  const HttpResponseHolder holder = {state};
  inox_value value = inox_undefined_value();
  const inox_status status = inox_class_instance_ref_copy(
    &inox_default_allocator,
    &responseDescriptor,
    &holder,
    &value
  );

  if (status != INOX_OK) {
    throwHttpError("TypeError: HttpResponse materialization failed");
    return HttpResponse();
  }

  return HttpResponse(inox::adopt(value));
}

HttpClientRequest materializeClientRequest(const std::shared_ptr<HttpClientRequestState>& state) {
  if (!state) {
    return HttpClientRequest();
  }

  const HttpClientRequestHolder holder = {state};
  inox_value value = inox_undefined_value();
  const inox_status status = inox_class_instance_ref_copy(
    &inox_default_allocator,
    &clientRequestDescriptor,
    &holder,
    &value
  );

  if (status != INOX_OK) {
    throwHttpError("TypeError: HttpClientRequest materialization failed");
    return HttpClientRequest();
  }

  return HttpClientRequest(inox::adopt(value));
}

inox_status readRequestField(const void* instance, std::uint32_t index, inox_value* out) {
  if (instance == nullptr || out == nullptr) {
    return INOX_ERR_TYPE;
  }

  const auto* holder = static_cast<const HttpRequestHolder*>(instance);

  if (!holder->state) {
    return INOX_ERR_TYPE;
  }

  if (index == 0) {
    return holder->state->headers_.copy_to(out);
  }

  if (index == 1) {
    return holder->state->http_version_.copy_to(out);
  }

  if (index == 2) {
    return holder->state->method_.copy_to(out);
  }

  if (index == 3) {
    return holder->state->socket_.copy_to(out);
  }

  if (index == 4) {
    if (!holder->state->status_code_) {
      *out = inox_undefined_value();
      return INOX_OK;
    }

    *out = inox_number_value(*holder->state->status_code_);
    return INOX_OK;
  }

  if (index == 5) {
    if (!holder->state->status_message_) {
      *out = inox_undefined_value();
      return INOX_OK;
    }

    return holder->state->status_message_->copy_to(out);
  }

  if (index == 6) {
    return holder->state->url_.copy_to(out);
  }

  return INOX_ERR_FIELD;
}

inox_status readClientRequestField(const void* instance, std::uint32_t index, inox_value* out) {
  if (instance == nullptr || out == nullptr) {
    return INOX_ERR_TYPE;
  }

  const auto* holder = static_cast<const HttpClientRequestHolder*>(instance);

  if (!holder->state) {
    return INOX_ERR_FIELD;
  }

  if (index == 0) {
    *out = inox_bool_value(holder->state->headersSent());
    return INOX_OK;
  }

  if (index == 1) {
    *out = inox_bool_value(holder->state->writableEnded());
    return INOX_OK;
  }

  return INOX_ERR_FIELD;
}

inox_status readResponseField(const void* instance, std::uint32_t index, inox_value* out) {
  if (instance == nullptr || out == nullptr) {
    return INOX_ERR_TYPE;
  }

  const auto* holder = static_cast<const HttpResponseHolder*>(instance);

  if (!holder->state) {
    return INOX_ERR_FIELD;
  }

  if (index == 0) {
    *out = inox_bool_value(holder->state->headersSent());
    return INOX_OK;
  }

  if (index == 1) {
    *out = inox_number_value(holder->state->status_code_);
    return INOX_OK;
  }

  if (index == 2) {
    *out = inox_bool_value(holder->state->writableEnded());
    return INOX_OK;
  }

  return INOX_ERR_FIELD;
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
    throwHttpError("TypeError: HTTP callback allocation failed");
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
    throwHttpError("TypeError: HTTP callback allocation failed");
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

inox_status onServerConnection(void* context, const inox_value* args, std::size_t arg_count, inox_value* out);
inox_status onServerClose(void* context, const inox_value* args, std::size_t arg_count, inox_value* out);
inox_status onConnectionData(void* context, const inox_value* args, std::size_t arg_count, inox_value* out);
inox_status onConnectionClose(void* context, const inox_value* args, std::size_t arg_count, inox_value* out);
inox_status onConnectionError(void* context, const inox_value* args, std::size_t arg_count, inox_value* out);
inox_status onResponseComplete(void* context, const inox_value* args, std::size_t arg_count, inox_value* out);
inox_status onClientConnect(void* context, const inox_value* args, std::size_t arg_count, inox_value* out);
inox_status onClientData(void* context, const inox_value* args, std::size_t arg_count, inox_value* out);
inox_status onClientEnd(void* context, const inox_value* args, std::size_t arg_count, inox_value* out);
inox_status onClientClose(void* context, const inox_value* args, std::size_t arg_count, inox_value* out);
inox_status onClientError(void* context, const inox_value* args, std::size_t arg_count, inox_value* out);
inox_status onClientFinish(void* context, const inox_value* args, std::size_t arg_count, inox_value* out);
inox_status onClientTlsConnect(void* context, inox_tls_client* client, inox_status status);
inox_status onClientTlsData(
  void* context,
  inox_tls_client* client,
  const char* bytes,
  std::size_t length
);
void onClientTlsClose(void* context, inox_tls_client* client);
inox_status onClientTlsWrite(void* context, inox_tls_client* client, inox_status status);

enum class RequestParseResult {
  incomplete,
  ready,
  invalid,
  too_large,
};

struct ParsedRequest {
  RequestParseResult result;
  std::size_t method_start;
  std::size_t method_length;
  std::size_t url_start;
  std::size_t url_length;
  std::size_t version_start;
  std::size_t version_length;
  std::size_t headers_start;
  std::size_t headers_end;
  std::size_t body_start;
  std::size_t body_length;
  bool chunked;
  bool keep_alive;
};

enum class ChunkedRequestDecodeResult {
  incomplete,
  ready,
  invalid,
  too_large,
};

std::size_t findCrlf(std::span<const char> bytes, std::size_t start) {
  for (std::size_t index = start; index + 1 < bytes.size(); index += 1) {
    if (bytes[index] == '\r' && bytes[index + 1] == '\n') {
      return index;
    }
  }

  return std::numeric_limits<std::size_t>::max();
}

std::size_t findHeaderEnd(std::span<const char> bytes) {
  for (std::size_t index = 0; index + 3 < bytes.size(); index += 1) {
    if (bytes[index] == '\r' && bytes[index + 1] == '\n' && bytes[index + 2] == '\r' && bytes[index + 3] == '\n') {
      return index + 4;
    }
  }

  return std::numeric_limits<std::size_t>::max();
}

std::size_t findByte(std::span<const char> bytes, std::size_t start, std::size_t end, char expected) {
  for (std::size_t index = start; index < end; index += 1) {
    if (bytes[index] == expected) {
      return index;
    }
  }

  return std::numeric_limits<std::size_t>::max();
}

bool spanEqualsIgnoreCase(std::span<const char> value, const char* expected) {
  return equalsIgnoreCase(
    inox::StringView(value.data(), value.size()),
    inox::StringView(expected, std::strlen(expected))
  );
}

bool headerValueHasToken(std::span<const char> value, const char* expected) {
  const std::size_t expected_length = std::strlen(expected);
  std::size_t cursor = 0;

  while (cursor <= value.size()) {
    std::size_t end = cursor;

    while (end < value.size() && value[end] != ',') {
      end += 1;
    }

    std::size_t token_start = cursor;
    std::size_t token_end = end;

    while (token_start < token_end && (value[token_start] == ' ' || value[token_start] == '\t')) {
      token_start += 1;
    }

    while (token_end > token_start && (value[token_end - 1] == ' ' || value[token_end - 1] == '\t')) {
      token_end -= 1;
    }

    if (token_end - token_start == expected_length &&
        equalsIgnoreCase(
          inox::StringView(value.data() + token_start, expected_length),
          inox::StringView(expected, expected_length)
        )) {
      return true;
    }

    if (end == value.size()) {
      return false;
    }

    cursor = end + 1;
  }

  return false;
}

inox::String normalizedHeaderName(std::span<const char> name) {
  std::string normalized;

  try {
    normalized.reserve(name.size());

    for (const char character : name) {
      const unsigned char byte = static_cast<unsigned char>(character);
      normalized.push_back(
        byte >= 'A' && byte <= 'Z'
          ? static_cast<char>(byte - 'A' + 'a')
          : static_cast<char>(byte)
      );
    }
  } catch (const std::bad_alloc&) {
    throwHttpError("TypeError: HTTP header allocation failed");
    return inox::String("");
  }

  return inox::String(normalized.data(), normalized.size());
}

std::span<const char> trimOptionalWhitespace(std::span<const char> value) {
  while (!value.empty() && (value.front() == ' ' || value.front() == '\t')) {
    value = value.subspan(1);
  }

  while (!value.empty() && (value.back() == ' ' || value.back() == '\t')) {
    value = value.first(value.size() - 1);
  }

  return value;
}

bool parseOutgoingContentLength(
  inox::StringView value,
  std::size_t body_limit,
  std::size_t& out
) {
  const std::span<const char> bytes = trimOptionalWhitespace(
    std::span<const char>(value.bytes, value.len)
  );

  if (bytes.empty()) {
    return false;
  }

  std::size_t parsed = 0;

  for (const char digit : bytes) {
    if (digit < '0' || digit > '9') {
      return false;
    }

    const std::size_t number = static_cast<std::size_t>(digit - '0');

    if (parsed > (body_limit - number) / 10) {
      return false;
    }

    parsed = parsed * 10 + number;
  }

  out = parsed;
  return true;
}

bool appendGeneratedHeader(
  std::vector<ResponseHeader>& headers,
  const char* name,
  inox::StringView value,
  const char* allocation_error
) {
  if (headers.size() >= maxResponseHeaders) {
    throwHttpError("TypeError: HTTP header limit exceeded");
    return false;
  }

  try {
    headers.push_back(ResponseHeader{inox::String(name), inox::String(value)});
  } catch (const std::bad_alloc&) {
    throwHttpError(allocation_error);
    return false;
  }

  return !inox::thrown();
}

bool selectOutgoingBodyMode(
  std::vector<ResponseHeader>& headers,
  bool streaming,
  bool chunked_supported,
  std::size_t initial_body_size,
  std::size_t body_limit,
  const char* framing_error,
  const char* allocation_error,
  HttpOutgoingBodyMode& mode,
  std::optional<std::size_t>& content_length
) {
  bool has_content_length = false;
  bool has_transfer_encoding = false;
  std::size_t declared_content_length = 0;

  for (const ResponseHeader& header : headers) {
    const inox::StringView name = header.name;
    const inox::StringView value = header.value;

    if (equalsIgnoreCase(name, inox::StringView("Content-Length", 14))) {
      if (has_content_length ||
          !parseOutgoingContentLength(value, body_limit, declared_content_length)) {
        throwHttpError(framing_error);
        return false;
      }

      has_content_length = true;
    }

    if (equalsIgnoreCase(name, inox::StringView("Transfer-Encoding", 17))) {
      const std::span<const char> encoding = trimOptionalWhitespace(
        std::span<const char>(value.bytes, value.len)
      );

      if (has_transfer_encoding || !spanEqualsIgnoreCase(encoding, "chunked")) {
        throwHttpError(framing_error);
        return false;
      }

      has_transfer_encoding = true;
    }
  }

  if (has_content_length && has_transfer_encoding) {
    throwHttpError(framing_error);
    return false;
  }

  if (has_content_length) {
    if (initial_body_size > declared_content_length) {
      throwHttpError(framing_error);
      return false;
    }

    mode = HttpOutgoingBodyMode::content_length;
    content_length = declared_content_length;
    return true;
  }

  if (has_transfer_encoding || streaming) {
    if (!chunked_supported) {
      if (has_transfer_encoding) {
        throwHttpError(framing_error);
        return false;
      }

      mode = HttpOutgoingBodyMode::close_delimited;
      content_length.reset();
      return true;
    }

    mode = HttpOutgoingBodyMode::chunked;
    content_length.reset();

    if (!has_transfer_encoding) {
      return appendGeneratedHeader(
        headers,
        "transfer-encoding",
        inox::StringView("chunked", 7),
        allocation_error
      );
    }

    return true;
  }

  std::string serialized_length;

  try {
    serialized_length = std::to_string(initial_body_size);
  } catch (const std::bad_alloc&) {
    throwHttpError(allocation_error);
    return false;
  }

  mode = HttpOutgoingBodyMode::content_length;
  content_length = initial_body_size;
  return appendGeneratedHeader(
    headers,
    "content-length",
    inox::StringView(serialized_length.data(), serialized_length.size()),
    allocation_error
  );
}

bool appendChunk(
  std::string& output,
  std::span<const std::uint8_t> body,
  const char* allocation_error
) {
  if (body.empty()) {
    return true;
  }

  std::array<char, sizeof(std::size_t) * 2> serialized_size{};
  const auto result = std::to_chars(
    serialized_size.data(),
    serialized_size.data() + serialized_size.size(),
    body.size(),
    16
  );

  if (result.ec != std::errc()) {
    throwHttpError(allocation_error);
    return false;
  }

  try {
    output.append(serialized_size.data(), static_cast<std::size_t>(result.ptr - serialized_size.data()));
    output.append("\r\n");
    output.append(reinterpret_cast<const char*>(body.data()), body.size());
    output.append("\r\n");
  } catch (const std::bad_alloc&) {
    throwHttpError(allocation_error);
    return false;
  }

  return true;
}

inox::Value materializeRequestHeaders(
  std::span<const char> bytes,
  std::size_t headers_start,
  std::size_t headers_end
) {
  std::vector<ResponseHeader> headers;
  std::size_t cursor = headers_start;

  try {
    headers.reserve(8);

    while (cursor + 2 <= headers_end) {
      const std::size_t line_end = findCrlf(bytes, cursor);

      if (line_end == std::numeric_limits<std::size_t>::max() || line_end > headers_end || line_end == cursor) {
        break;
      }

      const std::size_t separator = findByte(bytes, cursor, line_end, ':');

      if (separator == std::numeric_limits<std::size_t>::max()) {
        throwHttpError("TypeError: HTTP header parsing failed");
        return inox::Value();
      }

      std::size_t value_start = separator + 1;
      std::size_t value_end = line_end;

      while (value_start < value_end && (bytes[value_start] == ' ' || bytes[value_start] == '\t')) {
        value_start += 1;
      }

      while (value_end > value_start && (bytes[value_end - 1] == ' ' || bytes[value_end - 1] == '\t')) {
        value_end -= 1;
      }

      const std::span<const char> raw_name = bytes.subspan(cursor, separator - cursor);
      const inox::StringView raw_value(bytes.data() + value_start, value_end - value_start);
      inox::String name = normalizedHeaderName(raw_name);

      if (inox::thrown()) {
        return inox::Value();
      }

      bool merged = false;

      for (ResponseHeader& header : headers) {
        if (!equalsIgnoreCase(header.name, name)) {
          continue;
        }

        const inox::StringView previous = header.value;
        std::string combined;
        combined.reserve(previous.len + 2 + raw_value.len);
        combined.append(previous.bytes, previous.len);
        combined.append(", ");
        combined.append(raw_value.bytes, raw_value.len);
        header.value = inox::String(combined.data(), combined.size());
        merged = true;
        break;
      }

      if (!merged) {
        headers.push_back(ResponseHeader{std::move(name), inox::String(raw_value)});
      }

      if (inox::thrown()) {
        return inox::Value();
      }

      cursor = line_end + 2;
    }
  } catch (const std::bad_alloc&) {
    throwHttpError("TypeError: HTTP header allocation failed");
    return inox::Value();
  }

  inox_allocator* allocator = &inox_default_allocator;
  auto* shape = static_cast<inox_shape*>(allocator->alloc(allocator->user, sizeof(inox_shape), alignof(inox_shape)));

  if (shape == nullptr) {
    throwHttpError("TypeError: HTTP header allocation failed");
    return inox::Value();
  }

  auto* fields = headers.empty()
    ? static_cast<inox_field_info*>(nullptr)
    : static_cast<inox_field_info*>(allocator->alloc(
        allocator->user,
        sizeof(inox_field_info) * headers.size(),
        alignof(inox_field_info)
      ));

  if (!headers.empty() && fields == nullptr) {
    allocator->free(allocator->user, shape, sizeof(inox_shape), alignof(inox_shape));
    throwHttpError("TypeError: HTTP header allocation failed");
    return inox::Value();
  }

  for (std::size_t index = 0; index < headers.size(); index += 1) {
    fields[index] = {nullptr, INOX_FIELD_READONLY};
  }

  std::size_t names_initialized = 0;

  for (; names_initialized < headers.size(); names_initialized += 1) {
    const inox::StringView name = headers[names_initialized].name;
    auto* copy = static_cast<char*>(allocator->alloc(allocator->user, name.len + 1, alignof(char)));

    if (copy == nullptr) {
      break;
    }

    std::memcpy(copy, name.bytes, name.len);
    copy[name.len] = '\0';
    fields[names_initialized].name = copy;
  }

  if (names_initialized != headers.size()) {
    for (std::size_t index = 0; index < names_initialized; index += 1) {
      allocator->free(
        allocator->user,
        const_cast<char*>(fields[index].name),
        std::strlen(fields[index].name) + 1,
        alignof(char)
      );
    }

    if (fields != nullptr) {
      allocator->free(
        allocator->user,
        fields,
        sizeof(inox_field_info) * headers.size(),
        alignof(inox_field_info)
      );
    }

    allocator->free(allocator->user, shape, sizeof(inox_shape), alignof(inox_shape));
    throwHttpError("TypeError: HTTP header allocation failed");
    return inox::Value();
  }

  shape->field_count = static_cast<std::uint32_t>(headers.size());
  shape->fields = fields;
  inox_value object = inox_undefined_value();
  const inox_status status = inox_object_new(allocator, shape, &object);

  if (status != INOX_OK) {
    for (std::size_t index = 0; index < headers.size(); index += 1) {
      allocator->free(
        allocator->user,
        const_cast<char*>(fields[index].name),
        std::strlen(fields[index].name) + 1,
        alignof(char)
      );
    }

    if (fields != nullptr) {
      allocator->free(
        allocator->user,
        fields,
        sizeof(inox_field_info) * headers.size(),
        alignof(inox_field_info)
      );
    }

    allocator->free(allocator->user, shape, sizeof(inox_shape), alignof(inox_shape));
    throwHttpError("TypeError: HTTP header allocation failed");
    return inox::Value();
  }

  auto* instance = reinterpret_cast<inox_object*>(object.as.ref);
  instance->header.flags |= INOX_OBJECT_OWNED_SHAPE;

  for (std::uint32_t index = 0; index < shape->field_count; index += 1) {
    if (inox_object_init_known(object, index, headers[index].value.raw()) != INOX_OK) {
      inox_release(object);
      throwHttpError("TypeError: HTTP header initialization failed");
      return inox::Value();
    }
  }

  return inox::adopt(object);
}

ChunkedRequestDecodeResult decodeChunkedRequestBody(
  std::span<const char> bytes,
  std::size_t body_limit,
  std::vector<char>& body,
  std::size_t& consumed
) {
  const std::size_t missing = std::numeric_limits<std::size_t>::max();
  std::size_t cursor = 0;
  std::size_t framing_bytes = 0;
  std::size_t trailer_count = 0;
  body.clear();
  consumed = 0;

  for (;;) {
    const std::size_t line_end = findCrlf(bytes, cursor);

    if (line_end == missing) {
      return bytes.size() - cursor > maxChunkMetadataLineBytes
        ? ChunkedRequestDecodeResult::too_large
        : ChunkedRequestDecodeResult::incomplete;
    }

    const std::size_t extension = findByte(bytes, cursor, line_end, ';');
    const std::size_t size_end = extension == missing ? line_end : extension;

    if (size_end == cursor ||
        !validHeaderValue(inox::StringView(bytes.data() + cursor, line_end - cursor))) {
      return ChunkedRequestDecodeResult::invalid;
    }

    const std::size_t size_line_bytes = line_end + 2 - cursor;

    if (framing_bytes > maxRequestChunkFramingBytes ||
        size_line_bytes > maxRequestChunkFramingBytes - framing_bytes) {
      return ChunkedRequestDecodeResult::too_large;
    }

    framing_bytes += size_line_bytes;
    std::size_t chunk_size = 0;

    for (std::size_t index = cursor; index < size_end; index += 1) {
      const unsigned char byte = static_cast<unsigned char>(bytes[index]);
      std::size_t digit = 0;

      if (byte >= '0' && byte <= '9') digit = byte - '0';
      else if (byte >= 'a' && byte <= 'f') digit = byte - 'a' + 10;
      else if (byte >= 'A' && byte <= 'F') digit = byte - 'A' + 10;
      else return ChunkedRequestDecodeResult::invalid;

      if (digit > body_limit || chunk_size > (body_limit - digit) / 16) {
        return ChunkedRequestDecodeResult::too_large;
      }

      chunk_size = chunk_size * 16 + digit;
    }

    cursor = line_end + 2;

    if (chunk_size == 0) {
      break;
    }

    if (body.size() > body_limit || chunk_size > body_limit - body.size()) {
      return ChunkedRequestDecodeResult::too_large;
    }

    if (bytes.size() - cursor < chunk_size) {
      return ChunkedRequestDecodeResult::incomplete;
    }

    body.insert(
      body.end(),
      bytes.begin() + static_cast<std::ptrdiff_t>(cursor),
      bytes.begin() + static_cast<std::ptrdiff_t>(cursor + chunk_size)
    );
    cursor += chunk_size;

    if (bytes.size() - cursor < 2) {
      return ChunkedRequestDecodeResult::incomplete;
    }

    if (bytes[cursor] != '\r' || bytes[cursor + 1] != '\n') {
      return ChunkedRequestDecodeResult::invalid;
    }

    if (framing_bytes > maxRequestChunkFramingBytes - 2) {
      return ChunkedRequestDecodeResult::too_large;
    }

    framing_bytes += 2;
    cursor += 2;
  }

  for (;;) {
    const std::size_t line_end = findCrlf(bytes, cursor);

    if (line_end == missing) {
      return bytes.size() - cursor > maxChunkMetadataLineBytes
        ? ChunkedRequestDecodeResult::too_large
        : ChunkedRequestDecodeResult::incomplete;
    }

    const std::size_t trailer_line_bytes = line_end + 2 - cursor;

    if (framing_bytes > maxRequestChunkFramingBytes ||
        trailer_line_bytes > maxRequestChunkFramingBytes - framing_bytes) {
      return ChunkedRequestDecodeResult::too_large;
    }

    framing_bytes += trailer_line_bytes;

    if (line_end == cursor) {
      cursor += 2;
      consumed = cursor;
      return ChunkedRequestDecodeResult::ready;
    }

    const std::size_t separator = findByte(bytes, cursor, line_end, ':');

    if (separator == missing || separator == cursor) {
      return ChunkedRequestDecodeResult::invalid;
    }

    std::size_t value_start = separator + 1;
    std::size_t value_end = line_end;

    while (value_start < value_end && (bytes[value_start] == ' ' || bytes[value_start] == '\t')) {
      value_start += 1;
    }

    while (value_end > value_start && (bytes[value_end - 1] == ' ' || bytes[value_end - 1] == '\t')) {
      value_end -= 1;
    }

    const std::span<const char> name = bytes.subspan(cursor, separator - cursor);
    const inox::StringView value(bytes.data() + value_start, value_end - value_start);
    trailer_count += 1;

    if (trailer_count > maxRequestHeaders ||
        !validHeaderName(inox::StringView(name.data(), name.size())) ||
        !validHeaderValue(value) ||
        spanEqualsIgnoreCase(name, "Content-Length") ||
        spanEqualsIgnoreCase(name, "Transfer-Encoding")) {
      return ChunkedRequestDecodeResult::invalid;
    }

    cursor = line_end + 2;
  }
}

ParsedRequest parseRequest(std::span<const char> bytes) {
  const std::size_t missing = std::numeric_limits<std::size_t>::max();
  const std::size_t header_end = findHeaderEnd(bytes);

  if (header_end == missing) {
    return {bytes.size() >= maxRequestBytes ? RequestParseResult::too_large : RequestParseResult::incomplete, 0, 0, 0, 0};
  }

  if (header_end > maxRequestBytes) {
    return {RequestParseResult::too_large, 0, 0, 0, 0};
  }

  const std::size_t request_line_end = findCrlf(bytes, 0);

  if (request_line_end == missing || request_line_end + 2 > header_end) {
    return {RequestParseResult::invalid, 0, 0, 0, 0};
  }

  const std::size_t method_end = findByte(bytes, 0, request_line_end, ' ');

  if (method_end == missing || method_end == 0) {
    return {RequestParseResult::invalid, 0, 0, 0, 0};
  }

  const std::size_t url_start = method_end + 1;
  const std::size_t url_end = findByte(bytes, url_start, request_line_end, ' ');

  if (url_end == missing || url_end == url_start) {
    return {RequestParseResult::invalid, 0, 0, 0, 0};
  }

  const std::span<const char> version = bytes.subspan(url_end + 1, request_line_end - url_end - 1);

  if (version.size() != 8 || (std::memcmp(version.data(), "HTTP/1.1", 8) != 0 &&
                              std::memcmp(version.data(), "HTTP/1.0", 8) != 0)) {
    return {RequestParseResult::invalid, 0, 0, 0, 0};
  }

  std::size_t content_length = 0;
  bool has_content_length = false;
  bool chunked = false;
  bool connection_close = false;
  bool connection_keep_alive = false;
  std::size_t header_count = 0;
  std::size_t cursor = request_line_end + 2;

  while (cursor + 2 < header_end) {
    const std::size_t line_end = findCrlf(bytes, cursor);

    if (line_end == missing || line_end + 2 > header_end) {
      return {RequestParseResult::invalid, 0, 0, 0, 0};
    }

    if (line_end == cursor) {
      break;
    }

    header_count += 1;

    if (header_count > maxRequestHeaders) {
      return {RequestParseResult::too_large, 0, 0, 0, 0};
    }

    const std::size_t separator = findByte(bytes, cursor, line_end, ':');

    if (separator == missing || separator == cursor) {
      return {RequestParseResult::invalid, 0, 0, 0, 0};
    }

    std::size_t value_start = separator + 1;
    std::size_t value_end = line_end;

    while (value_start < value_end && (bytes[value_start] == ' ' || bytes[value_start] == '\t')) {
      value_start += 1;
    }

    while (value_end > value_start && (bytes[value_end - 1] == ' ' || bytes[value_end - 1] == '\t')) {
      value_end -= 1;
    }

    const std::span<const char> name = bytes.subspan(cursor, separator - cursor);
    const std::span<const char> value = bytes.subspan(value_start, value_end - value_start);

    if (!validHeaderName(inox::StringView(name.data(), name.size())) ||
        !validHeaderValue(inox::StringView(value.data(), value.size()))) {
      return {RequestParseResult::invalid, 0, 0, 0, 0};
    }

    if (spanEqualsIgnoreCase(name, "Transfer-Encoding")) {
      if (chunked || !spanEqualsIgnoreCase(value, "chunked")) {
        return {RequestParseResult::invalid, 0, 0, 0, 0};
      }

      chunked = true;
    }

    if (spanEqualsIgnoreCase(name, "Connection")) {
      connection_close = connection_close || headerValueHasToken(value, "close");
      connection_keep_alive = connection_keep_alive || headerValueHasToken(value, "keep-alive");
    }

    if (spanEqualsIgnoreCase(name, "Content-Length")) {
      if (value.empty()) {
        return {RequestParseResult::invalid, 0, 0, 0, 0};
      }

      std::size_t parsed = 0;

      for (const char digit : value) {
        if (digit < '0' || digit > '9') {
          return {RequestParseResult::invalid, 0, 0, 0, 0};
        }

        const std::size_t number = static_cast<std::size_t>(digit - '0');

        if (parsed > (std::numeric_limits<std::size_t>::max() - number) / 10) {
          return {RequestParseResult::too_large, 0, 0, 0, 0};
        }

        parsed = parsed * 10 + number;
      }

      if (has_content_length && parsed != content_length) {
        return {RequestParseResult::invalid, 0, 0, 0, 0};
      }

      content_length = parsed;
      has_content_length = true;
    }

    cursor = line_end + 2;
  }

  if (chunked && has_content_length) {
    return {RequestParseResult::invalid, 0, 0, 0, 0};
  }

  if (content_length > maxRequestBytes - header_end) {
    return {RequestParseResult::too_large, 0, 0, 0, 0};
  }

  if (bytes.size() < header_end + content_length) {
    return {RequestParseResult::incomplete, 0, 0, 0, 0};
  }

  return {
    RequestParseResult::ready,
    0,
    method_end,
    url_start,
    url_end - url_start,
    url_end + 6,
    3,
    request_line_end + 2,
    header_end - 2,
    header_end,
    content_length,
    chunked,
    (!connection_close && version[7] == '1') || (!connection_close && connection_keep_alive),
  };
}

enum class ResponseParseResult {
  incomplete,
  ready,
  invalid,
  too_large,
};

struct ParsedResponse {
  ResponseParseResult result;
  double status_code;
  std::size_t version_start;
  std::size_t version_length;
  std::size_t status_message_start;
  std::size_t status_message_length;
  std::size_t headers_start;
  std::size_t headers_end;
  std::size_t body_start;
  std::optional<std::size_t> content_length;
  bool chunked;
  bool keep_alive;
};

ParsedResponse parseResponse(std::span<const char> bytes) {
  const std::size_t missing = std::numeric_limits<std::size_t>::max();
  const std::size_t header_end = findHeaderEnd(bytes);

  if (header_end == missing) {
    return {bytes.size() >= maxResponseHeaderBytes ? ResponseParseResult::too_large : ResponseParseResult::incomplete};
  }

  if (header_end > maxResponseHeaderBytes) {
    return {ResponseParseResult::too_large};
  }

  const std::size_t status_line_end = findCrlf(bytes, 0);

  if (status_line_end == missing || status_line_end + 2 > header_end || status_line_end < 12) {
    return {ResponseParseResult::invalid};
  }

  const std::size_t version_end = findByte(bytes, 0, status_line_end, ' ');

  if (version_end != 8 || (std::memcmp(bytes.data(), "HTTP/1.1", 8) != 0 &&
                           std::memcmp(bytes.data(), "HTTP/1.0", 8) != 0)) {
    return {ResponseParseResult::invalid};
  }

  const std::size_t status_start = version_end + 1;

  if (status_start + 3 > status_line_end || bytes[status_start] < '0' || bytes[status_start] > '9' ||
      bytes[status_start + 1] < '0' || bytes[status_start + 1] > '9' ||
      bytes[status_start + 2] < '0' || bytes[status_start + 2] > '9') {
    return {ResponseParseResult::invalid};
  }

  const double status_code = static_cast<double>(
    (bytes[status_start] - '0') * 100 + (bytes[status_start + 1] - '0') * 10 + (bytes[status_start + 2] - '0')
  );
  std::size_t message_start = status_start + 3;

  if (message_start < status_line_end && bytes[message_start] == ' ') {
    message_start += 1;
  }

  std::optional<std::size_t> content_length;
  bool chunked = false;
  bool connection_close = false;
  bool connection_keep_alive = false;
  std::size_t header_count = 0;
  std::size_t cursor = status_line_end + 2;

  while (cursor + 2 < header_end) {
    const std::size_t line_end = findCrlf(bytes, cursor);

    if (line_end == missing || line_end + 2 > header_end) {
      return {ResponseParseResult::invalid};
    }

    if (line_end == cursor) {
      break;
    }

    header_count += 1;

    if (header_count > maxResponseHeaders) {
      return {ResponseParseResult::too_large};
    }

    const std::size_t separator = findByte(bytes, cursor, line_end, ':');

    if (separator == missing || separator == cursor) {
      return {ResponseParseResult::invalid};
    }

    std::size_t value_start = separator + 1;
    std::size_t value_end = line_end;

    while (value_start < value_end && (bytes[value_start] == ' ' || bytes[value_start] == '\t')) {
      value_start += 1;
    }

    while (value_end > value_start && (bytes[value_end - 1] == ' ' || bytes[value_end - 1] == '\t')) {
      value_end -= 1;
    }

    const std::span<const char> name = bytes.subspan(cursor, separator - cursor);
    const std::span<const char> value = bytes.subspan(value_start, value_end - value_start);

    if (!validHeaderName(inox::StringView(name.data(), name.size())) ||
        !validHeaderValue(inox::StringView(value.data(), value.size()))) {
      return {ResponseParseResult::invalid};
    }

    if (spanEqualsIgnoreCase(name, "Transfer-Encoding")) {
      if (chunked || !spanEqualsIgnoreCase(value, "chunked")) {
        return {ResponseParseResult::invalid};
      }

      chunked = true;
    }

    if (spanEqualsIgnoreCase(name, "Connection")) {
      connection_close = connection_close || headerValueHasToken(value, "close");
      connection_keep_alive = connection_keep_alive || headerValueHasToken(value, "keep-alive");
    }

    if (spanEqualsIgnoreCase(name, "Content-Length")) {
      if (value.empty()) {
        return {ResponseParseResult::invalid};
      }

      std::size_t parsed = 0;

      for (const char digit : value) {
        if (digit < '0' || digit > '9') {
          return {ResponseParseResult::invalid};
        }

        const std::size_t number = static_cast<std::size_t>(digit - '0');

        if (parsed > (maxClientResponseBytes - number) / 10) {
          return {ResponseParseResult::too_large};
        }

        parsed = parsed * 10 + number;
      }

      if (content_length && *content_length != parsed) {
        return {ResponseParseResult::invalid};
      }

      content_length = parsed;
    }

    cursor = line_end + 2;
  }

  if (content_length && *content_length > maxClientResponseBytes) {
    return {ResponseParseResult::too_large};
  }

  if (chunked && content_length) {
    return {ResponseParseResult::invalid};
  }

  return {
    ResponseParseResult::ready,
    status_code,
    0,
    version_end,
    message_start,
    status_line_end - message_start,
    status_line_end + 2,
    header_end - 2,
    header_end,
    content_length,
    chunked,
    (!connection_close && bytes[7] == '1') || (!connection_close && connection_keep_alive),
  };
}

void callHttpListeners(const std::vector<inox::Callback>& source, std::span<const inox::Value> arguments = {}) {
  try {
    const std::vector<inox::Callback> listeners = source;

    for (const inox::Callback& listener : listeners) {
      inox::Value result = listener.call(arguments);
      (void)result;

      if (inox::thrown()) {
        return;
      }
    }
  } catch (const std::bad_alloc&) {
    throwHttpError("TypeError: HTTP listener snapshot allocation failed");
  }
}

void HttpRequestState::emitClose() {
  if (closed_) {
    return;
  }

  closed_ = true;
  callHttpListeners(close_listeners_);
}

void HttpRequestState::emitData(inox::StringView data) {
  if (ended_ || closed_ || data.len == 0) {
    return;
  }

  const inox::String chunk(data);

  if (!inox::thrown()) {
    const std::array<inox::Value, 1> arguments = {chunk};
    callHttpListeners(data_listeners_, arguments);
  }
}

void HttpRequestState::emitEnd() {
  if (ended_ || closed_) {
    return;
  }

  ended_ = true;
  callHttpListeners(end_listeners_);
}

void HttpRequestState::emitError(const inox::Value& error) {
  if (closed_) {
    return;
  }

  const std::array<inox::Value, 1> arguments = {error};
  callHttpListeners(error_listeners_, arguments);
}

void HttpRequestState::on(inox::StringView event_name, inox::Callback listener) {
  if (!listener.valid()) {
    throwHttpError("TypeError: IncomingMessage.on requires a function");
    return;
  }

  std::vector<inox::Callback>* listeners = nullptr;

  if (hasText(event_name, "data")) listeners = &data_listeners_;
  else if (hasText(event_name, "end")) listeners = &end_listeners_;
  else if (hasText(event_name, "close")) listeners = &close_listeners_;
  else if (hasText(event_name, "error")) listeners = &error_listeners_;
  else {
    throwHttpError("TypeError: unsupported IncomingMessage event");
    return;
  }

  try {
    listeners->push_back(std::move(listener));
  } catch (const std::bad_alloc&) {
    throwHttpError("TypeError: IncomingMessage listener allocation failed");
  }
}

const char* statusText(int status) {
  switch (status) {
    case 100:
      return "Continue";
    case 200:
      return "OK";
    case 201:
      return "Created";
    case 202:
      return "Accepted";
    case 204:
      return "No Content";
    case 301:
      return "Moved Permanently";
    case 302:
      return "Found";
    case 304:
      return "Not Modified";
    case 400:
      return "Bad Request";
    case 401:
      return "Unauthorized";
    case 403:
      return "Forbidden";
    case 404:
      return "Not Found";
    case 405:
      return "Method Not Allowed";
    case 413:
      return "Payload Too Large";
    case 500:
      return "Internal Server Error";
    case 501:
      return "Not Implemented";
    case 503:
      return "Service Unavailable";
    default:
      return "Unknown";
  }
}

HttpServerState::HttpServerState()
  : net_server_(), request_listeners_(), connections_(), native_owner_(), closed_(false) {}

std::shared_ptr<HttpServerState> HttpServerState::create(inox::Callback listener) {
  std::shared_ptr<HttpServerState> server;

  try {
    server = std::make_shared<HttpServerState>();
  } catch (const std::bad_alloc&) {
    throwHttpError("TypeError: HttpServer allocation failed");
    return {};
  }

  if (listener.valid()) {
    try {
      server->request_listeners_.push_back(std::move(listener));
    } catch (const std::bad_alloc&) {
      throwHttpError("TypeError: HttpServer listener allocation failed");
      return {};
    }
  }

  server->native_owner_ = server;
  inox::Callback connection = makeWeakCallback(server, onServerConnection);
  inox::Callback close = makeWeakCallback(server, onServerClose);

  if (inox::thrown()) {
    server->native_owner_.reset();
    return {};
  }

  server->net_server_ = net.createServer(std::move(connection));

  if (inox::thrown()) {
    server->native_owner_.reset();
    return {};
  }

  server->net_server_.on("close", std::move(close));

  if (inox::thrown()) {
    server->net_server_.close();
    server->native_owner_.reset();
    return {};
  }

  return server;
}

void HttpServerState::accept(NetSocket socket) {
  if (closed_) {
    socket.destroy();
    return;
  }

  std::shared_ptr<HttpConnectionState> connection = HttpConnectionState::create(
    shared_from_this(),
    std::move(socket)
  );

  if (!connection) {
    return;
  }

  try {
    connections_.push_back(connection);
  } catch (const std::bad_alloc&) {
    connection->socket_.destroy();
    throwHttpError("TypeError: HTTP connection tracking failed");
  }
}

void HttpServerState::close(inox::Callback callback) {
  if (closed_) {
    throwHttpError("TypeError: HttpServer.close failed");
    return;
  }

  net_server_.close(std::move(callback));

  if (!inox::thrown()) {
    closed_ = true;

    for (const std::weak_ptr<HttpConnectionState>& weak_connection : connections_) {
      const std::shared_ptr<HttpConnectionState> connection = weak_connection.lock();

      if (connection && !connection->request_dispatched_) {
        connection->socket_.destroy();
      }
    }
  }
}

void HttpServerState::connectionClosed(const HttpConnectionState* connection) {
  for (auto iterator = connections_.begin(); iterator != connections_.end();) {
    const std::shared_ptr<HttpConnectionState> existing = iterator->lock();

    if (!existing || existing.get() == connection) {
      iterator = connections_.erase(iterator);
    } else {
      iterator += 1;
    }
  }
}

void HttpServerState::listen(
  double port,
  inox::StringView host,
  double backlog,
  inox::Callback callback
) {
  if (closed_) {
    throwHttpError("TypeError: HttpServer.listen failed");
    return;
  }

  net_server_.listen(port, host, backlog, std::move(callback));
}

void HttpServerState::on(inox::StringView event_name, inox::Callback listener) {
  if (!hasText(event_name, "request") || !listener.valid() || closed_) {
    throwHttpError("TypeError: HttpServer.on supports only request listeners");
    return;
  }

  try {
    request_listeners_.push_back(std::move(listener));
  } catch (const std::bad_alloc&) {
    throwHttpError("TypeError: HttpServer listener allocation failed");
  }
}

void HttpServerState::onNetClosed() {
  std::shared_ptr<HttpServerState> owner = native_owner_;
  closed_ = true;
  native_owner_.reset();
}

HttpConnectionState::HttpConnectionState(std::shared_ptr<HttpServerState> server, NetSocket socket)
  : server_(std::move(server)),
    socket_(std::move(socket)),
    request_bytes_(),
    native_owner_(),
    active_request_bytes_(0),
    active_keep_alive_(false),
    active_http_1_0_(false),
    request_dispatched_(false),
    closed_(false) {}

std::shared_ptr<HttpConnectionState> HttpConnectionState::create(
  const std::shared_ptr<HttpServerState>& server,
  NetSocket socket
) {
  std::shared_ptr<HttpConnectionState> connection;

  try {
    connection = std::make_shared<HttpConnectionState>(server, socket);
    connection->request_bytes_.reserve(4096);
  } catch (const std::bad_alloc&) {
    socket.destroy();
    throwHttpError("TypeError: HTTP connection allocation failed");
    return {};
  }

  connection->native_owner_ = connection;
  inox::Callback close = makeWeakCallback(connection, onConnectionClose);
  inox::Callback data = makeWeakCallback(connection, onConnectionData);
  inox::Callback error = makeWeakCallback(connection, onConnectionError);

  if (inox::thrown()) {
    connection->socket_.destroy();
    return {};
  }

  connection->socket_.on("close", std::move(close));

  if (!inox::thrown()) {
    connection->socket_.on("error", std::move(error));
  }

  if (!inox::thrown()) {
    connection->socket_.on("data", std::move(data));
  }

  if (inox::thrown()) {
    connection->socket_.destroy();
    return {};
  }

  return connection;
}

void HttpConnectionState::onClose() {
  std::shared_ptr<HttpConnectionState> owner = native_owner_;
  closed_ = true;

  if (server_) {
    server_->connectionClosed(this);
  }

  server_.reset();
  request_bytes_.clear();
  native_owner_.reset();
}

void HttpConnectionState::completeResponse(bool keep_alive) {
  if (closed_) {
    return;
  }

  if (!keep_alive || !server_ || server_->closed_) {
    socket_.destroy();
    return;
  }

  if (active_request_bytes_ > request_bytes_.size()) {
    socket_.destroy();
    return;
  }

  request_bytes_.erase(
    request_bytes_.begin(),
    request_bytes_.begin() + static_cast<std::ptrdiff_t>(active_request_bytes_)
  );
  active_request_bytes_ = 0;
  active_keep_alive_ = false;
  active_http_1_0_ = false;
  request_dispatched_ = false;
  onData(inox::StringView());
}

void HttpConnectionState::onData(inox::StringView data) {
  if (closed_) {
    return;
  }

  constexpr std::size_t max_wire_bytes = maxRequestBytes + maxRequestChunkFramingBytes;
  constexpr std::size_t max_buffered_bytes = max_wire_bytes * 2;

  if (request_bytes_.size() > max_buffered_bytes || data.len > max_buffered_bytes - request_bytes_.size()) {
    if (request_dispatched_) {
      socket_.destroy();
    } else {
      request_dispatched_ = true;
      sendError(413, "payload too large");
    }
    return;
  }

  if (data.len > 0) {
    try {
      request_bytes_.insert(request_bytes_.end(), data.bytes, data.bytes + data.len);
    } catch (const std::bad_alloc&) {
      if (request_dispatched_) {
        socket_.destroy();
      } else {
        request_dispatched_ = true;
        sendError(500, "internal server error");
      }
      return;
    }
  }

  if (request_dispatched_) {
    return;
  }

  const ParsedRequest parsed = parseRequest(request_bytes_);

  if (parsed.result == RequestParseResult::incomplete) {
    return;
  }

  if (parsed.result == RequestParseResult::too_large) {
    request_dispatched_ = true;
    sendError(413, "payload too large");
    return;
  }

  if (parsed.result == RequestParseResult::invalid) {
    request_dispatched_ = true;
    sendError(400, "bad request");
    return;
  }

  std::vector<char> decoded_body;
  std::size_t request_size = parsed.body_start + parsed.body_length;
  std::span<const char> request_body(
    request_bytes_.data() + parsed.body_start,
    parsed.body_length
  );

  if (parsed.chunked) {
    ChunkedRequestDecodeResult decoded = ChunkedRequestDecodeResult::invalid;
    std::size_t consumed = 0;

    try {
      decoded = decodeChunkedRequestBody(
        std::span<const char>(
          request_bytes_.data() + parsed.body_start,
          request_bytes_.size() - parsed.body_start
        ),
        maxRequestBytes - parsed.body_start,
        decoded_body,
        consumed
      );
    } catch (const std::bad_alloc&) {
      request_dispatched_ = true;
      sendError(500, "internal server error");
      return;
    }

    if (decoded == ChunkedRequestDecodeResult::incomplete) {
      return;
    }

    if (decoded == ChunkedRequestDecodeResult::too_large) {
      request_dispatched_ = true;
      sendError(413, "payload too large");
      return;
    }

    if (decoded != ChunkedRequestDecodeResult::ready) {
      request_dispatched_ = true;
      sendError(400, "bad request");
      return;
    }

    request_body = decoded_body;
    request_size = parsed.body_start + consumed;
  }

  active_request_bytes_ = request_size;
  active_keep_alive_ = parsed.keep_alive;
  active_http_1_0_ =
    parsed.version_length == 3 &&
    std::memcmp(request_bytes_.data() + parsed.version_start, "1.0", 3) == 0;
  request_dispatched_ = true;
  std::shared_ptr<HttpRequestState> request;
  std::shared_ptr<HttpResponseState> response;
  inox::Value headers = materializeRequestHeaders(
    request_bytes_,
    parsed.headers_start,
    parsed.headers_end
  );

  if (inox::thrown()) {
    socket_.destroy();
    return;
  }

  try {
    request = std::make_shared<HttpRequestState>(
      std::move(headers),
      inox::String(request_bytes_.data() + parsed.version_start, parsed.version_length),
      inox::String(request_bytes_.data() + parsed.method_start, parsed.method_length),
      socket_,
      inox::String(request_bytes_.data() + parsed.url_start, parsed.url_length)
    );
    response = std::make_shared<HttpResponseState>(shared_from_this());
  } catch (const std::bad_alloc&) {
    sendError(500, "internal server error");
    return;
  }

  if (inox::thrown()) {
    socket_.destroy();
    return;
  }

  HttpRequest request_value = materializeRequest(request);
  HttpResponse response_value = materializeResponse(response);

  if (inox::thrown()) {
    socket_.destroy();
    return;
  }

  try {
    const std::array<inox::Value, 2> arguments = {request_value, response_value};
    callHttpListeners(server_->request_listeners_, arguments);

    if (!inox::thrown()) {
      request->emitData(inox::StringView(request_body.data(), request_body.size()));
    }

    if (!inox::thrown()) {
      request->emitEnd();
    }
  } catch (const std::bad_alloc&) {
    throwHttpError("TypeError: HTTP request body delivery failed");
  }

  if (inox::thrown()) {
    socket_.destroy();
  }
}

void HttpConnectionState::sendError(double status, inox::StringView message) {
  std::shared_ptr<HttpResponseState> response;

  try {
    response = std::make_shared<HttpResponseState>(shared_from_this());
  } catch (const std::bad_alloc&) {
    socket_.destroy();
    throwHttpError("TypeError: HTTP response allocation failed");
    return;
  }

  response->setStatusCode(status);

  if (!inox::thrown()) {
    response->setHeader("Content-Type", "text/plain; charset=utf-8");
  }

  if (!inox::thrown()) {
    response->end(std::span<const std::uint8_t>(
      reinterpret_cast<const std::uint8_t*>(message.bytes),
      message.len
    ));
  }

  if (inox::thrown()) {
    socket_.destroy();
  }
}

bool parseClientUrl(
  inox::StringView url,
  HttpClientTransportKind transport_kind,
  inox::String& host,
  double& port,
  inox::String& path
) {
  if (url.len == 0) {
    return true;
  }

  const bool secure = transport_kind == HttpClientTransportKind::tls;
  constexpr char http_prefix[] = "http://";
  constexpr char https_prefix[] = "https://";
  const char* prefix = secure ? https_prefix : http_prefix;
  const std::size_t prefix_length = secure ? sizeof(https_prefix) - 1 : sizeof(http_prefix) - 1;

  if (url.len < prefix_length || std::memcmp(url.bytes, prefix, prefix_length) != 0) {
    throwHttpError(
      secure
        ? "TypeError: node:https request URL must use https://"
        : "TypeError: node:http request URL must use http://"
    );
    return false;
  }

  std::size_t cursor = prefix_length;
  const std::size_t host_start = cursor;

  while (cursor < url.len && url.bytes[cursor] != ':' && url.bytes[cursor] != '/' &&
         url.bytes[cursor] != '?' && url.bytes[cursor] != '#') {
    cursor += 1;
  }

  if (cursor == host_start) {
    throwHttpError(
      secure
        ? "TypeError: node:https request URL requires a host"
        : "TypeError: node:http request URL requires a host"
    );
    return false;
  }

  host = inox::String(url.bytes + host_start, cursor - host_start);

  if (inox::thrown()) {
    return false;
  }

  port = secure ? 443 : 80;

  if (cursor < url.len && url.bytes[cursor] == ':') {
    cursor += 1;
    std::size_t parsed_port = 0;
    const std::size_t port_start = cursor;

    while (cursor < url.len && url.bytes[cursor] >= '0' && url.bytes[cursor] <= '9') {
      parsed_port = parsed_port * 10 + static_cast<std::size_t>(url.bytes[cursor] - '0');
      cursor += 1;
    }

    if (cursor == port_start || parsed_port == 0 || parsed_port > 65535) {
      throwHttpError(
        secure
          ? "TypeError: node:https request URL port is invalid"
          : "TypeError: node:http request URL port is invalid"
      );
      return false;
    }

    port = static_cast<double>(parsed_port);
  }

  std::size_t path_start = cursor;

  if (cursor < url.len && url.bytes[cursor] == '?') {
    std::string query_path;

    try {
      query_path.reserve(url.len - cursor + 1);
      query_path.push_back('/');
      query_path.append(url.bytes + cursor, url.len - cursor);
    } catch (const std::bad_alloc&) {
      throwHttpError(
        secure
          ? "TypeError: node:https request URL allocation failed"
          : "TypeError: node:http request URL allocation failed"
      );
      return false;
    }

    const std::size_t fragment = query_path.find('#');
    path = inox::String(query_path.data(), fragment == std::string::npos ? query_path.size() : fragment);
    return !inox::thrown();
  }

  if (cursor >= url.len || url.bytes[cursor] == '#') {
    path = inox::String("/");
    return !inox::thrown();
  }

  while (cursor < url.len && url.bytes[cursor] != '#') {
    cursor += 1;
  }

  path = inox::String(url.bytes + path_start, cursor - path_start);
  return !inox::thrown();
}

bool validClientConfiguration(
  inox::StringView host,
  double port,
  inox::StringView method,
  inox::StringView path,
  HttpClientTransportKind transport_kind
) {
  if (host.len == 0 || !validHeaderValue(host) || !std::isfinite(port) || std::floor(port) != port ||
      port < 1 || port > 65535 || !validHeaderName(method) || path.len == 0 || path.bytes[0] != '/' ||
      !validHeaderValue(path)) {
    throwHttpError(
      transport_kind == HttpClientTransportKind::tls
        ? "TypeError: node:https request options are invalid"
        : "TypeError: node:http request options are invalid"
    );
    return false;
  }

  return true;
}

constexpr std::size_t maxIdleClientConnections = 8;
constexpr double idleClientConnectionTimeoutMs = 5000;
std::vector<std::shared_ptr<HttpClientConnectionState>> idleClientConnections;

struct IdleClientConnectionContext {
  std::weak_ptr<HttpClientConnectionState> connection;
  std::size_t generation;
};

inox_status expireIdleClientConnection(void* raw_context) {
  auto* context = static_cast<IdleClientConnectionContext*>(raw_context);
  std::shared_ptr<HttpClientConnectionState> connection = context == nullptr
    ? std::shared_ptr<HttpClientConnectionState>()
    : context->connection.lock();

  if (!connection || connection->request_ || connection->idle_generation_ != context->generation) {
    return INOX_OK;
  }

  for (auto iterator = idleClientConnections.begin(); iterator != idleClientConnections.end(); iterator += 1) {
    if (*iterator == connection) {
      idleClientConnections.erase(iterator);
      if (!connection->closed_) connection->destroy();
      break;
    }
  }

  return INOX_OK;
}

void finalizeIdleClientConnection(void* raw_context) {
  delete static_cast<IdleClientConnectionContext*>(raw_context);
}

bool sameString(inox::StringView left, inox::StringView right) {
  return left.len == right.len &&
    (left.len == 0 || std::memcmp(left.bytes, right.bytes, left.len) == 0);
}

std::shared_ptr<HttpClientConnectionState> takeIdleClientConnection(
  inox::StringView host,
  double port,
  const HttpClientTransportOptions& transport
) {
  for (auto iterator = idleClientConnections.begin(); iterator != idleClientConnections.end();) {
    const std::shared_ptr<HttpClientConnectionState>& connection = *iterator;

    if (!connection || connection->closed_) {
      iterator = idleClientConnections.erase(iterator);
      continue;
    }

    if (!connection->matches(host, port, transport)) {
      iterator += 1;
      continue;
    }

    std::shared_ptr<HttpClientConnectionState> result = std::move(*iterator);
    idleClientConnections.erase(iterator);
    result->setIdle(false);
    return result;
  }

  return {};
}

void releaseIdleClientConnection(const std::shared_ptr<HttpClientConnectionState>& connection) {
  for (auto iterator = idleClientConnections.begin(); iterator != idleClientConnections.end();) {
    if (!*iterator || (*iterator)->closed_) {
      iterator = idleClientConnections.erase(iterator);
    } else {
      iterator += 1;
    }
  }

  if (!connection || connection->closed_) {
    return;
  }

  if (idleClientConnections.size() >= maxIdleClientConnections) {
    connection->destroy();
    return;
  }

  connection->setIdle(true);

  if (connection->closed_ || connection->destroying_) {
    return;
  }

  try {
    idleClientConnections.push_back(connection);
  } catch (const std::bad_alloc&) {
    connection->destroy();
    return;
  }

  auto* context = new (std::nothrow) IdleClientConnectionContext{
    connection,
    connection->idle_generation_,
  };
  inox_timer_handle* timer = nullptr;

  if (context == nullptr ||
      inox_loop_set_timeout(
        inox::loop(),
        idleClientConnectionTimeoutMs,
        expireIdleClientConnection,
        context,
        finalizeIdleClientConnection,
        &timer
      ) != INOX_OK) {
    delete context;
    idleClientConnections.pop_back();
    connection->destroy();
    return;
  }

  inox_loop_unref_timer(timer);
}

HttpClientConnectionState::HttpClientConnectionState(
  inox::String host,
  double port,
  const HttpClientTransportOptions& transport
)
  : host_(std::move(host)),
    port_(port),
    transport_kind_(transport.kind()),
    verify_peer_(transport.verifyPeer()),
    server_name_(transport.serverName()),
    socket_(),
    tls_(nullptr),
    request_(),
    native_owner_(),
    connected_(false),
    closed_(false),
    destroying_(false),
    idle_generation_(0) {}

std::shared_ptr<HttpClientConnectionState> HttpClientConnectionState::create(
  inox::StringView host,
  double port,
  const HttpClientTransportOptions& transport
) {
  std::shared_ptr<HttpClientConnectionState> connection;

  try {
    connection = std::make_shared<HttpClientConnectionState>(inox::String(host), port, transport);
  } catch (const std::bad_alloc&) {
    inox::throw_out_of_memory();
    return {};
  }

  if (inox::thrown()) {
    return {};
  }

  connection->native_owner_ = connection;

  if (transport.kind() == HttpClientTransportKind::tls) {
    std::string host_bytes;
    std::string server_name_bytes;

    try {
      const inox::StringView connection_host = connection->host_;
      host_bytes.assign(connection_host.bytes, connection_host.len);

      if (connection->server_name_) {
        const inox::StringView server_name = *connection->server_name_;
        server_name_bytes.assign(server_name.bytes, server_name.len);
      } else {
        server_name_bytes = host_bytes;
      }
    } catch (const std::bad_alloc&) {
      inox::throw_out_of_memory();
      connection->native_owner_.reset();
      return {};
    }

    const inox_status status = inox_tls_connect(
      inox::loop(),
      host_bytes.c_str(),
      static_cast<int>(connection->port_),
      server_name_bytes.c_str(),
      connection->verify_peer_ ? 1 : 0,
      onClientTlsConnect,
      onClientTlsData,
      onClientTlsClose,
      connection.get(),
      &connection->tls_
    );

    if (status != INOX_OK) {
      if (status == INOX_ERR_OOM) inox::throw_out_of_memory();
      else throwHttpError("TypeError: node:https connection failed");
      connection->native_owner_.reset();
      return {};
    }

    return connection;
  }

  inox::Callback connect = makeWeakCallback(connection, onClientConnect);
  inox::Callback data = makeWeakCallback(connection, onClientData);
  inox::Callback end = makeWeakCallback(connection, onClientEnd);
  inox::Callback close = makeWeakCallback(connection, onClientClose);
  inox::Callback error = makeWeakCallback(connection, onClientError);

  if (inox::thrown()) {
    connection->native_owner_.reset();
    return {};
  }

  connection->socket_ = net.connect(connection->port_, connection->host_, std::move(connect));

  if (!inox::thrown()) connection->socket_.on("data", std::move(data));
  if (!inox::thrown()) connection->socket_.on("end", std::move(end));
  if (!inox::thrown()) connection->socket_.on("close", std::move(close));
  if (!inox::thrown()) connection->socket_.on("error", std::move(error));

  if (inox::thrown()) {
    connection->socket_.destroy();
    connection->native_owner_.reset();
    return {};
  }

  return connection;
}

bool HttpClientConnectionState::matches(
  inox::StringView host,
  double port,
  const HttpClientTransportOptions& transport
) const {
  if (closed_ || destroying_ || request_ || port_ != port || transport_kind_ != transport.kind() ||
      verify_peer_ != transport.verifyPeer() || !sameString(host_, host)) {
    return false;
  }

  const std::optional<inox::String>& expected_server_name = transport.serverName();

  if (server_name_.has_value() != expected_server_name.has_value()) {
    return false;
  }

  return !server_name_ || sameString(*server_name_, *expected_server_name);
}

bool HttpClientConnectionState::attach(const std::shared_ptr<HttpClientRequestState>& request) {
  if (!request || request_ || closed_ || destroying_) {
    return false;
  }

  request_ = request;
  request->connection_ = shared_from_this();

  if (connected_) {
    request->onConnect();
  }

  return !inox::thrown();
}

void HttpClientConnectionState::complete(
  const std::shared_ptr<HttpClientRequestState>& request
) {
  if (!request || request_ != request) {
    return;
  }

  request_.reset();
  request->connection_.reset();
  request->onClose();
  destroy();
}

bool HttpClientConnectionState::release(const std::shared_ptr<HttpClientRequestState>& request) {
  if (!request || request_ != request || closed_ || destroying_) {
    return false;
  }

  request_.reset();
  request->connection_.reset();
  releaseIdleClientConnection(shared_from_this());
  return true;
}

void HttpClientConnectionState::destroy() {
  if (closed_ || destroying_) {
    return;
  }

  destroying_ = true;

  if (transport_kind_ == HttpClientTransportKind::tls) {
    if (tls_ != nullptr) (void)inox_tls_client_destroy(tls_);
  } else {
    socket_.destroy();
  }
}

void HttpClientConnectionState::onClose() {
  if (closed_) {
    return;
  }

  std::shared_ptr<HttpClientConnectionState> owner = native_owner_;
  std::shared_ptr<HttpClientRequestState> request = std::move(request_);
  closed_ = true;
  connected_ = false;
  destroying_ = false;
  tls_ = nullptr;

  if (request) {
    request->connection_.reset();
    request->onClose();
  }

  native_owner_.reset();
}

void HttpClientConnectionState::onConnect() {
  if (closed_) {
    return;
  }

  connected_ = true;

  if (request_) {
    request_->onConnect();
  }
}

void HttpClientConnectionState::onData(inox::StringView data) {
  if (request_) {
    request_->onData(data);
  } else if (data.len > 0) {
    destroy();
  }
}

void HttpClientConnectionState::onEnd() {
  if (request_) {
    request_->onEnd();
  }
}

void HttpClientConnectionState::onError(const inox::Value& error) {
  if (request_) {
    request_->onError(error);
  } else {
    destroy();
  }
}

void HttpClientConnectionState::onWrite(inox_status status) {
  if (!request_) {
    return;
  }

  if (status == INOX_OK) {
    request_->onFinish();
  } else {
    inox::Value error = materializeHttpError(
      transport_kind_ == HttpClientTransportKind::tls
        ? "HTTPS request write failed"
        : "HTTP request write failed"
    );
    if (!inox::thrown()) request_->onError(error);
  }
}

NetSocket HttpClientConnectionState::responseSocket() const {
  if (transport_kind_ != HttpClientTransportKind::tls) {
    return socket_;
  }

  inox_value raw_socket = inox_undefined_value();

  if (tls_ == nullptr || inox_tls_client_socket(tls_, &raw_socket) != INOX_OK) {
    throwHttpError("TypeError: HTTPS response socket is unavailable");
    return NetSocket();
  }

  return NetSocket(inox::adopt(raw_socket));
}

void HttpClientConnectionState::setIdle(bool idle) {
  idle_generation_ += 1;
  NetSocket socket = responseSocket();

  if (inox::thrown()) {
    destroy();
    return;
  }

  if (idle) socket.unref();
  else socket.ref();
}

bool HttpClientConnectionState::write(inox::StringView data, bool final, bool& accepted) {
  accepted = false;

  if (!connected_ || closed_ || destroying_ || !request_) {
    return false;
  }

  if (transport_kind_ == HttpClientTransportKind::tls) {
    const inox_status status = final
      ? inox_tls_client_write_with_callback(
          tls_,
          data.bytes,
          data.len,
          onClientTlsWrite,
          this
        )
      : inox_tls_client_write(tls_, data.bytes, data.len);

    if (status != INOX_OK) {
      if (final) {
        onWrite(status);
      } else {
        inox::Value error = materializeHttpError("HTTPS request write failed");
        if (!inox::thrown()) onError(error);
      }

      return false;
    }

    accepted = true;
    return true;
  }

  inox::Callback finish;

  if (final) {
    finish = makeWeakCallback(request_, onClientFinish);

    if (inox::thrown()) {
      return false;
    }
  }

  const bool writable = socket_.write(data, std::move(finish));

  if (inox::thrown()) {
    return false;
  }

  accepted = true;
  return writable;
}

HttpClientRequestState::HttpClientRequestState(
  inox::String host,
  double port,
  inox::String method,
  inox::String path,
  const HttpClientTransportOptions& transport
)
  : host_(std::move(host)),
    method_(std::move(method)),
    path_(std::move(path)),
    port_(port),
    headers_(),
    pending_write_bytes_(),
    response_bytes_(),
    response_listeners_(),
    finish_listeners_(),
    close_listeners_(),
    error_listeners_(),
    transport_kind_(transport.kind()),
    connection_(),
    response_(),
    native_owner_(),
    response_content_length_(),
    response_chunk_bytes_(),
    response_body_received_(0),
    response_chunk_framing_received_(0),
    response_chunk_remaining_(0),
    response_trailer_count_(0),
    response_body_mode_(HttpClientResponseBodyMode::close_delimited),
    response_chunk_state_(HttpChunkDecodeState::size),
    request_content_length_(),
    request_body_bytes_(0),
    request_body_mode_(HttpOutgoingBodyMode::undecided),
    response_keep_alive_(false),
    request_keep_alive_(true),
    pending_write_final_(false),
    ending_(false),
    sent_(false),
    finished_(false),
    response_started_(false),
    failed_(false),
    closed_(false) {
  try {
    headers_.reserve(8);
    pending_write_bytes_.reserve(1024);
    response_bytes_.reserve(4096);
  } catch (const std::bad_alloc&) {
    throwHttpError("TypeError: HttpClientRequest allocation failed");
  }
}

std::shared_ptr<HttpClientRequestState> HttpClientRequestState::create(
  inox::StringView url,
  const HttpRequestOptions* options,
  inox::Callback listener,
  const HttpClientTransportOptions& transport
) {
  inox::String host("127.0.0.1");
  inox::String method("GET");
  inox::String path("/");
  double port = transport.kind() == HttpClientTransportKind::tls ? 443 : 80;

  if (inox::thrown() || !parseClientUrl(url, transport.kind(), host, port, path)) {
    return {};
  }

  if (options != nullptr) {
    if (!options->valid()) {
      throwHttpError(
        transport.kind() == HttpClientTransportKind::tls
          ? "TypeError: node:https request options are invalid"
          : "TypeError: node:http request options are invalid"
      );
      return {};
    }

    if (options->host()) host = *options->host();
    if (options->hostname()) host = *options->hostname();
    if (options->method()) method = *options->method();
    if (options->path()) path = *options->path();
    if (options->port()) port = *options->port();
  }

  if (!validClientConfiguration(host, port, method, path, transport.kind())) {
    return {};
  }

  std::shared_ptr<HttpClientRequestState> request;

  try {
    request = std::make_shared<HttpClientRequestState>(
      std::move(host),
      port,
      std::move(method),
      std::move(path),
      transport
    );
  } catch (const std::bad_alloc&) {
    throwHttpError("TypeError: HttpClientRequest allocation failed");
    return {};
  }

  if (inox::thrown()) {
    return {};
  }

  if (options != nullptr) {
    request->applyHeaders(options->headers());

    if (inox::thrown()) {
      return {};
    }
  }

  if (listener.valid()) {
    try {
      request->response_listeners_.push_back(std::move(listener));
    } catch (const std::bad_alloc&) {
      throwHttpError("TypeError: HttpClientRequest listener allocation failed");
      return {};
    }
  }

  request->native_owner_ = request;
  std::shared_ptr<HttpClientConnectionState> connection = takeIdleClientConnection(
    request->host_,
    request->port_,
    transport
  );

  if (!connection) {
    connection = HttpClientConnectionState::create(request->host_, request->port_, transport);
  }

  if (!connection || !connection->attach(request)) {
    if (connection) connection->destroy();
    request->native_owner_.reset();
    return {};
  }

  return request;
}

void HttpClientRequestState::applyHeaders(const inox::Value& headers) {
  if (headers.tag == INOX_TAG_UNDEFINED) {
    return;
  }

  const inox_value raw = headers.raw();

  if (raw.tag != INOX_TAG_OBJECT || raw.as.ref == nullptr) {
    throwHttpError("TypeError: node:http request headers must be an object");
    return;
  }

  const auto* object = reinterpret_cast<const inox_object*>(raw.as.ref);

  if (object->shape == nullptr) {
    throwHttpError("TypeError: node:http request headers are invalid");
    return;
  }

  for (std::uint32_t index = 0; index < object->shape->field_count; index += 1) {
    const char* name = object->shape->fields[index].name;
    inox::Value value;

    if (name == nullptr || inox_object_get_known(raw, index, value.out()) != INOX_OK || value.tag != INOX_TAG_STRING) {
      throwHttpError("TypeError: node:http request header values must be strings");
      return;
    }

    setHeader(inox::StringView(name, std::strlen(name)), inox::String(value));

    if (inox::thrown()) {
      return;
    }
  }
}

void HttpClientRequestState::destroy() {
  if (!closed_ && connection_) {
    connection_->destroy();
  }
}

void HttpClientRequestState::end(std::span<const std::uint8_t> body) {
  if (ending_ || closed_) {
    throwHttpError("TypeError: HttpClientRequest.end failed");
    return;
  }

  std::string output;

  if (!sent_ && !beginRequest(false, body.size(), output)) {
    return;
  }

  if (!appendRequestBody(output, body)) {
    if (connection_) connection_->destroy();
    return;
  }

  if (request_body_mode_ == HttpOutgoingBodyMode::content_length &&
      (!request_content_length_ || request_body_bytes_ != *request_content_length_)) {
    throwHttpError("TypeError: HttpClientRequest Content-Length does not match its body");
    if (connection_) connection_->destroy();
    return;
  }

  if (request_body_mode_ == HttpOutgoingBodyMode::chunked) {
    try {
      output.append("0\r\n\r\n");
    } catch (const std::bad_alloc&) {
      throwHttpError("TypeError: HttpClientRequest serialization failed");
      if (connection_) connection_->destroy();
      return;
    }
  }

  ending_ = true;
  (void)send(output, true);
}

inox::Value HttpClientRequestState::getHeader(inox::StringView name) const {
  if (!validHeaderName(name)) {
    throwHttpError("TypeError: HttpClientRequest.getHeader failed");
    return inox::Value();
  }

  for (const ResponseHeader& header : headers_) {
    if (equalsIgnoreCase(header.name, name)) {
      return header.value;
    }
  }

  return inox::Value();
}

Array HttpClientRequestState::getHeaderNames() const {
  Array names = Array::create(0);

  for (const ResponseHeader& header : headers_) {
    names.push(header.name);

    if (inox::thrown()) {
      return Array();
    }
  }

  return names;
}

bool HttpClientRequestState::hasHeader(inox::StringView name) const {
  if (!validHeaderName(name)) {
    throwHttpError("TypeError: HttpClientRequest.hasHeader failed");
    return false;
  }

  for (const ResponseHeader& header : headers_) {
    if (equalsIgnoreCase(header.name, name)) {
      return true;
    }
  }

  return false;
}

bool HttpClientRequestState::headersSent() const {
  return sent_;
}

void HttpClientRequestState::on(inox::StringView event_name, inox::Callback listener) {
  if (!listener.valid()) {
    throwHttpError("TypeError: HttpClientRequest.on requires a function");
    return;
  }

  std::vector<inox::Callback>* listeners = nullptr;

  if (hasText(event_name, "response")) listeners = &response_listeners_;
  else if (hasText(event_name, "finish")) listeners = &finish_listeners_;
  else if (hasText(event_name, "close")) listeners = &close_listeners_;
  else if (hasText(event_name, "error")) listeners = &error_listeners_;
  else {
    throwHttpError("TypeError: unsupported HttpClientRequest event");
    return;
  }

  try {
    listeners->push_back(std::move(listener));
  } catch (const std::bad_alloc&) {
    throwHttpError("TypeError: HttpClientRequest listener allocation failed");
  }
}

void HttpClientRequestState::onClose() {
  if (closed_) {
    return;
  }

  std::shared_ptr<HttpClientRequestState> owner = native_owner_;
  closed_ = true;

  if (response_) {
    response_->emitClose();
  }

  callHttpListeners(close_listeners_);
  native_owner_.reset();
}

void HttpClientRequestState::onConnect() {
  if (closed_) {
    return;
  }

  if (pending_write_bytes_.empty() && !pending_write_final_) {
    return;
  }

  std::string output = std::move(pending_write_bytes_);
  const bool final = pending_write_final_;
  pending_write_bytes_.clear();
  pending_write_final_ = false;
  (void)send(output, final);
}

bool HttpClientRequestState::deliverResponseBody(inox::StringView data) {
  if (!response_ || data.len == 0 || inox::thrown()) {
    return !inox::thrown();
  }

  if (response_body_received_ > maxClientResponseBytes ||
      data.len > maxClientResponseBytes - response_body_received_ ||
      (response_body_mode_ == HttpClientResponseBodyMode::content_length &&
       response_content_length_ &&
       (response_body_received_ > *response_content_length_ ||
        data.len > *response_content_length_ - response_body_received_))) {
    inox::Value error = materializeHttpError("HTTP response body exceeds its framing limit");
    if (!inox::thrown()) onError(error);
    return false;
  }

  response_->emitData(data);

  if (inox::thrown()) {
    return false;
  }

  response_body_received_ += data.len;

  if (response_body_mode_ == HttpClientResponseBodyMode::content_length &&
      response_content_length_ &&
      response_body_received_ == *response_content_length_) {
    completeResponseBody();
  }

  return !inox::thrown();
}

bool HttpClientRequestState::consumeChunkedBody(inox::StringView data) {
  auto fail = [this](const char* message) {
    inox::Value error = materializeHttpError(message);
    if (!inox::thrown()) onError(error);
    return false;
  };
  auto compact = [this](std::size_t consumed) {
    if (consumed == 0) {
      return;
    }

    if (consumed == response_chunk_bytes_.size()) {
      response_chunk_bytes_.clear();
    } else {
      response_chunk_bytes_.erase(
        response_chunk_bytes_.begin(),
        response_chunk_bytes_.begin() + static_cast<std::ptrdiff_t>(consumed)
      );
    }
  };

  if (response_chunk_state_ == HttpChunkDecodeState::complete) {
    return data.len == 0 || fail("HTTP chunked response has data after its terminator");
  }

  constexpr std::size_t max_buffered = maxClientResponseBytes + maxClientChunkFramingBytes;

  if (response_chunk_bytes_.size() > max_buffered ||
      data.len > max_buffered - response_chunk_bytes_.size()) {
    return fail("HTTP response is too large");
  }

  if (data.len > 0) {
    try {
      response_chunk_bytes_.insert(response_chunk_bytes_.end(), data.bytes, data.bytes + data.len);
    } catch (const std::bad_alloc&) {
      inox::throw_out_of_memory();
      return false;
    }
  }

  std::size_t cursor = 0;

  for (;;) {
    const std::span<const char> bytes(response_chunk_bytes_);

    if (response_chunk_state_ == HttpChunkDecodeState::size) {
      const std::size_t line_end = findCrlf(bytes, cursor);

      if (line_end == std::numeric_limits<std::size_t>::max()) {
        if (bytes.size() - cursor > maxChunkMetadataLineBytes) {
          return fail("HTTP chunked response metadata is too large");
        }

        compact(cursor);
        return true;
      }

      const std::size_t extension = findByte(bytes, cursor, line_end, ';');
      const std::size_t size_end = extension == std::numeric_limits<std::size_t>::max()
        ? line_end
        : extension;

      if (size_end == cursor ||
          !validHeaderValue(inox::StringView(bytes.data() + cursor, line_end - cursor))) {
        return fail("HTTP chunked response size is invalid");
      }

      const std::size_t framing_length = line_end + 2 - cursor;

      if (response_chunk_framing_received_ > maxClientChunkFramingBytes ||
          framing_length > maxClientChunkFramingBytes - response_chunk_framing_received_) {
        return fail("HTTP chunked response metadata is too large");
      }

      response_chunk_framing_received_ += framing_length;

      std::size_t chunk_size = 0;

      for (std::size_t index = cursor; index < size_end; index += 1) {
        const unsigned char byte = static_cast<unsigned char>(bytes[index]);
        std::size_t digit = 0;

        if (byte >= '0' && byte <= '9') digit = byte - '0';
        else if (byte >= 'a' && byte <= 'f') digit = byte - 'a' + 10;
        else if (byte >= 'A' && byte <= 'F') digit = byte - 'A' + 10;
        else return fail("HTTP chunked response size is invalid");

        if (chunk_size > (maxClientResponseBytes - digit) / 16) {
          return fail("HTTP response is too large");
        }

        chunk_size = chunk_size * 16 + digit;
      }

      if (response_body_received_ > maxClientResponseBytes ||
          chunk_size > maxClientResponseBytes - response_body_received_) {
        return fail("HTTP response is too large");
      }

      cursor = line_end + 2;
      response_chunk_remaining_ = chunk_size;
      response_chunk_state_ = chunk_size == 0
        ? HttpChunkDecodeState::trailers
        : HttpChunkDecodeState::data;
      continue;
    }

    if (response_chunk_state_ == HttpChunkDecodeState::data) {
      const std::size_t available = bytes.size() - cursor;
      const std::size_t length = available < response_chunk_remaining_
        ? available
        : response_chunk_remaining_;

      if (length > 0 &&
          !deliverResponseBody(inox::StringView(bytes.data() + cursor, length))) {
        return false;
      }

      cursor += length;
      response_chunk_remaining_ -= length;

      if (response_chunk_remaining_ != 0) {
        compact(cursor);
        return true;
      }

      response_chunk_state_ = HttpChunkDecodeState::data_crlf;
      continue;
    }

    if (response_chunk_state_ == HttpChunkDecodeState::data_crlf) {
      if (bytes.size() - cursor < 2) {
        compact(cursor);
        return true;
      }

      if (bytes[cursor] != '\r' || bytes[cursor + 1] != '\n') {
        return fail("HTTP chunked response data terminator is invalid");
      }

      if (response_chunk_framing_received_ > maxClientChunkFramingBytes - 2) {
        return fail("HTTP chunked response metadata is too large");
      }

      response_chunk_framing_received_ += 2;
      cursor += 2;
      response_chunk_state_ = HttpChunkDecodeState::size;
      continue;
    }

    if (response_chunk_state_ == HttpChunkDecodeState::trailers) {
      const std::size_t line_end = findCrlf(bytes, cursor);

      if (line_end == std::numeric_limits<std::size_t>::max()) {
        if (bytes.size() - cursor > maxChunkMetadataLineBytes) {
          return fail("HTTP chunked response trailers are too large");
        }

        compact(cursor);
        return true;
      }

      if (line_end == cursor) {
        if (response_chunk_framing_received_ > maxClientChunkFramingBytes - 2) {
          return fail("HTTP chunked response trailers are too large");
        }

        response_chunk_framing_received_ += 2;
        cursor += 2;

        if (cursor != bytes.size()) {
          return fail("HTTP chunked response has data after its terminator");
        }

        response_chunk_bytes_.clear();
        response_chunk_state_ = HttpChunkDecodeState::complete;
        completeResponseBody();
        return !inox::thrown();
      }

      const std::size_t separator = findByte(bytes, cursor, line_end, ':');

      if (separator == std::numeric_limits<std::size_t>::max() || separator == cursor) {
        return fail("HTTP chunked response trailer is invalid");
      }

      std::size_t value_start = separator + 1;
      std::size_t value_end = line_end;

      while (value_start < value_end && (bytes[value_start] == ' ' || bytes[value_start] == '\t')) {
        value_start += 1;
      }

      while (value_end > value_start && (bytes[value_end - 1] == ' ' || bytes[value_end - 1] == '\t')) {
        value_end -= 1;
      }

      const std::span<const char> name = bytes.subspan(cursor, separator - cursor);
      const inox::StringView value(bytes.data() + value_start, value_end - value_start);
      const std::size_t framing_length = line_end + 2 - cursor;

      response_trailer_count_ += 1;

      if (response_trailer_count_ > maxResponseHeaders ||
          response_chunk_framing_received_ > maxClientChunkFramingBytes ||
          framing_length > maxClientChunkFramingBytes - response_chunk_framing_received_ ||
          !validHeaderName(inox::StringView(name.data(), name.size())) ||
          !validHeaderValue(value) ||
          spanEqualsIgnoreCase(name, "Content-Length") ||
          spanEqualsIgnoreCase(name, "Transfer-Encoding")) {
        return fail("HTTP chunked response trailer is invalid");
      }

      response_chunk_framing_received_ += framing_length;
      cursor = line_end + 2;
      continue;
    }

    return bytes.size() == cursor || fail("HTTP chunked response has data after its terminator");
  }
}

bool HttpClientRequestState::consumeResponseBody(inox::StringView data) {
  if (response_body_mode_ == HttpClientResponseBodyMode::chunked) {
    return consumeChunkedBody(data);
  }

  if (response_body_mode_ == HttpClientResponseBodyMode::none) {
    if (data.len == 0) {
      return true;
    }

    inox::Value error = materializeHttpError("HTTP response must not contain a body");
    if (!inox::thrown()) onError(error);
    return false;
  }

  return deliverResponseBody(data);
}

void HttpClientRequestState::onData(inox::StringView data) {
  if (closed_ || data.len == 0) {
    return;
  }

  if (response_started_) {
    (void)consumeResponseBody(data);
    return;
  }

  if (data.len > maxClientResponseBytes + maxResponseHeaderBytes - response_bytes_.size()) {
    inox::Value error = materializeHttpError("HTTP response is too large");
    if (!inox::thrown()) onError(error);
    return;
  }

  try {
    response_bytes_.insert(response_bytes_.end(), data.bytes, data.bytes + data.len);
  } catch (const std::bad_alloc&) {
    throwHttpError("TypeError: HttpClientRequest response allocation failed");
    return;
  }

  const ParsedResponse parsed = parseResponse(response_bytes_);

  if (parsed.result == ResponseParseResult::incomplete) {
    return;
  }

  if (parsed.result != ResponseParseResult::ready) {
    inox::Value error = materializeHttpError(
      parsed.result == ResponseParseResult::too_large ? "HTTP response is too large" : "HTTP response is invalid"
    );
    if (!inox::thrown()) onError(error);
    return;
  }

  inox::Value headers = materializeRequestHeaders(response_bytes_, parsed.headers_start, parsed.headers_end);

  if (inox::thrown()) {
    return;
  }

  if (!connection_) {
    inox::Value error = materializeHttpError("HTTP response connection is unavailable");
    if (!inox::thrown()) onError(error);
    return;
  }

  NetSocket response_socket = connection_->responseSocket();

  if (inox::thrown()) return;

  try {
    response_ = std::make_shared<HttpRequestState>(
      std::move(headers),
      inox::String(response_bytes_.data() + parsed.version_start, parsed.version_length),
      inox::String(""),
      std::move(response_socket),
      inox::String(""),
      parsed.status_code,
      inox::String(response_bytes_.data() + parsed.status_message_start, parsed.status_message_length)
    );
  } catch (const std::bad_alloc&) {
    throwHttpError("TypeError: IncomingMessage allocation failed");
    return;
  }

  if (inox::thrown()) {
    return;
  }

  response_content_length_ = parsed.content_length;
  response_keep_alive_ = parsed.keep_alive;
  response_body_mode_ = parsed.chunked
    ? HttpClientResponseBodyMode::chunked
    : parsed.content_length
      ? HttpClientResponseBodyMode::content_length
      : HttpClientResponseBodyMode::close_delimited;

  if (hasText(method_, "HEAD") || parsed.status_code == 204 || parsed.status_code == 304) {
    response_content_length_ = 0;
    response_body_mode_ = HttpClientResponseBodyMode::none;
  }

  response_started_ = true;
  HttpRequest response = materializeRequest(response_);

  if (inox::thrown()) {
    return;
  }

  const std::array<inox::Value, 1> arguments = {response};
  callHttpListeners(response_listeners_, arguments);

  if (inox::thrown()) {
    return;
  }

  const std::size_t body_length = response_bytes_.size() - parsed.body_start;

  if (!consumeResponseBody(inox::StringView(response_bytes_.data() + parsed.body_start, body_length))) {
    return;
  }

  if ((response_body_mode_ == HttpClientResponseBodyMode::none ||
       (response_body_mode_ == HttpClientResponseBodyMode::content_length &&
        response_content_length_ && *response_content_length_ == 0)) &&
      !response_->ended_) {
    completeResponseBody();
  }

  response_bytes_.clear();
}

void HttpClientRequestState::onEnd() {
  if (closed_ || failed_) {
    return;
  }

  if (!response_started_ || !response_) {
    inox::Value error = materializeHttpError("HTTP connection ended before a response was received");
    if (!inox::thrown()) onError(error);
    return;
  }

  if (response_body_mode_ == HttpClientResponseBodyMode::chunked &&
      response_chunk_state_ != HttpChunkDecodeState::complete) {
    inox::Value error = materializeHttpError("HTTP chunked response ended before its terminator");
    if (!inox::thrown()) onError(error);
    return;
  }

  if (response_body_mode_ == HttpClientResponseBodyMode::content_length &&
      response_content_length_ && response_body_received_ != *response_content_length_) {
    inox::Value error = materializeHttpError("HTTP response ended before Content-Length was received");
    if (!inox::thrown()) onError(error);
    return;
  }

  completeResponseBody();
}

void HttpClientRequestState::onError(const inox::Value& error) {
  if (closed_ || failed_) {
    return;
  }

  failed_ = true;
  const std::array<inox::Value, 1> arguments = {error};
  callHttpListeners(error_listeners_, arguments);

  if (!inox::thrown() && response_) {
    response_->emitError(error);
  }

  if (!closed_) {
    destroy();
  }
}

void HttpClientRequestState::onFinish() {
  if (finished_ || closed_) {
    return;
  }

  finished_ = true;
  callHttpListeners(finish_listeners_);
}

void HttpClientRequestState::completeResponseBody() {
  if (closed_ || !response_ || response_->ended_ || !connection_) {
    return;
  }

  const bool reusable = request_keep_alive_ &&
    response_keep_alive_ &&
    response_body_mode_ != HttpClientResponseBodyMode::close_delimited;
  std::shared_ptr<HttpClientConnectionState> connection = connection_;
  const bool released = reusable && connection->release(shared_from_this());
  response_->emitEnd();

  if (released) {
    onClose();
  } else {
    connection->complete(shared_from_this());
  }
}

void HttpClientRequestState::removeHeader(inox::StringView name) {
  if (ending_ || sent_ || !validHeaderName(name)) {
    throwHttpError("TypeError: HttpClientRequest.removeHeader failed");
    return;
  }

  for (auto iterator = headers_.begin(); iterator != headers_.end(); iterator += 1) {
    if (equalsIgnoreCase(iterator->name, name)) {
      headers_.erase(iterator);
      return;
    }
  }
}

bool HttpClientRequestState::beginRequest(
  bool streaming,
  std::size_t initial_body_size,
  std::string& output
) {
  if (sent_ || request_body_mode_ != HttpOutgoingBodyMode::undecided ||
      initial_body_size > maxClientRequestBodyBytes ||
      !selectOutgoingBodyMode(
        headers_,
        streaming,
        true,
        initial_body_size,
        maxClientRequestBodyBytes,
        "TypeError: HttpClientRequest body framing is invalid",
        "TypeError: HttpClientRequest serialization failed",
        request_body_mode_,
        request_content_length_
      )) {
    if (!inox::thrown()) {
      throwHttpError("TypeError: HttpClientRequest body is too large");
    }

    return false;
  }

  request_keep_alive_ = true;

  for (const ResponseHeader& header : headers_) {
    const inox::StringView value = header.value;

    if (equalsIgnoreCase(header.name, inox::StringView("Connection", 10)) &&
        headerValueHasToken(std::span<const char>(value.bytes, value.len), "close")) {
      request_keep_alive_ = false;
      break;
    }
  }

  try {
    const inox::StringView method = method_;
    const inox::StringView path = path_;
    const inox::StringView host = host_;
    output.reserve(256 + initial_body_size);
    output.append(method.bytes, method.len);
    output.push_back(' ');
    output.append(path.bytes, path.len);
    output.append(" HTTP/1.1\r\n");

    if (!hasHeader("Host")) {
      output.append("Host: ");
      output.append(host.bytes, host.len);

      const double default_port = transport_kind_ == HttpClientTransportKind::tls ? 443 : 80;

      if (port_ != default_port) {
        output.push_back(':');
        output.append(std::to_string(static_cast<int>(port_)));
      }

      output.append("\r\n");
    }

    for (const ResponseHeader& header : headers_) {
      const inox::StringView name = header.name;
      const inox::StringView value = header.value;
      output.append(name.bytes, name.len);
      output.append(": ");
      output.append(value.bytes, value.len);
      output.append("\r\n");
    }

    if (!hasHeader("Connection")) {
      output.append("Connection: keep-alive\r\n");
    }

    output.append("\r\n");
  } catch (const std::bad_alloc&) {
    throwHttpError("TypeError: HttpClientRequest serialization failed");
    return false;
  }

  sent_ = true;
  return true;
}

bool HttpClientRequestState::appendRequestBody(
  std::string& output,
  std::span<const std::uint8_t> body
) {
  if (request_body_mode_ == HttpOutgoingBodyMode::undecided ||
      request_body_bytes_ > maxClientRequestBodyBytes ||
      body.size() > maxClientRequestBodyBytes - request_body_bytes_ ||
      (request_body_mode_ == HttpOutgoingBodyMode::content_length &&
       (!request_content_length_ ||
        request_body_bytes_ > *request_content_length_ ||
        body.size() > *request_content_length_ - request_body_bytes_))) {
    throwHttpError("TypeError: HttpClientRequest body exceeds its framing limit");
    return false;
  }

  if (request_body_mode_ == HttpOutgoingBodyMode::chunked) {
    if (!appendChunk(output, body, "TypeError: HttpClientRequest serialization failed")) {
      return false;
    }
  } else if (!body.empty()) {
    try {
      output.append(reinterpret_cast<const char*>(body.data()), body.size());
    } catch (const std::bad_alloc&) {
      throwHttpError("TypeError: HttpClientRequest serialization failed");
      return false;
    }
  }

  request_body_bytes_ += body.size();
  return true;
}

bool HttpClientRequestState::send(std::string& output, bool final) {
  if (!connection_ || closed_) {
    throwHttpError("TypeError: HttpClientRequest write failed");
    return false;
  }

  if (!connection_->connected_) {
    try {
      pending_write_bytes_.append(output);
    } catch (const std::bad_alloc&) {
      throwHttpError("TypeError: HttpClientRequest write allocation failed");
      connection_->destroy();
      return false;
    }

    pending_write_final_ = pending_write_final_ || final;
    return true;
  }

  if (output.empty() && !final) {
    return true;
  }

  bool accepted = false;
  const bool writable = connection_->write(
    inox::StringView(output.data(), output.size()),
    final,
    accepted
  );

  if (!accepted && !inox::thrown() && !failed_) {
    inox::Value error = materializeHttpError("HTTP request write failed");
    if (!inox::thrown()) onError(error);
  }

  return accepted && writable;
}

void HttpClientRequestState::setHeader(inox::StringView name, inox::StringView value) {
  if (ending_ || sent_ || !validHeaderName(name) || !validHeaderValue(value)) {
    throwHttpError("TypeError: HttpClientRequest.setHeader failed");
    return;
  }

  for (ResponseHeader& header : headers_) {
    if (equalsIgnoreCase(header.name, name)) {
      header.value = inox::String(value);
      return;
    }
  }

  if (headers_.size() >= maxResponseHeaders) {
    throwHttpError("TypeError: HttpClientRequest header limit exceeded");
    return;
  }

  try {
    inox::String normalized = normalizedHeaderName(std::span<const char>(name.bytes, name.len));

    if (!inox::thrown()) {
      headers_.push_back(ResponseHeader{std::move(normalized), inox::String(value)});
    }
  } catch (const std::bad_alloc&) {
    throwHttpError("TypeError: HttpClientRequest header allocation failed");
  }
}

bool HttpClientRequestState::writableEnded() const {
  return ending_;
}

bool HttpClientRequestState::write(std::span<const std::uint8_t> body) {
  if (ending_ || closed_) {
    throwHttpError("TypeError: HttpClientRequest.write failed");
    return false;
  }

  std::string output;

  if (!sent_ && !beginRequest(true, body.size(), output)) {
    return false;
  }

  if (!appendRequestBody(output, body)) {
    if (connection_) connection_->destroy();
    return false;
  }

  return send(output, false);
}

HttpResponseState::HttpResponseState(std::shared_ptr<HttpConnectionState> connection)
  : connection_(std::move(connection)),
    headers_(),
    content_length_(),
    body_bytes_written_(0),
    body_mode_(HttpOutgoingBodyMode::undecided),
    status_code_(200),
    sent_(false),
    ending_(false),
    ended_(false) {
  try {
    headers_.reserve(8);
  } catch (const std::bad_alloc&) {
    throwHttpError("TypeError: HttpResponse allocation failed");
  }
}

void HttpResponseState::applyHeaders(const inox::Value& headers) {
  const inox_value raw = headers.raw();

  if (raw.tag != INOX_TAG_OBJECT || raw.as.ref == nullptr) {
    throwHttpError("TypeError: HttpResponse.writeHead headers must be an object");
    return;
  }

  const auto* object = reinterpret_cast<const inox_object*>(raw.as.ref);

  if (object->shape == nullptr) {
    throwHttpError("TypeError: HttpResponse.writeHead headers are invalid");
    return;
  }

  for (std::uint32_t index = 0; index < object->shape->field_count; index += 1) {
    const char* name = object->shape->fields[index].name;
    inox_value raw_value = inox_undefined_value();

    if (name == nullptr || inox_object_get_known(raw, index, &raw_value) != INOX_OK) {
      throwHttpError("TypeError: HttpResponse.writeHead header read failed");
      return;
    }

    inox::Value value = inox::adopt(raw_value);

    if (value.tag != INOX_TAG_STRING) {
      throwHttpError("TypeError: HttpResponse.writeHead header values must be strings");
      return;
    }

    setHeader(inox::StringView(name, std::strlen(name)), inox::String(std::move(value)));

    if (inox::thrown()) {
      return;
    }
  }
}

void HttpResponseState::setHeader(inox::StringView name, inox::StringView value) {
  if (sent_ || ending_ || ended_ || !validHeaderName(name) || !validHeaderValue(value)) {
    throwHttpError("TypeError: HttpResponse.setHeader failed");
    return;
  }

  for (ResponseHeader& header : headers_) {
    if (equalsIgnoreCase(header.name, name)) {
      header.value = inox::String(value);
      return;
    }
  }

  if (headers_.size() >= maxResponseHeaders) {
    throwHttpError("TypeError: HttpResponse header limit exceeded");
    return;
  }

  try {
    const inox::String normalized_name = normalizedHeaderName(std::span<const char>(name.bytes, name.len));

    if (inox::thrown()) {
      return;
    }

    headers_.push_back(ResponseHeader{normalized_name, inox::String(value)});
  } catch (const std::bad_alloc&) {
    throwHttpError("TypeError: HttpResponse header allocation failed");
  }
}

inox::Value HttpResponseState::getHeader(inox::StringView name) const {
  if (!validHeaderName(name)) {
    throwHttpError("TypeError: HttpResponse.getHeader failed");
    return inox::Value();
  }

  for (const ResponseHeader& header : headers_) {
    if (equalsIgnoreCase(header.name, name)) {
      return header.value;
    }
  }

  return inox::Value();
}

Array HttpResponseState::getHeaderNames() const {
  Array names = Array::create(0);

  for (const ResponseHeader& header : headers_) {
    names.push(header.name);

    if (inox::thrown()) {
      return Array();
    }
  }

  return names;
}

bool HttpResponseState::hasHeader(inox::StringView name) const {
  if (!validHeaderName(name)) {
    throwHttpError("TypeError: HttpResponse.hasHeader failed");
    return false;
  }

  for (const ResponseHeader& header : headers_) {
    if (equalsIgnoreCase(header.name, name)) {
      return true;
    }
  }

  return false;
}

bool HttpResponseState::headersSent() const {
  return sent_;
}

void HttpResponseState::removeHeader(inox::StringView name) {
  if (sent_ || ending_ || ended_ || !validHeaderName(name)) {
    throwHttpError("TypeError: HttpResponse.removeHeader failed");
    return;
  }

  for (auto iterator = headers_.begin(); iterator != headers_.end(); iterator += 1) {
    if (equalsIgnoreCase(iterator->name, name)) {
      headers_.erase(iterator);
      return;
    }
  }
}

bool HttpResponseState::writableEnded() const {
  return ending_ || ended_;
}

void HttpResponseState::setStatusCode(double value) {
  if (sent_ || ending_ || ended_ || !std::isfinite(value) || std::floor(value) != value || value < 100 || value > 999) {
    throwHttpError("TypeError: HttpResponse.statusCode is invalid");
    return;
  }

  status_code_ = value;
}

bool HttpResponseState::write(std::span<const std::uint8_t> body) {
  if (ending_ || ended_ || !connection_ || connection_->closed_) {
    throwHttpError("TypeError: HttpResponse.write failed");
    return false;
  }

  std::string output;

  if (!sent_ && !begin(true, body.size(), output)) {
    return false;
  }

  if (!appendBody(output, body)) {
    connection_->socket_.destroy();
    return false;
  }

  return send(output, false);
}

void HttpResponseState::end(std::span<const std::uint8_t> body) {
  if (ending_ || ended_ || !connection_ || connection_->closed_) {
    throwHttpError("TypeError: HttpResponse.end failed");
    return;
  }

  std::string output;

  if (!sent_ && !begin(false, body.size(), output)) {
    return;
  }

  if (!appendBody(output, body)) {
    connection_->socket_.destroy();
    return;
  }

  if (body_mode_ == HttpOutgoingBodyMode::content_length &&
      (!content_length_ || body_bytes_written_ != *content_length_)) {
    throwHttpError("TypeError: HttpResponse Content-Length does not match its body");
    connection_->socket_.destroy();
    return;
  }

  if (body_mode_ == HttpOutgoingBodyMode::chunked) {
    try {
      output.append("0\r\n\r\n");
    } catch (const std::bad_alloc&) {
      throwHttpError("TypeError: HttpResponse allocation failed");
      connection_->socket_.destroy();
      return;
    }
  }

  ending_ = true;
  (void)send(output, true);

  if (inox::thrown()) {
    ending_ = false;
    connection_->socket_.destroy();
    return;
  }

  ended_ = true;
}

bool HttpResponseState::begin(
  bool streaming,
  std::size_t initial_body_size,
  std::string& output
) {
  if (sent_ || body_mode_ != HttpOutgoingBodyMode::undecided ||
      initial_body_size > maxResponseBodyBytes ||
      !selectOutgoingBodyMode(
        headers_,
        streaming,
        !connection_->active_http_1_0_,
        initial_body_size,
        maxResponseBodyBytes,
        "TypeError: HttpResponse body framing is invalid",
        "TypeError: HttpResponse header allocation failed",
        body_mode_,
        content_length_
      )) {
    if (!inox::thrown()) {
      throwHttpError("TypeError: HttpResponse body is too large");
    }

    return false;
  }

  bool keep_alive = connection_ && connection_->active_keep_alive_ &&
    body_mode_ != HttpOutgoingBodyMode::close_delimited;

  for (const ResponseHeader& header : headers_) {
    const inox::StringView value = header.value;

    if (equalsIgnoreCase(header.name, inox::StringView("Connection", 10)) &&
        headerValueHasToken(std::span<const char>(value.bytes, value.len), "close")) {
      keep_alive = false;
      break;
    }
  }

  setHeader("Connection", keep_alive ? inox::StringView("keep-alive") : inox::StringView("close"));

  if (inox::thrown()) {
    return false;
  }

  connection_->active_keep_alive_ = keep_alive;

  try {
    output.reserve(256 + initial_body_size);
    output.append(connection_->active_http_1_0_ ? "HTTP/1.0 " : "HTTP/1.1 ");
    output.append(std::to_string(static_cast<int>(status_code_)));
    output.push_back(' ');
    output.append(statusText(static_cast<int>(status_code_)));
    output.append("\r\n");

    for (const ResponseHeader& header : headers_) {
      const inox::StringView name = header.name;
      const inox::StringView value = header.value;
      output.append(name.bytes, name.len);
      output.append(": ");
      output.append(value.bytes, value.len);
      output.append("\r\n");
    }

    output.append("\r\n");
  } catch (const std::bad_alloc&) {
    throwHttpError("TypeError: HttpResponse header allocation failed");
    return false;
  }

  if (output.size() > maxResponseHeaderBytes) {
    throwHttpError("TypeError: HttpResponse header is too large");
    return false;
  }

  sent_ = true;
  return true;
}

bool HttpResponseState::appendBody(
  std::string& output,
  std::span<const std::uint8_t> body
) {
  if (body_mode_ == HttpOutgoingBodyMode::undecided ||
      body_bytes_written_ > maxResponseBodyBytes ||
      body.size() > maxResponseBodyBytes - body_bytes_written_ ||
      (body_mode_ == HttpOutgoingBodyMode::content_length &&
       (!content_length_ ||
        body_bytes_written_ > *content_length_ ||
        body.size() > *content_length_ - body_bytes_written_))) {
    throwHttpError("TypeError: HttpResponse body exceeds its framing limit");
    return false;
  }

  if (body_mode_ == HttpOutgoingBodyMode::chunked) {
    if (!appendChunk(output, body, "TypeError: HttpResponse allocation failed")) {
      return false;
    }
  } else if (!body.empty()) {
    try {
      output.append(reinterpret_cast<const char*>(body.data()), body.size());
    } catch (const std::bad_alloc&) {
      throwHttpError("TypeError: HttpResponse allocation failed");
      return false;
    }
  }

  body_bytes_written_ += body.size();
  return true;
}

bool HttpResponseState::send(std::string& output, bool final) {
  if (!connection_ || connection_->closed_) {
    throwHttpError("TypeError: HttpResponse write failed");
    return false;
  }

  if (!final) {
    return connection_->socket_.write(inox::StringView(output.data(), output.size()));
  }

  inox::Callback complete = makeWeakCallback(connection_, onResponseComplete);

  if (inox::thrown()) {
    return false;
  }

  if (connection_->active_keep_alive_) {
    return connection_->socket_.write(
      inox::StringView(output.data(), output.size()),
      std::move(complete)
    );
  }

  connection_->socket_.end(
    inox::StringView(output.data(), output.size()),
    std::move(complete)
  );
  return !inox::thrown();
}

inox_status onServerConnection(
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
  std::shared_ptr<HttpServerState> server = lockCallbackState<HttpServerState>(context);

  if (!server) {
    socket.destroy();
    return callbackStatus();
  }

  server->accept(std::move(socket));
  return callbackStatus();
}

inox_status onServerClose(
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

  std::shared_ptr<HttpServerState> server = lockCallbackState<HttpServerState>(context);

  if (server) {
    server->onNetClosed();
  }

  return INOX_OK;
}

inox_status onConnectionData(
  void* context,
  const inox_value* args,
  std::size_t arg_count,
  inox_value* out
) {
  setCallbackResult(out);

  if (args == nullptr || arg_count != 1 || args[0].tag != INOX_TAG_STRING) {
    return INOX_ERR_TYPE;
  }

  std::shared_ptr<HttpConnectionState> connection = lockCallbackState<HttpConnectionState>(context);

  if (connection) {
    connection->onData(inox::String(inox::Value(args[0])));
  }

  return callbackStatus();
}

inox_status onConnectionClose(
  void* context,
  const inox_value* args,
  std::size_t arg_count,
  inox_value* out
) {
  setCallbackResult(out);

  if (args == nullptr || arg_count != 1 || args[0].tag != INOX_TAG_BOOL) {
    return INOX_ERR_TYPE;
  }

  std::shared_ptr<HttpConnectionState> connection = lockCallbackState<HttpConnectionState>(context);

  if (connection) {
    connection->onClose();
  }

  return INOX_OK;
}

inox_status onConnectionError(
  void* context,
  const inox_value* args,
  std::size_t arg_count,
  inox_value* out
) {
  setCallbackResult(out);

  if (args == nullptr || arg_count != 1 || args[0].tag != INOX_TAG_OBJECT) {
    return INOX_ERR_TYPE;
  }

  (void)context;
  return INOX_OK;
}

inox_status onResponseComplete(
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

  std::shared_ptr<HttpConnectionState> connection = lockCallbackState<HttpConnectionState>(context);

  if (connection && !connection->closed_) {
    connection->completeResponse(connection->active_keep_alive_);
  }

  return callbackStatus();
}

inox_status onClientConnect(
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

  std::shared_ptr<HttpClientConnectionState> connection = lockCallbackState<HttpClientConnectionState>(context);

  if (connection) {
    connection->onConnect();
  }

  return callbackStatus();
}

inox_status onClientData(
  void* context,
  const inox_value* args,
  std::size_t arg_count,
  inox_value* out
) {
  setCallbackResult(out);

  if (args == nullptr || arg_count != 1 || args[0].tag != INOX_TAG_STRING) {
    return INOX_ERR_TYPE;
  }

  std::shared_ptr<HttpClientConnectionState> connection = lockCallbackState<HttpClientConnectionState>(context);

  if (connection) {
    connection->onData(inox::StringView(inox::String(inox::Value(args[0]))));
  }

  return callbackStatus();
}

inox_status onClientEnd(
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

  std::shared_ptr<HttpClientConnectionState> connection = lockCallbackState<HttpClientConnectionState>(context);

  if (connection) {
    connection->onEnd();
  }

  return callbackStatus();
}

inox_status onClientClose(
  void* context,
  const inox_value* args,
  std::size_t arg_count,
  inox_value* out
) {
  setCallbackResult(out);

  if (args == nullptr || arg_count != 1 || args[0].tag != INOX_TAG_BOOL) {
    return INOX_ERR_TYPE;
  }

  std::shared_ptr<HttpClientConnectionState> connection = lockCallbackState<HttpClientConnectionState>(context);

  if (connection) {
    connection->onClose();
  }

  return callbackStatus();
}

inox_status onClientError(
  void* context,
  const inox_value* args,
  std::size_t arg_count,
  inox_value* out
) {
  setCallbackResult(out);

  if (args == nullptr || arg_count != 1 || args[0].tag != INOX_TAG_OBJECT) {
    return INOX_ERR_TYPE;
  }

  std::shared_ptr<HttpClientConnectionState> connection = lockCallbackState<HttpClientConnectionState>(context);

  if (connection) {
    connection->onError(inox::Value(args[0]));
  }

  return callbackStatus();
}

inox_status onClientFinish(
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

  std::shared_ptr<HttpClientRequestState> request = lockCallbackState<HttpClientRequestState>(context);

  if (request) {
    request->onFinish();
  }

  return callbackStatus();
}

inox_status onClientTlsConnect(void* context, inox_tls_client* client, inox_status status) {
  auto* raw_connection = static_cast<HttpClientConnectionState*>(context);

  if (raw_connection == nullptr || client == nullptr) {
    return INOX_ERR_TYPE;
  }

  std::shared_ptr<HttpClientConnectionState> connection = raw_connection->native_owner_;

  if (!connection || connection->tls_ != client) {
    return INOX_OK;
  }

  if (status == INOX_OK) {
    connection->onConnect();
  } else {
    inox::Value error = materializeHttpError("HTTPS connection failed");
    if (!inox::thrown()) connection->onError(error);
  }

  return callbackStatus();
}

inox_status onClientTlsData(
  void* context,
  inox_tls_client* client,
  const char* bytes,
  std::size_t length
) {
  auto* raw_connection = static_cast<HttpClientConnectionState*>(context);

  if (raw_connection == nullptr || client == nullptr || (bytes == nullptr && length != 0)) {
    return INOX_ERR_TYPE;
  }

  std::shared_ptr<HttpClientConnectionState> connection = raw_connection->native_owner_;

  if (connection && connection->tls_ == client) {
    connection->onData(inox::StringView(bytes, length));
  }

  return callbackStatus();
}

void onClientTlsClose(void* context, inox_tls_client* client) {
  auto* raw_connection = static_cast<HttpClientConnectionState*>(context);

  if (raw_connection == nullptr || client == nullptr) {
    return;
  }

  std::shared_ptr<HttpClientConnectionState> connection = raw_connection->native_owner_;

  if (!connection || connection->tls_ != client) {
    return;
  }

  connection->tls_ = nullptr;
  connection->onEnd();
  connection->onClose();
}

inox_status onClientTlsWrite(void* context, inox_tls_client* client, inox_status status) {
  auto* raw_connection = static_cast<HttpClientConnectionState*>(context);

  if (raw_connection == nullptr || client == nullptr) {
    return INOX_ERR_TYPE;
  }

  std::shared_ptr<HttpClientConnectionState> connection = raw_connection->native_owner_;

  if (!connection || connection->tls_ != client) {
    return INOX_OK;
  }

  connection->onWrite(status);

  return callbackStatus();
}

} // namespace

HttpClientTransportOptions HttpClientTransportOptions::plain() {
  return HttpClientTransportOptions(HttpClientTransportKind::plain, true, std::nullopt);
}

HttpClientTransportOptions HttpClientTransportOptions::tls(
  bool verify_peer,
  std::optional<inox::String> server_name
) {
  return HttpClientTransportOptions(HttpClientTransportKind::tls, verify_peer, std::move(server_name));
}

HttpClientTransportOptions::HttpClientTransportOptions(
  HttpClientTransportKind kind,
  bool verify_peer,
  std::optional<inox::String> server_name
)
  : kind_(kind), verify_peer_(verify_peer), server_name_(std::move(server_name)) {}

HttpClientTransportKind HttpClientTransportOptions::kind() const {
  return kind_;
}

bool HttpClientTransportOptions::verifyPeer() const {
  return verify_peer_;
}

const std::optional<inox::String>& HttpClientTransportOptions::serverName() const {
  return server_name_;
}

HttpListenOptions::HttpListenOptions() : valid_(true), port_(), host_(), backlog_() {}

HttpListenOptions::HttpListenOptions(const inox::Value& value)
  : valid_(false), port_(), host_(), backlog_() {
  if (!readOptionalNumber(value, "port", port_, 0, 65535) ||
      !readOptionalString(value, "host", host_) ||
      !readOptionalNumber(value, "backlog", backlog_, 0, std::numeric_limits<int>::max())) {
    return;
  }

  valid_ = true;
}

HttpRequestOptions::HttpRequestOptions()
  : valid_(true), host_(), hostname_(), method_(), path_(), port_(), headers_() {}

HttpRequestOptions::HttpRequestOptions(const inox::Value& value)
  : valid_(false), host_(), hostname_(), method_(), path_(), port_(), headers_() {
  if (!readOptionalObject(value, "headers", headers_) ||
      !readOptionalString(value, "host", host_) ||
      !readOptionalString(value, "hostname", hostname_) ||
      !readOptionalString(value, "method", method_) ||
      !readOptionalString(value, "path", path_) ||
      !readOptionalNumber(value, "port", port_, 1, 65535)) {
    return;
  }

  valid_ = true;
}

const inox::Value& HttpRequestOptions::headers() const {
  return headers_;
}

const std::optional<inox::String>& HttpRequestOptions::host() const {
  return host_;
}

const std::optional<inox::String>& HttpRequestOptions::hostname() const {
  return hostname_;
}

const std::optional<inox::String>& HttpRequestOptions::method() const {
  return method_;
}

const std::optional<inox::String>& HttpRequestOptions::path() const {
  return path_;
}

const std::optional<double>& HttpRequestOptions::port() const {
  return port_;
}

bool HttpRequestOptions::valid() const {
  return valid_;
}

HttpHeaders::HttpHeaders() : value_() {}

HttpHeaders::HttpHeaders(const inox::Value& value) : value_(value) {
  if (value.tag != INOX_TAG_OBJECT) {
    throwHttpError("TypeError: HTTP headers must be an object");
  }
}

HttpServer::HttpServer() : inox::Value() {}

HttpServer::HttpServer(const inox::Value& value) : inox::Value(value) {}

HttpServer::HttpServer(inox::Value&& value) : inox::Value(std::move(value)) {}

NetAddress HttpServer::address() const {
  std::shared_ptr<HttpServerState> state = serverState(*this);

  if (!state) {
    throwHttpError("TypeError: HttpServer.address failed");
    return {inox::String(""), inox::String(""), 0};
  }

  return state->net_server_.address();
}

HttpServer& HttpServer::close() {
  return close(inox::Callback());
}

HttpServer& HttpServer::close(inox::Callback callback) {
  std::shared_ptr<HttpServerState> state = serverState(*this);

  if (!state) {
    throwHttpError("TypeError: HttpServer.close failed");
    return *this;
  }

  state->close(std::move(callback));
  return *this;
}

HttpServer& HttpServer::listen() {
  return listen(0, inox::StringView(), 511, inox::Callback());
}

HttpServer& HttpServer::listen(inox::Callback callback) {
  return listen(0, inox::StringView(), 511, std::move(callback));
}

HttpServer& HttpServer::listen(double port) {
  return listen(port, inox::StringView(), 511, inox::Callback());
}

HttpServer& HttpServer::listen(double port, inox::Callback callback) {
  return listen(port, inox::StringView(), 511, std::move(callback));
}

HttpServer& HttpServer::listen(double port, inox::StringView host) {
  return listen(port, host, 511, inox::Callback());
}

HttpServer& HttpServer::listen(double port, inox::StringView host, inox::Callback callback) {
  return listen(port, host, 511, std::move(callback));
}

HttpServer& HttpServer::listen(const HttpListenOptions& options) {
  return listen(options, inox::Callback());
}

HttpServer& HttpServer::listen(const HttpListenOptions& options, inox::Callback callback) {
  if (!options.valid_) {
    throwHttpError("TypeError: HttpServer.listen options are invalid");
    return *this;
  }

  const double port = options.port_.value_or(0);
  const double backlog = options.backlog_.value_or(511);
  const inox::StringView host = options.host_.has_value()
    ? static_cast<inox::StringView>(*options.host_)
    : inox::StringView();
  return listen(port, host, backlog, std::move(callback));
}

HttpServer& HttpServer::listen(
  double port,
  inox::StringView host,
  double backlog,
  inox::Callback callback
) {
  std::shared_ptr<HttpServerState> state = serverState(*this);

  if (!state) {
    throwHttpError("TypeError: HttpServer.listen failed");
    return *this;
  }

  state->listen(port, host, backlog, std::move(callback));
  return *this;
}

HttpServer& HttpServer::on(inox::StringView event_name, inox::Callback listener) {
  std::shared_ptr<HttpServerState> state = serverState(*this);

  if (!state) {
    throwHttpError("TypeError: HttpServer.on failed");
    return *this;
  }

  state->on(event_name, std::move(listener));
  return *this;
}

HttpRequest::HttpRequest() : inox::Value() {}

HttpRequest::HttpRequest(const inox::Value& value) : inox::Value(value) {}

HttpRequest::HttpRequest(inox::Value&& value) : inox::Value(std::move(value)) {}

inox::Value HttpRequest::headers() const {
  std::shared_ptr<HttpRequestState> state = requestState(*this);

  if (!state) {
    throwHttpError("TypeError: HttpRequest.headers failed");
    return inox::Value();
  }

  return state->headers_;
}

inox::String HttpRequest::httpVersion() const {
  std::shared_ptr<HttpRequestState> state = requestState(*this);

  if (!state) {
    throwHttpError("TypeError: HttpRequest.httpVersion failed");
    return inox::String("");
  }

  return state->http_version_;
}

inox::String HttpRequest::method() const {
  std::shared_ptr<HttpRequestState> state = requestState(*this);

  if (!state) {
    throwHttpError("TypeError: HttpRequest.method failed");
    return inox::String("");
  }

  return state->method_;
}

HttpRequest& HttpRequest::on(inox::StringView event_name, inox::Callback listener) {
  std::shared_ptr<HttpRequestState> state = requestState(*this);

  if (!state) {
    throwHttpError("TypeError: HttpRequest.on failed");
    return *this;
  }

  state->on(event_name, std::move(listener));
  return *this;
}

HttpRequest& HttpRequest::setEncoding(inox::StringView encoding) {
  if (!hasText(encoding, "utf8") && !hasText(encoding, "utf-8")) {
    throwHttpError("TypeError: HttpRequest.setEncoding supports only utf8");
  }

  return *this;
}

NetSocket HttpRequest::socket() const {
  std::shared_ptr<HttpRequestState> state = requestState(*this);

  if (!state) {
    throwHttpError("TypeError: HttpRequest.socket failed");
    return NetSocket();
  }

  return state->socket_;
}

inox::Value HttpRequest::statusCode() const {
  std::shared_ptr<HttpRequestState> state = requestState(*this);

  if (!state) {
    throwHttpError("TypeError: HttpRequest.statusCode failed");
    return inox::Value();
  }

  return state->status_code_ ? inox::Value(inox_number_value(*state->status_code_)) : inox::Value();
}

inox::Value HttpRequest::statusMessage() const {
  std::shared_ptr<HttpRequestState> state = requestState(*this);

  if (!state) {
    throwHttpError("TypeError: HttpRequest.statusMessage failed");
    return inox::Value();
  }

  return state->status_message_ ? inox::Value(*state->status_message_) : inox::Value();
}

inox::String HttpRequest::url() const {
  std::shared_ptr<HttpRequestState> state = requestState(*this);

  if (!state) {
    throwHttpError("TypeError: HttpRequest.url failed");
    return inox::String("");
  }

  return state->url_;
}

HttpClientRequest::HttpClientRequest() : inox::Value() {}

HttpClientRequest::HttpClientRequest(const inox::Value& value) : inox::Value(value) {}

HttpClientRequest::HttpClientRequest(inox::Value&& value) : inox::Value(std::move(value)) {}

HttpClientRequest& HttpClientRequest::destroy() {
  std::shared_ptr<HttpClientRequestState> state = clientRequestState(*this);

  if (!state) {
    throwHttpError("TypeError: HttpClientRequest.destroy failed");
    return *this;
  }

  state->destroy();
  return *this;
}

HttpClientRequest& HttpClientRequest::end() {
  return end(inox::StringView());
}

HttpClientRequest& HttpClientRequest::end(inox::StringView body) {
  std::shared_ptr<HttpClientRequestState> state = clientRequestState(*this);

  if (!state) {
    throwHttpError("TypeError: HttpClientRequest.end failed");
    return *this;
  }

  state->end(std::span<const std::uint8_t>(reinterpret_cast<const std::uint8_t*>(body.bytes), body.len));
  return *this;
}

HttpClientRequest& HttpClientRequest::end(const Uint8Array& body) {
  std::shared_ptr<HttpClientRequestState> state = clientRequestState(*this);

  if (!state) {
    throwHttpError("TypeError: HttpClientRequest.end failed");
    return *this;
  }

  const std::span<const std::uint8_t> bytes = body.bytes();

  if (!inox::thrown()) {
    state->end(bytes);
  }

  return *this;
}

inox::Value HttpClientRequest::getHeader(inox::StringView name) const {
  std::shared_ptr<HttpClientRequestState> state = clientRequestState(*this);

  if (!state) {
    throwHttpError("TypeError: HttpClientRequest.getHeader failed");
    return inox::Value();
  }

  return state->getHeader(name);
}

Array HttpClientRequest::getHeaderNames() const {
  std::shared_ptr<HttpClientRequestState> state = clientRequestState(*this);

  if (!state) {
    throwHttpError("TypeError: HttpClientRequest.getHeaderNames failed");
    return Array();
  }

  return state->getHeaderNames();
}

bool HttpClientRequest::hasHeader(inox::StringView name) const {
  std::shared_ptr<HttpClientRequestState> state = clientRequestState(*this);

  if (!state) {
    throwHttpError("TypeError: HttpClientRequest.hasHeader failed");
    return false;
  }

  return state->hasHeader(name);
}

bool HttpClientRequest::headersSent() const {
  std::shared_ptr<HttpClientRequestState> state = clientRequestState(*this);

  if (!state) {
    throwHttpError("TypeError: HttpClientRequest.headersSent failed");
    return false;
  }

  return state->headersSent();
}

HttpClientRequest& HttpClientRequest::on(inox::StringView event_name, inox::Callback listener) {
  std::shared_ptr<HttpClientRequestState> state = clientRequestState(*this);

  if (!state) {
    throwHttpError("TypeError: HttpClientRequest.on failed");
    return *this;
  }

  state->on(event_name, std::move(listener));
  return *this;
}

void HttpClientRequest::removeHeader(inox::StringView name) {
  std::shared_ptr<HttpClientRequestState> state = clientRequestState(*this);

  if (!state) {
    throwHttpError("TypeError: HttpClientRequest.removeHeader failed");
    return;
  }

  state->removeHeader(name);
}

HttpClientRequest& HttpClientRequest::setHeader(inox::StringView name, inox::StringView value) {
  std::shared_ptr<HttpClientRequestState> state = clientRequestState(*this);

  if (!state) {
    throwHttpError("TypeError: HttpClientRequest.setHeader failed");
    return *this;
  }

  state->setHeader(name, value);
  return *this;
}

bool HttpClientRequest::writableEnded() const {
  std::shared_ptr<HttpClientRequestState> state = clientRequestState(*this);

  if (!state) {
    throwHttpError("TypeError: HttpClientRequest.writableEnded failed");
    return false;
  }

  return state->writableEnded();
}

bool HttpClientRequest::write(inox::StringView body) {
  std::shared_ptr<HttpClientRequestState> state = clientRequestState(*this);

  if (!state) {
    throwHttpError("TypeError: HttpClientRequest.write failed");
    return false;
  }

  return state->write(std::span<const std::uint8_t>(
    reinterpret_cast<const std::uint8_t*>(body.bytes),
    body.len
  ));
}

bool HttpClientRequest::write(const Uint8Array& body) {
  std::shared_ptr<HttpClientRequestState> state = clientRequestState(*this);

  if (!state) {
    throwHttpError("TypeError: HttpClientRequest.write failed");
    return false;
  }

  const std::span<const std::uint8_t> bytes = body.bytes();
  return inox::thrown() ? false : state->write(bytes);
}

HttpResponse::HttpResponse() : inox::Value() {}

HttpResponse::HttpResponse(const inox::Value& value) : inox::Value(value) {}

HttpResponse::HttpResponse(inox::Value&& value) : inox::Value(std::move(value)) {}

void HttpResponse::end() {
  end(inox::StringView());
}

void HttpResponse::end(inox::StringView body) {
  std::shared_ptr<HttpResponseState> state = responseState(*this);

  if (!state) {
    throwHttpError("TypeError: HttpResponse.end failed");
    return;
  }

  state->end(std::span<const std::uint8_t>(
    reinterpret_cast<const std::uint8_t*>(body.bytes),
    body.len
  ));
}

void HttpResponse::end(const Uint8Array& body) {
  std::shared_ptr<HttpResponseState> state = responseState(*this);

  if (!state) {
    throwHttpError("TypeError: HttpResponse.end failed");
    return;
  }

  const std::span<const std::uint8_t> bytes = body.bytes();

  if (!inox::thrown()) {
    state->end(bytes);
  }
}

inox::Value HttpResponse::getHeader(inox::StringView name) const {
  std::shared_ptr<HttpResponseState> state = responseState(*this);

  if (!state) {
    throwHttpError("TypeError: HttpResponse.getHeader failed");
    return inox::Value();
  }

  return state->getHeader(name);
}

Array HttpResponse::getHeaderNames() const {
  std::shared_ptr<HttpResponseState> state = responseState(*this);

  if (!state) {
    throwHttpError("TypeError: HttpResponse.getHeaderNames failed");
    return Array();
  }

  return state->getHeaderNames();
}

bool HttpResponse::hasHeader(inox::StringView name) const {
  std::shared_ptr<HttpResponseState> state = responseState(*this);

  if (!state) {
    throwHttpError("TypeError: HttpResponse.hasHeader failed");
    return false;
  }

  return state->hasHeader(name);
}

bool HttpResponse::headersSent() const {
  std::shared_ptr<HttpResponseState> state = responseState(*this);

  if (!state) {
    throwHttpError("TypeError: HttpResponse.headersSent failed");
    return false;
  }

  return state->headersSent();
}

void HttpResponse::removeHeader(inox::StringView name) {
  std::shared_ptr<HttpResponseState> state = responseState(*this);

  if (!state) {
    throwHttpError("TypeError: HttpResponse.removeHeader failed");
    return;
  }

  state->removeHeader(name);
}

HttpResponse& HttpResponse::setHeader(inox::StringView name, inox::StringView value) {
  std::shared_ptr<HttpResponseState> state = responseState(*this);

  if (!state) {
    throwHttpError("TypeError: HttpResponse.setHeader failed");
    return *this;
  }

  state->setHeader(name, value);
  return *this;
}

double HttpResponse::statusCode() const {
  std::shared_ptr<HttpResponseState> state = responseState(*this);

  if (!state) {
    throwHttpError("TypeError: HttpResponse.statusCode failed");
    return 0;
  }

  return state->status_code_;
}

void HttpResponse::setStatusCode(double value) {
  std::shared_ptr<HttpResponseState> state = responseState(*this);

  if (!state) {
    throwHttpError("TypeError: HttpResponse.statusCode failed");
    return;
  }

  state->setStatusCode(value);
}

bool HttpResponse::writableEnded() const {
  std::shared_ptr<HttpResponseState> state = responseState(*this);

  if (!state) {
    throwHttpError("TypeError: HttpResponse.writableEnded failed");
    return false;
  }

  return state->writableEnded();
}

bool HttpResponse::write(inox::StringView body) {
  std::shared_ptr<HttpResponseState> state = responseState(*this);

  if (!state) {
    throwHttpError("TypeError: HttpResponse.write failed");
    return false;
  }

  return state->write(std::span<const std::uint8_t>(
    reinterpret_cast<const std::uint8_t*>(body.bytes),
    body.len
  ));
}

bool HttpResponse::write(const Uint8Array& body) {
  std::shared_ptr<HttpResponseState> state = responseState(*this);

  if (!state) {
    throwHttpError("TypeError: HttpResponse.write failed");
    return false;
  }

  const std::span<const std::uint8_t> bytes = body.bytes();
  return inox::thrown() ? false : state->write(bytes);
}

HttpResponse& HttpResponse::writeHead(double status_code) {
  setStatusCode(status_code);
  return *this;
}

HttpResponse& HttpResponse::writeHead(double status_code, const HttpHeaders& headers) {
  std::shared_ptr<HttpResponseState> state = responseState(*this);

  if (!state) {
    throwHttpError("TypeError: HttpResponse.writeHead failed");
    return *this;
  }

  state->setStatusCode(status_code);

  if (!inox::thrown()) {
    state->applyHeaders(headers.value_);
  }

  return *this;
}

HttpServer HttpModule::createServer() const {
  return createServer(inox::Callback());
}

HttpServer HttpModule::createServer(inox::Callback listener) const {
  return materializeServer(HttpServerState::create(std::move(listener)));
}

namespace {

HttpClientRequest createHttpClientRequestImpl(
  inox::StringView url,
  const HttpRequestOptions* options,
  inox::Callback listener,
  bool end_immediately,
  const HttpClientTransportOptions& transport
) {
  std::shared_ptr<HttpClientRequestState> state = HttpClientRequestState::create(
    url,
    options,
    std::move(listener),
    transport
  );
  HttpClientRequest request = materializeClientRequest(state);

  if (end_immediately && state && !inox::thrown()) {
    state->end({});
  }

  return request;
}

} // namespace

HttpClientRequest createHttpClientRequest(
  inox::StringView url,
  inox::Callback listener,
  bool end_immediately,
  const HttpClientTransportOptions& transport
) {
  return createHttpClientRequestImpl(url, nullptr, std::move(listener), end_immediately, transport);
}

HttpClientRequest createHttpClientRequest(
  inox::StringView url,
  const HttpRequestOptions& options,
  inox::Callback listener,
  bool end_immediately,
  const HttpClientTransportOptions& transport
) {
  return createHttpClientRequestImpl(url, &options, std::move(listener), end_immediately, transport);
}

HttpClientRequest HttpModule::get(inox::StringView url) const {
  return createHttpClientRequest(url, inox::Callback(), true, HttpClientTransportOptions::plain());
}

HttpClientRequest HttpModule::get(inox::StringView url, inox::Callback listener) const {
  return createHttpClientRequest(url, std::move(listener), true, HttpClientTransportOptions::plain());
}

HttpClientRequest HttpModule::get(inox::StringView url, const HttpRequestOptions& options) const {
  return createHttpClientRequest(url, options, inox::Callback(), true, HttpClientTransportOptions::plain());
}

HttpClientRequest HttpModule::get(
  inox::StringView url,
  const HttpRequestOptions& options,
  inox::Callback listener
) const {
  return createHttpClientRequest(url, options, std::move(listener), true, HttpClientTransportOptions::plain());
}

HttpClientRequest HttpModule::get(const HttpRequestOptions& options) const {
  return createHttpClientRequest(
    inox::StringView(), options, inox::Callback(), true, HttpClientTransportOptions::plain()
  );
}

HttpClientRequest HttpModule::get(const HttpRequestOptions& options, inox::Callback listener) const {
  return createHttpClientRequest(
    inox::StringView(), options, std::move(listener), true, HttpClientTransportOptions::plain()
  );
}

HttpClientRequest HttpModule::request(inox::StringView url) const {
  return createHttpClientRequest(url, inox::Callback(), false, HttpClientTransportOptions::plain());
}

HttpClientRequest HttpModule::request(inox::StringView url, inox::Callback listener) const {
  return createHttpClientRequest(url, std::move(listener), false, HttpClientTransportOptions::plain());
}

HttpClientRequest HttpModule::request(inox::StringView url, const HttpRequestOptions& options) const {
  return createHttpClientRequest(url, options, inox::Callback(), false, HttpClientTransportOptions::plain());
}

HttpClientRequest HttpModule::request(
  inox::StringView url,
  const HttpRequestOptions& options,
  inox::Callback listener
) const {
  return createHttpClientRequest(url, options, std::move(listener), false, HttpClientTransportOptions::plain());
}

HttpClientRequest HttpModule::request(const HttpRequestOptions& options) const {
  return createHttpClientRequest(
    inox::StringView(), options, inox::Callback(), false, HttpClientTransportOptions::plain()
  );
}

HttpClientRequest HttpModule::request(const HttpRequestOptions& options, inox::Callback listener) const {
  return createHttpClientRequest(
    inox::StringView(), options, std::move(listener), false, HttpClientTransportOptions::plain()
  );
}

const HttpModule http;
