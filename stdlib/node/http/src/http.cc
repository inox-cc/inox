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
#include "inox/http_server_transport.h"
#include "inox/loop.h"
#include "inox/net.h"
#include "inox/object.h"
#include "inox/tls.h"

HttpServerConnectionTransport::~HttpServerConnectionTransport() = default;

namespace {

constexpr std::size_t maxRequestHeaderBytes = 64 * 1024;
constexpr std::size_t maxBufferedRequestBytes = 256 * 1024;
constexpr std::size_t maxRequestHeaders = 64;
constexpr std::size_t maxResponseHeaders = 64;
constexpr std::size_t maxResponseHeaderBytes = 16 * 1024;
constexpr std::size_t maxBufferedResponseBytes = 256 * 1024;
constexpr std::size_t maxChunkMetadataLineBytes = 16 * 1024;
constexpr std::size_t httpHighWaterMark = 16 * 1024;

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

bool readAbortState(const inox::Value& signal, bool& aborted) {
  inox::Value field;
  bool present = false;

  if (!readObjectField(signal, "aborted", field, present) || !present || field.tag != INOX_TAG_BOOL) {
    if (!inox::thrown()) throwHttpError("TypeError: HTTP AbortSignal is invalid");
    return false;
  }

  aborted = field.as.boolean != 0;
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

class NetHttpServerConnectionTransport final : public HttpServerConnectionTransport {
public:
  explicit NetHttpServerConnectionTransport(NetSocket socket) : socket_(std::move(socket)) {}

  void destroy() override {
    socket_.destroy();
  }

  void end(inox::StringView data, inox::Callback callback) override {
    socket_.end(data, std::move(callback));
  }

  NetSocket socket() const override {
    return socket_;
  }

  void start(
    inox::Callback close,
    inox::Callback error,
    inox::Callback data,
    inox::Callback drain
  ) override {
    socket_.on("close", std::move(close));

    if (!inox::thrown()) {
      socket_.on("error", std::move(error));
    }

    if (!inox::thrown()) {
      socket_.on("data", std::move(data));
    }

    if (!inox::thrown()) {
      socket_.on("drain", std::move(drain));
    }
  }

  bool write(inox::StringView data) override {
    return socket_.write(data);
  }

  bool write(inox::StringView data, inox::Callback callback) override {
    return socket_.write(data, std::move(callback));
  }

private:
  NetSocket socket_;
};

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
  std::weak_ptr<HttpConnectionState> server_connection_;
  std::weak_ptr<HttpClientRequestState> client_request_;
  bool paused_;
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
      server_connection_(),
      client_request_(),
      paused_(false),
      ended_(false),
      closed_(false) {}

  void emitClose();
  void emitData(inox::StringView data);
  void emitEnd();
  void emitError(const inox::Value& error);
  bool isPaused() const;
  void on(inox::StringView event_name, inox::Callback listener);
  void pause();
  void resume();
};

class HttpResponseState : public std::enable_shared_from_this<HttpResponseState> {
public:
  std::shared_ptr<HttpConnectionState> connection_;
  std::vector<ResponseHeader> headers_;
  std::optional<std::size_t> content_length_;
  std::size_t body_bytes_written_;
  std::vector<inox::Callback> drain_listeners_;
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
  void emitDrain();
  void on(inox::StringView event_name, inox::Callback listener);
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
  std::vector<inox::Callback> timeout_listeners_;
  std::vector<std::weak_ptr<HttpConnectionState>> connections_;
  std::shared_ptr<HttpServerState> native_owner_;
  bool closed_;
  double timeout_ms_;

  HttpServerState();

  static std::shared_ptr<HttpServerState> create(inox::Callback listener);
  static std::shared_ptr<HttpServerState> create(NetServer server, inox::Callback listener);
  void accept(std::shared_ptr<HttpServerConnectionTransport> transport);
  void close(inox::Callback callback);
  void connectionClosed(const HttpConnectionState* connection);
  void listen(double port, inox::StringView host, double backlog, inox::Callback callback);
  void on(inox::StringView event_name, inox::Callback listener);
  void onNetClosed();
  void setTimeout(double milliseconds, inox::Callback callback);
};

class HttpConnectionState : public std::enable_shared_from_this<HttpConnectionState> {
public:
  std::shared_ptr<HttpServerState> server_;
  std::shared_ptr<HttpServerConnectionTransport> transport_;
  NetSocket socket_;
  std::vector<char> request_bytes_;
  std::shared_ptr<HttpRequestState> active_request_;
  std::shared_ptr<HttpResponseState> active_response_;
  std::shared_ptr<HttpConnectionState> native_owner_;
  std::size_t active_body_cursor_;
  std::size_t active_body_expected_;
  std::size_t active_body_received_;
  std::size_t active_chunk_remaining_;
  std::size_t active_trailer_bytes_;
  std::size_t active_trailer_count_;
  HttpChunkDecodeState active_chunk_state_;
  bool active_keep_alive_;
  bool active_http_1_0_;
  bool active_chunked_;
  bool active_request_complete_;
  bool active_response_complete_;
  bool request_dispatched_;
  bool consuming_request_body_;
  bool closed_;
  double timeout_ms_;
  inox_timer_handle* timeout_timer_;

  HttpConnectionState(
    std::shared_ptr<HttpServerState> server,
    std::shared_ptr<HttpServerConnectionTransport> transport
  );

  static std::shared_ptr<HttpConnectionState> create(
    const std::shared_ptr<HttpServerState>& server,
    std::shared_ptr<HttpServerConnectionTransport> transport
  );
  void completeResponse(bool keep_alive);
  void compactRequestBytes(std::size_t consumed);
  bool consumeRequestBody();
  bool consumeChunkedRequestBody();
  void failRequestBody(double status, const char* message);
  void finishRequestBody();
  void onClose();
  void onData(inox::StringView data);
  void onDrain();
  void onTimeout();
  void resetRequest();
  void resumeRequestBody();
  void sendError(double status, inox::StringView message);
  void stopTimeout();
  void touchTimeout();
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
  bool drain_attached_;
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
  void onDrain();
  void onEnd();
  void onError(const inox::Value& error);
  bool attachDrain();
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
  std::vector<char> paused_response_bytes_;
  std::vector<inox::Callback> response_listeners_;
  std::vector<inox::Callback> finish_listeners_;
  std::vector<inox::Callback> close_listeners_;
  std::vector<inox::Callback> error_listeners_;
  std::vector<inox::Callback> drain_listeners_;
  std::vector<inox::Callback> timeout_listeners_;
  HttpClientTransportKind transport_kind_;
  std::shared_ptr<HttpClientConnectionState> connection_;
  std::shared_ptr<HttpRequestState> response_;
  std::shared_ptr<HttpClientRequestState> native_owner_;
  std::optional<std::size_t> response_content_length_;
  std::vector<char> response_chunk_bytes_;
  std::size_t response_body_received_;
  std::size_t response_trailer_bytes_;
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
  bool pending_needs_drain_;
  bool ending_;
  bool sent_;
  bool finished_;
  bool response_started_;
  bool response_transport_ended_;
  bool failed_;
  bool closed_;
  bool destroyed_;
  double timeout_ms_;
  inox_timer_handle* timeout_timer_;
  inox::Value abort_signal_;
  inox_timer_handle* abort_timer_;

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
  void destroy(const inox::Value& error);
  bool destroyed() const;
  void end(std::span<const std::uint8_t> body);
  inox::Value getHeader(inox::StringView name) const;
  Array getHeaderNames() const;
  bool hasHeader(inox::StringView name) const;
  bool headersSent() const;
  void on(inox::StringView event_name, inox::Callback listener);
  void onClose();
  void onConnect();
  void onData(inox::StringView data);
  void onDrain();
  void onEnd();
  void onError(const inox::Value& error);
  void onAbortPoll();
  void onFinish();
  void onTimeout();
  void resumeResponseBody();
  void removeHeader(inox::StringView name);
  void setHeader(inox::StringView name, inox::StringView value);
  void setTimeout(double milliseconds, inox::Callback callback);
  bool writableEnded() const;
  bool write(std::span<const std::uint8_t> body);

private:
  bool appendRequestBody(std::string& output, std::span<const std::uint8_t> body);
  bool beginRequest(bool streaming, std::size_t initial_body_size, std::string& output);
  bool consumeChunkedBody(inox::StringView data);
  bool consumeResponseBody(inox::StringView data);
  bool deliverResponseBody(inox::StringView data);
  bool bufferPausedResponse(inox::StringView data);
  void completeResponseBody();
  bool send(std::string& output, bool final);
  bool startAbortPolling();
  void stopAbortPolling();
  void stopTimeout();
  void touchTimeout();
};

template <typename State>
struct HttpTimerContext {
  std::weak_ptr<State> state;
};

template <typename State>
void finalizeHttpTimer(void* raw_context) {
  delete static_cast<HttpTimerContext<State>*>(raw_context);
}

inox_status onServerConnectionTimeout(void* context);
inox_status onClientRequestTimeout(void* context);
inox_status onClientAbortPoll(void* context);

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
  {"destroyed", "boolean", "boolean", "value", INOX_CLASS_FIELD_READONLY | INOX_CLASS_FIELD_ENUMERABLE},
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
  3,
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
    *out = inox_bool_value(holder->state->destroyed());
    return INOX_OK;
  }

  if (index == 1) {
    *out = inox_bool_value(holder->state->headersSent());
    return INOX_OK;
  }

  if (index == 2) {
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
inox_status onConnectionDrain(void* context, const inox_value* args, std::size_t arg_count, inox_value* out);
inox_status onResponseComplete(void* context, const inox_value* args, std::size_t arg_count, inox_value* out);
inox_status onClientConnect(void* context, const inox_value* args, std::size_t arg_count, inox_value* out);
inox_status onClientData(void* context, const inox_value* args, std::size_t arg_count, inox_value* out);
inox_status onClientEnd(void* context, const inox_value* args, std::size_t arg_count, inox_value* out);
inox_status onClientClose(void* context, const inox_value* args, std::size_t arg_count, inox_value* out);
inox_status onClientError(void* context, const inox_value* args, std::size_t arg_count, inox_value* out);
inox_status onClientFinish(void* context, const inox_value* args, std::size_t arg_count, inox_value* out);
inox_status onClientDrain(void* context, const inox_value* args, std::size_t arg_count, inox_value* out);
inox_status onClientTlsConnect(void* context, inox_tls_client* client, inox_status status);
inox_status onClientTlsData(
  void* context,
  inox_tls_client* client,
  const char* bytes,
  std::size_t length
);
void onClientTlsClose(void* context, inox_tls_client* client);

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

    if (parsed > (std::numeric_limits<std::size_t>::max() - number) / 10) {
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
          !parseOutgoingContentLength(value, declared_content_length)) {
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

ParsedRequest parseRequest(std::span<const char> bytes) {
  const std::size_t missing = std::numeric_limits<std::size_t>::max();
  const std::size_t header_end = findHeaderEnd(bytes);

  if (header_end == missing) {
    return {bytes.size() >= maxRequestHeaderBytes ? RequestParseResult::too_large : RequestParseResult::incomplete, 0, 0, 0, 0};
  }

  if (header_end > maxRequestHeaderBytes) {
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

        if (parsed > (std::numeric_limits<std::size_t>::max() - number) / 10) {
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

bool HttpRequestState::isPaused() const {
  return paused_;
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

void HttpRequestState::pause() {
  if (ended_ || closed_ || paused_) {
    return;
  }

  paused_ = true;
  socket_.pause();

  if (inox::thrown()) {
    paused_ = false;
  }
}

void HttpRequestState::resume() {
  if (ended_ || closed_ || !paused_) {
    return;
  }

  paused_ = false;

  if (const std::shared_ptr<HttpConnectionState> connection = server_connection_.lock()) {
    connection->resumeRequestBody();
  } else if (const std::shared_ptr<HttpClientRequestState> request = client_request_.lock()) {
    request->resumeResponseBody();
  }

  if (!inox::thrown() && !ended_ && !closed_) {
    socket_.resume();
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

inox_status onServerConnectionTimeout(void* context) {
  const auto* timer = static_cast<HttpTimerContext<HttpConnectionState>*>(context);
  const std::shared_ptr<HttpConnectionState> connection = timer == nullptr ? nullptr : timer->state.lock();

  if (connection) connection->onTimeout();
  return callbackStatus();
}

inox_status onClientRequestTimeout(void* context) {
  const auto* timer = static_cast<HttpTimerContext<HttpClientRequestState>*>(context);
  const std::shared_ptr<HttpClientRequestState> request = timer == nullptr ? nullptr : timer->state.lock();

  if (request) request->onTimeout();
  return callbackStatus();
}

inox_status onClientAbortPoll(void* context) {
  const auto* timer = static_cast<HttpTimerContext<HttpClientRequestState>*>(context);
  const std::shared_ptr<HttpClientRequestState> request = timer == nullptr ? nullptr : timer->state.lock();

  if (request) request->onAbortPoll();
  return callbackStatus();
}

HttpServerState::HttpServerState()
  : net_server_(),
    request_listeners_(),
    timeout_listeners_(),
    connections_(),
    native_owner_(),
    closed_(false),
    timeout_ms_(0) {}

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

std::shared_ptr<HttpServerState> HttpServerState::create(
  NetServer net_server,
  inox::Callback listener
) {
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
  inox::Callback close = makeWeakCallback(server, onServerClose);

  if (inox::thrown()) {
    server->native_owner_.reset();
    return {};
  }

  server->net_server_ = std::move(net_server);
  server->net_server_.on("close", std::move(close));

  if (inox::thrown()) {
    server->net_server_.close();
    server->native_owner_.reset();
    return {};
  }

  return server;
}

void HttpServerState::accept(std::shared_ptr<HttpServerConnectionTransport> transport) {
  if (!transport) {
    throwHttpError("TypeError: HTTP connection transport is invalid");
    return;
  }

  if (closed_) {
    transport->destroy();
    return;
  }

  std::shared_ptr<HttpConnectionState> connection = HttpConnectionState::create(
    shared_from_this(),
    std::move(transport)
  );

  if (!connection) {
    return;
  }

  try {
    connections_.push_back(connection);
  } catch (const std::bad_alloc&) {
    connection->transport_->destroy();
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
        connection->transport_->destroy();
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
  if (!listener.valid() || closed_) {
    throwHttpError("TypeError: HttpServer.on requires an active server and listener");
    return;
  }

  std::vector<inox::Callback>* listeners = nullptr;

  if (hasText(event_name, "request")) listeners = &request_listeners_;
  else if (hasText(event_name, "timeout")) listeners = &timeout_listeners_;
  else {
    throwHttpError("TypeError: HttpServer.on supports only request and timeout listeners");
    return;
  }

  try {
    listeners->push_back(std::move(listener));
  } catch (const std::bad_alloc&) {
    throwHttpError("TypeError: HttpServer listener allocation failed");
  }
}

void HttpServerState::setTimeout(double milliseconds, inox::Callback callback) {
  if (closed_ || !std::isfinite(milliseconds) || std::floor(milliseconds) != milliseconds || milliseconds < 0) {
    throwHttpError("TypeError: HttpServer.setTimeout requires a non-negative integer");
    return;
  }

  timeout_ms_ = milliseconds;

  if (!callback.valid()) return;

  try {
    timeout_listeners_.push_back(std::move(callback));
  } catch (const std::bad_alloc&) {
    throwHttpError("TypeError: HttpServer timeout listener allocation failed");
  }
}

void HttpServerState::onNetClosed() {
  std::shared_ptr<HttpServerState> owner = native_owner_;
  closed_ = true;
  native_owner_.reset();
}

HttpConnectionState::HttpConnectionState(
  std::shared_ptr<HttpServerState> server,
  std::shared_ptr<HttpServerConnectionTransport> transport
)
  : server_(std::move(server)),
    transport_(std::move(transport)),
    socket_(transport_ ? transport_->socket() : NetSocket()),
    request_bytes_(),
    active_request_(),
    active_response_(),
    native_owner_(),
    active_body_cursor_(0),
    active_body_expected_(0),
    active_body_received_(0),
    active_chunk_remaining_(0),
    active_trailer_bytes_(0),
    active_trailer_count_(0),
    active_chunk_state_(HttpChunkDecodeState::size),
    active_keep_alive_(false),
    active_http_1_0_(false),
    active_chunked_(false),
    active_request_complete_(false),
    active_response_complete_(false),
    request_dispatched_(false),
    consuming_request_body_(false),
    closed_(false),
    timeout_ms_(server_ ? server_->timeout_ms_ : 0),
    timeout_timer_(nullptr) {}

std::shared_ptr<HttpConnectionState> HttpConnectionState::create(
  const std::shared_ptr<HttpServerState>& server,
  std::shared_ptr<HttpServerConnectionTransport> transport
) {
  std::shared_ptr<HttpConnectionState> connection;

  try {
    connection = std::make_shared<HttpConnectionState>(server, transport);
    connection->request_bytes_.reserve(4096);
  } catch (const std::bad_alloc&) {
    if (transport) {
      transport->destroy();
    }

    throwHttpError("TypeError: HTTP connection allocation failed");
    return {};
  }

  connection->native_owner_ = connection;
  inox::Callback close = makeWeakCallback(connection, onConnectionClose);
  inox::Callback data = makeWeakCallback(connection, onConnectionData);
  inox::Callback error = makeWeakCallback(connection, onConnectionError);
  inox::Callback drain = makeWeakCallback(connection, onConnectionDrain);

  if (inox::thrown()) {
    connection->transport_->destroy();
    return {};
  }

  connection->transport_->start(
    std::move(close),
    std::move(error),
    std::move(data),
    std::move(drain)
  );

  if (inox::thrown()) {
    connection->transport_->destroy();
    return {};
  }

  connection->touchTimeout();

  if (inox::thrown()) {
    connection->transport_->destroy();
    return {};
  }

  return connection;
}

void HttpConnectionState::onClose() {
  std::shared_ptr<HttpConnectionState> owner = native_owner_;
  closed_ = true;
  stopTimeout();

  if (active_request_) {
    active_request_->emitClose();
  }

  if (server_) {
    server_->connectionClosed(this);
  }

  server_.reset();
  request_bytes_.clear();
  active_request_.reset();
  active_response_.reset();
  native_owner_.reset();
}

void HttpConnectionState::onDrain() {
  if (!closed_ && active_response_) {
    touchTimeout();
    active_response_->emitDrain();
  }
}

void HttpConnectionState::stopTimeout() {
  if (timeout_timer_ == nullptr) return;
  inox_timer_handle* timer = timeout_timer_;
  timeout_timer_ = nullptr;
  inox_loop_clear_timer(timer);
}

void HttpConnectionState::touchTimeout() {
  stopTimeout();

  if (closed_ || timeout_ms_ <= 0) return;

  auto* context = new (std::nothrow) HttpTimerContext<HttpConnectionState>{weak_from_this()};

  if (context == nullptr ||
      inox_loop_set_timeout(
        inox::loop(),
        timeout_ms_,
        onServerConnectionTimeout,
        context,
        finalizeHttpTimer<HttpConnectionState>,
        &timeout_timer_
      ) != INOX_OK) {
    delete context;
    timeout_timer_ = nullptr;
    throwHttpError("TypeError: HTTP server timeout allocation failed");
    return;
  }

  inox_loop_unref_timer(timeout_timer_);
}

void HttpConnectionState::onTimeout() {
  timeout_timer_ = nullptr;

  if (closed_ || !server_) return;

  if (server_->timeout_listeners_.empty()) {
    transport_->destroy();
    return;
  }

  const std::array<inox::Value, 1> arguments = {socket_};
  callHttpListeners(server_->timeout_listeners_, arguments);
}

void HttpConnectionState::resumeRequestBody() {
  if (!closed_ && request_dispatched_ && !active_request_complete_) {
    (void)consumeRequestBody();
  }
}

void HttpConnectionState::completeResponse(bool keep_alive) {
  if (closed_) {
    return;
  }

  if (!keep_alive || !server_ || server_->closed_) {
    transport_->destroy();
    return;
  }

  active_response_complete_ = true;

  if (!active_request_complete_) {
    return;
  }

  resetRequest();
}

void HttpConnectionState::resetRequest() {
  if (closed_) {
    return;
  }

  active_body_cursor_ = 0;
  active_body_expected_ = 0;
  active_body_received_ = 0;
  active_chunk_remaining_ = 0;
  active_trailer_bytes_ = 0;
  active_trailer_count_ = 0;
  active_chunk_state_ = HttpChunkDecodeState::size;
  active_keep_alive_ = false;
  active_http_1_0_ = false;
  active_chunked_ = false;
  active_request_complete_ = false;
  active_response_complete_ = false;
  request_dispatched_ = false;
  consuming_request_body_ = false;
  active_request_.reset();
  active_response_.reset();
  onData(inox::StringView());
}

void HttpConnectionState::compactRequestBytes(std::size_t consumed) {
  if (consumed == 0) {
    return;
  }

  if (consumed > request_bytes_.size()) {
    transport_->destroy();
    return;
  }

  request_bytes_.erase(
    request_bytes_.begin(),
    request_bytes_.begin() + static_cast<std::ptrdiff_t>(consumed)
  );
  active_body_cursor_ = 0;
}

bool HttpConnectionState::consumeRequestBody() {
  if (!active_request_ || active_request_complete_) {
    return true;
  }

  if (active_request_->paused_ || consuming_request_body_) {
    return true;
  }

  consuming_request_body_ = true;
  struct ConsumeGuard {
    bool& consuming;
    ~ConsumeGuard() { consuming = false; }
  } guard{consuming_request_body_};

  if (active_chunked_) {
    return consumeChunkedRequestBody();
  }

  if (active_body_cursor_ > request_bytes_.size() ||
      active_body_received_ > active_body_expected_) {
    failRequestBody(400, "bad request");
    return false;
  }

  compactRequestBytes(active_body_cursor_);

  if (closed_ || inox::thrown()) {
    return false;
  }

  const std::size_t available = request_bytes_.size();
  const std::size_t remaining = active_body_expected_ - active_body_received_;
  const std::size_t length = available < remaining ? available : remaining;

  if (length > 0) {
    active_request_->emitData(inox::StringView(request_bytes_.data() + active_body_cursor_, length));

    if (inox::thrown()) {
      transport_->destroy();
      return false;
    }

    active_body_received_ += length;
    compactRequestBytes(length);

    if (closed_ || inox::thrown()) {
      return false;
    }

    if (active_request_->paused_) {
      return true;
    }
  }

  if (active_body_received_ == active_body_expected_) {
    finishRequestBody();
  }

  return !inox::thrown();
}

bool HttpConnectionState::consumeChunkedRequestBody() {
  const std::size_t missing = std::numeric_limits<std::size_t>::max();

  compactRequestBytes(active_body_cursor_);

  if (closed_ || inox::thrown()) {
    return false;
  }

  for (;;) {
    const std::span<const char> bytes(request_bytes_);

    if (active_chunk_state_ == HttpChunkDecodeState::size) {
      const std::size_t line_end = findCrlf(bytes, 0);

      if (line_end == missing) {
        if (bytes.size() > maxChunkMetadataLineBytes) {
          failRequestBody(413, "payload too large");
          return false;
        }

        return true;
      }

      const std::size_t extension = findByte(bytes, 0, line_end, ';');
      const std::size_t size_end = extension == missing ? line_end : extension;

      if (size_end == 0 ||
          !validHeaderValue(inox::StringView(
            bytes.data(),
            line_end
          ))) {
        failRequestBody(400, "bad request");
        return false;
      }

      std::size_t chunk_size = 0;

      for (std::size_t index = 0; index < size_end; index += 1) {
        const unsigned char byte = static_cast<unsigned char>(bytes[index]);
        std::size_t digit = 0;

        if (byte >= '0' && byte <= '9') digit = byte - '0';
        else if (byte >= 'a' && byte <= 'f') digit = byte - 'a' + 10;
        else if (byte >= 'A' && byte <= 'F') digit = byte - 'A' + 10;
        else {
          failRequestBody(400, "bad request");
          return false;
        }

        if (chunk_size > (std::numeric_limits<std::size_t>::max() - digit) / 16) {
          failRequestBody(413, "payload too large");
          return false;
        }

        chunk_size = chunk_size * 16 + digit;
      }

      compactRequestBytes(line_end + 2);
      active_chunk_remaining_ = chunk_size;
      active_chunk_state_ = chunk_size == 0
        ? HttpChunkDecodeState::trailers
        : HttpChunkDecodeState::data;
      continue;
    }

    if (active_chunk_state_ == HttpChunkDecodeState::data) {
      const std::size_t available = bytes.size();
      const std::size_t length = available < active_chunk_remaining_
        ? available
        : active_chunk_remaining_;

      if (length > 0) {
        active_request_->emitData(inox::StringView(bytes.data(), length));

        if (inox::thrown()) {
          transport_->destroy();
          return false;
        }

        if (active_body_received_ > std::numeric_limits<std::size_t>::max() - length) {
          failRequestBody(413, "payload too large");
          return false;
        }

        active_body_received_ += length;
        active_chunk_remaining_ -= length;
        compactRequestBytes(length);

        if (closed_ || inox::thrown()) {
          return false;
        }

        if (active_request_->paused_) {
          return true;
        }
      }

      if (active_chunk_remaining_ > 0) {
        return true;
      }

      active_chunk_state_ = HttpChunkDecodeState::data_crlf;
      continue;
    }

    if (active_chunk_state_ == HttpChunkDecodeState::data_crlf) {
      if (bytes.size() < 2) {
        return true;
      }

      if (bytes[0] != '\r' || bytes[1] != '\n') {
        failRequestBody(400, "bad request");
        return false;
      }

      compactRequestBytes(2);
      active_chunk_state_ = HttpChunkDecodeState::size;
      continue;
    }

    if (active_chunk_state_ == HttpChunkDecodeState::trailers) {
      const std::size_t line_end = findCrlf(bytes, 0);

      if (line_end == missing) {
        if (bytes.size() > maxChunkMetadataLineBytes ||
            active_trailer_bytes_ > maxRequestHeaderBytes - bytes.size()) {
          failRequestBody(413, "payload too large");
          return false;
        }

        return true;
      }

      const std::size_t framing_length = line_end + 2;

      if (active_trailer_bytes_ > maxRequestHeaderBytes ||
          framing_length > maxRequestHeaderBytes - active_trailer_bytes_) {
        failRequestBody(413, "payload too large");
        return false;
      }

      active_trailer_bytes_ += framing_length;

      if (line_end == 0) {
        compactRequestBytes(2);
        active_chunk_state_ = HttpChunkDecodeState::complete;
        finishRequestBody();
        return !inox::thrown();
      }

      const std::size_t separator = findByte(bytes, 0, line_end, ':');

      if (separator == missing || separator == 0) {
        failRequestBody(400, "bad request");
        return false;
      }

      std::size_t value_start = separator + 1;
      std::size_t value_end = line_end;

      while (value_start < value_end && (bytes[value_start] == ' ' || bytes[value_start] == '\t')) {
        value_start += 1;
      }

      while (value_end > value_start && (bytes[value_end - 1] == ' ' || bytes[value_end - 1] == '\t')) {
        value_end -= 1;
      }

      const std::span<const char> name = bytes.subspan(
        0,
        separator
      );
      const inox::StringView value(bytes.data() + value_start, value_end - value_start);
      active_trailer_count_ += 1;

      if (active_trailer_count_ > maxRequestHeaders ||
          !validHeaderName(inox::StringView(name.data(), name.size())) ||
          !validHeaderValue(value) ||
          spanEqualsIgnoreCase(name, "Content-Length") ||
          spanEqualsIgnoreCase(name, "Transfer-Encoding")) {
        failRequestBody(400, "bad request");
        return false;
      }

      compactRequestBytes(line_end + 2);
      continue;
    }

    return active_chunk_state_ == HttpChunkDecodeState::complete;
  }
}

void HttpConnectionState::failRequestBody(double status, const char* message) {
  if (closed_) {
    return;
  }

  active_keep_alive_ = false;
  active_request_complete_ = true;
  inox::Value error = materializeHttpError(
    status == 413 ? "HTTP request body is too large" : "HTTP request body is invalid"
  );

  if (!inox::thrown() && active_request_) {
    active_request_->emitError(error);
  }

  if (inox::thrown()) {
    transport_->destroy();
    return;
  }

  if (active_response_ && !active_response_->headersSent() && !active_response_->writableEnded()) {
    active_response_->setStatusCode(status);

    if (!inox::thrown()) {
      active_response_->setHeader("Content-Type", "text/plain; charset=utf-8");
    }

    if (!inox::thrown()) {
      active_response_->end(std::span<const std::uint8_t>(
        reinterpret_cast<const std::uint8_t*>(message),
        std::strlen(message)
      ));
    }
  } else {
    transport_->destroy();
  }

  if (inox::thrown()) {
    transport_->destroy();
  }
}

void HttpConnectionState::finishRequestBody() {
  if (active_request_complete_ || !active_request_) {
    return;
  }

  active_request_complete_ = true;
  active_request_->emitEnd();

  if (inox::thrown()) {
    transport_->destroy();
    return;
  }

  if (active_response_complete_) {
    resetRequest();
  }
}

void HttpConnectionState::onData(inox::StringView data) {
  if (closed_) {
    return;
  }

  if (data.len > 0) touchTimeout();

  if (request_bytes_.size() > maxBufferedRequestBytes ||
      data.len > maxBufferedRequestBytes - request_bytes_.size()) {
    if (request_dispatched_) {
      failRequestBody(413, "payload too large");
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
        failRequestBody(500, "internal server error");
      } else {
        request_dispatched_ = true;
        sendError(500, "internal server error");
      }
      return;
    }
  }

  if (request_dispatched_) {
    (void)consumeRequestBody();
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

  active_body_cursor_ = parsed.body_start;
  active_body_expected_ = parsed.body_length;
  active_body_received_ = 0;
  active_chunk_remaining_ = 0;
  active_trailer_bytes_ = 0;
  active_trailer_count_ = 0;
  active_chunk_state_ = HttpChunkDecodeState::size;
  active_keep_alive_ = parsed.keep_alive;
  active_http_1_0_ =
    parsed.version_length == 3 &&
    std::memcmp(request_bytes_.data() + parsed.version_start, "1.0", 3) == 0;
  active_chunked_ = parsed.chunked;
  active_request_complete_ = false;
  active_response_complete_ = false;
  request_dispatched_ = true;
  inox::Value headers = materializeRequestHeaders(
    request_bytes_,
    parsed.headers_start,
    parsed.headers_end
  );

  if (inox::thrown()) {
    transport_->destroy();
    return;
  }

  try {
    active_request_ = std::make_shared<HttpRequestState>(
      std::move(headers),
      inox::String(request_bytes_.data() + parsed.version_start, parsed.version_length),
      inox::String(request_bytes_.data() + parsed.method_start, parsed.method_length),
      socket_,
      inox::String(request_bytes_.data() + parsed.url_start, parsed.url_length)
    );
    active_response_ = std::make_shared<HttpResponseState>(shared_from_this());
    active_request_->server_connection_ = shared_from_this();
  } catch (const std::bad_alloc&) {
    sendError(500, "internal server error");
    return;
  }

  if (inox::thrown()) {
    transport_->destroy();
    return;
  }

  HttpRequest request_value = materializeRequest(active_request_);
  HttpResponse response_value = materializeResponse(active_response_);

  if (inox::thrown()) {
    transport_->destroy();
    return;
  }

  const std::array<inox::Value, 2> arguments = {request_value, response_value};
  callHttpListeners(server_->request_listeners_, arguments);

  if (inox::thrown()) {
    transport_->destroy();
    return;
  }

  (void)consumeRequestBody();
}

void HttpConnectionState::sendError(double status, inox::StringView message) {
  std::shared_ptr<HttpResponseState> response;

  try {
    response = std::make_shared<HttpResponseState>(shared_from_this());
  } catch (const std::bad_alloc&) {
    transport_->destroy();
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
    transport_->destroy();
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
    drain_attached_(false),
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
  inox::Callback drain = makeWeakCallback(connection, onClientDrain);

  if (inox::thrown()) {
    connection->native_owner_.reset();
    return {};
  }

  connection->socket_ = net.connect(connection->port_, connection->host_, std::move(connect));

  if (!inox::thrown()) connection->socket_.on("data", std::move(data));
  if (!inox::thrown()) connection->socket_.on("end", std::move(end));
  if (!inox::thrown()) connection->socket_.on("close", std::move(close));
  if (!inox::thrown()) connection->socket_.on("error", std::move(error));
  if (!inox::thrown()) connection->socket_.on("drain", std::move(drain));

  if (inox::thrown()) {
    connection->socket_.destroy();
    connection->native_owner_.reset();
    return {};
  }

  connection->drain_attached_ = true;

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

  if (!attachDrain()) {
    destroy();
    return;
  }

  if (request_) {
    request_->onConnect();
  }
}

bool HttpClientConnectionState::attachDrain() {
  if (drain_attached_) {
    return true;
  }

  NetSocket socket = responseSocket();

  if (inox::thrown()) {
    return false;
  }

  inox::Callback drain = makeWeakCallback(shared_from_this(), onClientDrain);

  if (inox::thrown()) {
    return false;
  }

  socket.on("drain", std::move(drain));

  if (inox::thrown()) {
    return false;
  }

  drain_attached_ = true;
  return true;
}

void HttpClientConnectionState::onData(inox::StringView data) {
  if (request_) {
    request_->onData(data);
  } else if (data.len > 0) {
    destroy();
  }
}

void HttpClientConnectionState::onDrain() {
  if (request_) {
    request_->onDrain();
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
    const inox_status status = inox_tls_client_write(tls_, data.bytes, data.len);

    if (status != INOX_OK) {
      inox::Value error = materializeHttpError("HTTPS request write failed");
      if (!inox::thrown()) onError(error);

      return false;
    }

    NetSocket socket = responseSocket();

    if (inox::thrown()) {
      return false;
    }

    inox::Callback finish;

    if (final) {
      finish = makeWeakCallback(request_, onClientFinish);

      if (inox::thrown()) {
        return false;
      }
    }

    const bool writable = socket.write(inox::StringView(), std::move(finish));

    if (inox::thrown()) {
      return false;
    }

    accepted = true;
    return writable;
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
    paused_response_bytes_(),
    response_listeners_(),
    finish_listeners_(),
    close_listeners_(),
    error_listeners_(),
    drain_listeners_(),
    timeout_listeners_(),
    transport_kind_(transport.kind()),
    connection_(),
    response_(),
    native_owner_(),
    response_content_length_(),
    response_chunk_bytes_(),
    response_body_received_(0),
    response_trailer_bytes_(0),
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
    pending_needs_drain_(false),
    ending_(false),
    sent_(false),
    finished_(false),
    response_started_(false),
    response_transport_ended_(false),
    failed_(false),
    closed_(false),
    destroyed_(false),
    timeout_ms_(0),
    timeout_timer_(nullptr),
    abort_signal_(),
    abort_timer_(nullptr) {
  try {
    headers_.reserve(8);
    pending_write_bytes_.reserve(1024);
    response_bytes_.reserve(4096);
    paused_response_bytes_.reserve(4096);
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

    request->timeout_ms_ = options->timeout().value_or(0);
    request->abort_signal_ = options->signal();
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

  if (!request->startAbortPolling()) {
    connection->destroy();
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
  if (destroyed_ || closed_) return;

  destroyed_ = true;
  stopTimeout();
  stopAbortPolling();

  if (connection_) connection_->destroy();
  else onClose();
}

void HttpClientRequestState::destroy(const inox::Value& error) {
  if (!destroyed_ && !closed_) onError(error);
}

bool HttpClientRequestState::destroyed() const {
  return destroyed_;
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
  else if (hasText(event_name, "drain")) listeners = &drain_listeners_;
  else if (hasText(event_name, "timeout")) listeners = &timeout_listeners_;
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
  stopTimeout();
  stopAbortPolling();

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

  touchTimeout();

  if (pending_write_bytes_.empty() && !pending_write_final_) {
    return;
  }

  std::string output = std::move(pending_write_bytes_);
  const bool final = pending_write_final_;
  const bool needs_drain = pending_needs_drain_;
  pending_write_bytes_.clear();
  pending_write_final_ = false;
  pending_needs_drain_ = false;
  const bool writable = send(output, final);

  if (needs_drain && writable && !inox::thrown()) {
    onDrain();
  }
}

void HttpClientRequestState::onDrain() {
  if (!closed_) {
    touchTimeout();
    callHttpListeners(drain_listeners_);
  }
}

bool HttpClientRequestState::deliverResponseBody(inox::StringView data) {
  if (!response_ || data.len == 0 || inox::thrown()) {
    return !inox::thrown();
  }

  if (data.len > std::numeric_limits<std::size_t>::max() - response_body_received_ ||
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
      response_body_received_ == *response_content_length_ &&
      !response_->paused_) {
    completeResponseBody();
  }

  return !inox::thrown();
}

bool HttpClientRequestState::bufferPausedResponse(inox::StringView data) {
  if (data.len == 0) {
    return true;
  }

  if (paused_response_bytes_.size() > maxBufferedResponseBytes ||
      data.len > maxBufferedResponseBytes - paused_response_bytes_.size()) {
    inox::Value error = materializeHttpError("HTTP response paused buffer is too large");
    if (!inox::thrown()) onError(error);
    return false;
  }

  try {
    paused_response_bytes_.insert(
      paused_response_bytes_.end(),
      data.bytes,
      data.bytes + data.len
    );
  } catch (const std::bad_alloc&) {
    inox::throw_out_of_memory();
    return false;
  }

  return true;
}

void HttpClientRequestState::resumeResponseBody() {
  if (closed_ || !response_ || response_->paused_) {
    return;
  }

  std::vector<char> pending = std::move(paused_response_bytes_);
  paused_response_bytes_.clear();

  if (!pending.empty() &&
      !consumeResponseBody(inox::StringView(pending.data(), pending.size()))) {
    return;
  }

  if (!closed_ && response_ && !response_->paused_ &&
      response_body_mode_ == HttpClientResponseBodyMode::chunked &&
      response_chunk_state_ != HttpChunkDecodeState::complete) {
    (void)consumeChunkedBody(inox::StringView());
  }

  if (!closed_ && response_ && !response_->paused_ &&
      response_body_mode_ == HttpClientResponseBodyMode::content_length &&
      response_content_length_ &&
      response_body_received_ == *response_content_length_) {
    completeResponseBody();
    return;
  }

  if (!closed_ && response_ && !response_->paused_ && response_transport_ended_) {
    onEnd();
  }
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

  if (response_chunk_bytes_.size() > maxBufferedResponseBytes ||
      data.len > maxBufferedResponseBytes - response_chunk_bytes_.size()) {
    return fail("HTTP response buffer is too large");
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

      std::size_t chunk_size = 0;

      for (std::size_t index = cursor; index < size_end; index += 1) {
        const unsigned char byte = static_cast<unsigned char>(bytes[index]);
        std::size_t digit = 0;

        if (byte >= '0' && byte <= '9') digit = byte - '0';
        else if (byte >= 'a' && byte <= 'f') digit = byte - 'a' + 10;
        else if (byte >= 'A' && byte <= 'F') digit = byte - 'A' + 10;
        else return fail("HTTP chunked response size is invalid");

        if (chunk_size > (std::numeric_limits<std::size_t>::max() - digit) / 16) {
          return fail("HTTP response is too large");
        }

        chunk_size = chunk_size * 16 + digit;
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

      if (response_ && response_->paused_) {
        compact(cursor);
        return true;
      }

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
        if (response_trailer_bytes_ > maxResponseHeaderBytes - 2) {
          return fail("HTTP chunked response trailers are too large");
        }

        response_trailer_bytes_ += 2;
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
          response_trailer_bytes_ > maxResponseHeaderBytes ||
          framing_length > maxResponseHeaderBytes - response_trailer_bytes_ ||
          !validHeaderName(inox::StringView(name.data(), name.size())) ||
          !validHeaderValue(value) ||
          spanEqualsIgnoreCase(name, "Content-Length") ||
          spanEqualsIgnoreCase(name, "Transfer-Encoding")) {
        return fail("HTTP chunked response trailer is invalid");
      }

      response_trailer_bytes_ += framing_length;
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

  touchTimeout();

  if (response_started_) {
    if (response_ && response_->paused_) {
      (void)bufferPausedResponse(data);
    } else {
      (void)consumeResponseBody(data);
    }
    return;
  }

  constexpr std::size_t max_initial_response_bytes =
    maxResponseHeaderBytes + maxBufferedResponseBytes;

  if (response_bytes_.size() > max_initial_response_bytes ||
      data.len > max_initial_response_bytes - response_bytes_.size()) {
    inox::Value error = materializeHttpError("HTTP response buffer is too large");
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
    response_->client_request_ = shared_from_this();
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

  const inox::StringView initial_body(response_bytes_.data() + parsed.body_start, body_length);

  if (response_->paused_) {
    if (!bufferPausedResponse(initial_body)) {
      return;
    }
  } else if (!consumeResponseBody(initial_body)) {
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

  response_transport_ended_ = true;

  if (response_->paused_) {
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

void HttpClientRequestState::stopTimeout() {
  if (timeout_timer_ == nullptr) return;
  inox_timer_handle* timer = timeout_timer_;
  timeout_timer_ = nullptr;
  inox_loop_clear_timer(timer);
}

void HttpClientRequestState::touchTimeout() {
  stopTimeout();

  if (closed_ || destroyed_ || timeout_ms_ <= 0 || !connection_ || !connection_->connected_) return;

  auto* context = new (std::nothrow) HttpTimerContext<HttpClientRequestState>{weak_from_this()};

  if (context == nullptr ||
      inox_loop_set_timeout(
        inox::loop(),
        timeout_ms_,
        onClientRequestTimeout,
        context,
        finalizeHttpTimer<HttpClientRequestState>,
        &timeout_timer_
      ) != INOX_OK) {
    delete context;
    timeout_timer_ = nullptr;
    throwHttpError("TypeError: HTTP client timeout allocation failed");
    return;
  }

  inox_loop_unref_timer(timeout_timer_);
}

void HttpClientRequestState::onTimeout() {
  timeout_timer_ = nullptr;
  if (!closed_ && !destroyed_) callHttpListeners(timeout_listeners_);
}

void HttpClientRequestState::setTimeout(double milliseconds, inox::Callback callback) {
  if (closed_ || destroyed_ || !std::isfinite(milliseconds) || std::floor(milliseconds) != milliseconds ||
      milliseconds < 0) {
    throwHttpError("TypeError: HttpClientRequest.setTimeout requires a non-negative integer");
    return;
  }

  timeout_ms_ = milliseconds;

  if (callback.valid()) {
    try {
      timeout_listeners_.push_back(std::move(callback));
    } catch (const std::bad_alloc&) {
      throwHttpError("TypeError: HttpClientRequest timeout listener allocation failed");
      return;
    }
  }

  touchTimeout();
}

bool HttpClientRequestState::startAbortPolling() {
  if (abort_signal_.tag == INOX_TAG_UNDEFINED || abort_timer_ != nullptr) return true;

  auto* context = new (std::nothrow) HttpTimerContext<HttpClientRequestState>{weak_from_this()};

  if (context == nullptr ||
      inox_loop_set_interval(
        inox::loop(),
        1,
        onClientAbortPoll,
        context,
        finalizeHttpTimer<HttpClientRequestState>,
        &abort_timer_
      ) != INOX_OK) {
    delete context;
    abort_timer_ = nullptr;
    throwHttpError("TypeError: HTTP AbortSignal polling allocation failed");
    return false;
  }

  inox_loop_unref_timer(abort_timer_);
  return true;
}

void HttpClientRequestState::stopAbortPolling() {
  if (abort_timer_ == nullptr) return;
  inox_timer_handle* timer = abort_timer_;
  abort_timer_ = nullptr;
  inox_loop_clear_timer(timer);
}

void HttpClientRequestState::onAbortPoll() {
  if (closed_ || destroyed_) return;

  bool aborted = false;
  if (!readAbortState(abort_signal_, aborted) || !aborted) return;

  inox::Value error = materializeHttpError("The operation was aborted");
  if (!inox::thrown()) onError(error);
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
      !selectOutgoingBodyMode(
        headers_,
        streaming,
        true,
        initial_body_size,
        "TypeError: HttpClientRequest body framing is invalid",
        "TypeError: HttpClientRequest serialization failed",
        request_body_mode_,
        request_content_length_
      )) {
    if (!inox::thrown()) {
      throwHttpError("TypeError: HttpClientRequest body has already started");
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
      body.size() > std::numeric_limits<std::size_t>::max() - request_body_bytes_ ||
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
    pending_needs_drain_ = pending_needs_drain_ ||
      (!final && pending_write_bytes_.size() >= httpHighWaterMark);
    return !pending_needs_drain_;
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

  if (accepted && !inox::thrown()) touchTimeout();

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
    drain_listeners_(),
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

void HttpResponseState::emitDrain() {
  if (!ended_) {
    callHttpListeners(drain_listeners_);
  }
}

void HttpResponseState::on(inox::StringView event_name, inox::Callback listener) {
  if (!listener.valid() || !hasText(event_name, "drain")) {
    throwHttpError("TypeError: HttpResponse.on supports only drain listeners");
    return;
  }

  try {
    drain_listeners_.push_back(std::move(listener));
  } catch (const std::bad_alloc&) {
    throwHttpError("TypeError: HttpResponse listener allocation failed");
  }
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
    connection_->transport_->destroy();
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
    connection_->transport_->destroy();
    return;
  }

  if (body_mode_ == HttpOutgoingBodyMode::content_length &&
      (!content_length_ || body_bytes_written_ != *content_length_)) {
    throwHttpError("TypeError: HttpResponse Content-Length does not match its body");
    connection_->transport_->destroy();
    return;
  }

  if (body_mode_ == HttpOutgoingBodyMode::chunked) {
    try {
      output.append("0\r\n\r\n");
    } catch (const std::bad_alloc&) {
      throwHttpError("TypeError: HttpResponse allocation failed");
      connection_->transport_->destroy();
      return;
    }
  }

  ending_ = true;
  (void)send(output, true);

  if (inox::thrown()) {
    ending_ = false;
    connection_->transport_->destroy();
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
      !selectOutgoingBodyMode(
        headers_,
        streaming,
        !connection_->active_http_1_0_,
        initial_body_size,
        "TypeError: HttpResponse body framing is invalid",
        "TypeError: HttpResponse header allocation failed",
        body_mode_,
        content_length_
      )) {
    if (!inox::thrown()) {
      throwHttpError("TypeError: HttpResponse body has already started");
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
      body.size() > std::numeric_limits<std::size_t>::max() - body_bytes_written_ ||
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
    const bool writable = connection_->transport_->write(inox::StringView(output.data(), output.size()));
    if (!inox::thrown()) connection_->touchTimeout();
    return writable;
  }

  inox::Callback complete = makeWeakCallback(connection_, onResponseComplete);

  if (inox::thrown()) {
    return false;
  }

  if (connection_->active_keep_alive_) {
    const bool writable = connection_->transport_->write(
      inox::StringView(output.data(), output.size()),
      std::move(complete)
    );
    if (!inox::thrown()) connection_->touchTimeout();
    return writable;
  }

  connection_->transport_->end(
    inox::StringView(output.data(), output.size()),
    std::move(complete)
  );
  if (!inox::thrown()) connection_->touchTimeout();
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

  std::shared_ptr<HttpServerConnectionTransport> transport;

  try {
    transport = std::make_shared<NetHttpServerConnectionTransport>(std::move(socket));
  } catch (const std::bad_alloc&) {
    socket.destroy();
    throwHttpError("TypeError: HTTP connection transport allocation failed");
    return callbackStatus();
  }

  server->accept(std::move(transport));
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

inox_status onConnectionDrain(
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

  if (connection) {
    connection->onDrain();
  }

  return callbackStatus();
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

inox_status onClientDrain(
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
    connection->onDrain();
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
  : valid_(true), host_(), hostname_(), method_(), path_(), port_(), headers_(), signal_(), timeout_() {}

HttpRequestOptions::HttpRequestOptions(const inox::Value& value)
  : valid_(false), host_(), hostname_(), method_(), path_(), port_(), headers_(), signal_(), timeout_() {
  if (!readOptionalObject(value, "headers", headers_) ||
      !readOptionalString(value, "host", host_) ||
      !readOptionalString(value, "hostname", hostname_) ||
      !readOptionalString(value, "method", method_) ||
      !readOptionalString(value, "path", path_) ||
      !readOptionalNumber(value, "port", port_, 1, 65535) ||
      !readOptionalObject(value, "signal", signal_) ||
      !readOptionalNumber(value, "timeout", timeout_, 0, std::numeric_limits<int>::max())) {
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

const inox::Value& HttpRequestOptions::signal() const {
  return signal_;
}

const std::optional<double>& HttpRequestOptions::timeout() const {
  return timeout_;
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

HttpServer& HttpServer::setTimeout() {
  return setTimeout(0);
}

HttpServer& HttpServer::setTimeout(double milliseconds) {
  return setTimeout(milliseconds, inox::Callback());
}

HttpServer& HttpServer::setTimeout(double milliseconds, inox::Callback callback) {
  std::shared_ptr<HttpServerState> state = serverState(*this);

  if (!state) {
    throwHttpError("TypeError: HttpServer.setTimeout failed");
    return *this;
  }

  state->setTimeout(milliseconds, std::move(callback));
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

bool HttpRequest::isPaused() const {
  std::shared_ptr<HttpRequestState> state = requestState(*this);

  if (!state) {
    throwHttpError("TypeError: HttpRequest.isPaused failed");
    return false;
  }

  return state->isPaused();
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

HttpRequest& HttpRequest::pause() {
  std::shared_ptr<HttpRequestState> state = requestState(*this);

  if (!state) {
    throwHttpError("TypeError: HttpRequest.pause failed");
    return *this;
  }

  state->pause();
  return *this;
}

HttpRequest& HttpRequest::resume() {
  std::shared_ptr<HttpRequestState> state = requestState(*this);

  if (!state) {
    throwHttpError("TypeError: HttpRequest.resume failed");
    return *this;
  }

  state->resume();
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

HttpClientRequest& HttpClientRequest::destroy(const inox::Value& error) {
  std::shared_ptr<HttpClientRequestState> state = clientRequestState(*this);

  if (!state) {
    throwHttpError("TypeError: HttpClientRequest.destroy failed");
    return *this;
  }

  state->destroy(error);
  return *this;
}

bool HttpClientRequest::destroyed() const {
  std::shared_ptr<HttpClientRequestState> state = clientRequestState(*this);

  if (!state) {
    throwHttpError("TypeError: HttpClientRequest.destroyed failed");
    return false;
  }

  return state->destroyed();
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

HttpClientRequest& HttpClientRequest::setTimeout(double timeout) {
  return setTimeout(timeout, inox::Callback());
}

HttpClientRequest& HttpClientRequest::setTimeout(double timeout, inox::Callback callback) {
  std::shared_ptr<HttpClientRequestState> state = clientRequestState(*this);

  if (!state) {
    throwHttpError("TypeError: HttpClientRequest.setTimeout failed");
    return *this;
  }

  state->setTimeout(timeout, std::move(callback));
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

HttpResponse& HttpResponse::on(inox::StringView event_name, inox::Callback listener) {
  std::shared_ptr<HttpResponseState> state = responseState(*this);

  if (!state) {
    throwHttpError("TypeError: HttpResponse.on failed");
    return *this;
  }

  state->on(event_name, std::move(listener));
  return *this;
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

HttpServer makeHttpServer(NetServer server, inox::Callback listener) {
  return materializeServer(HttpServerState::create(std::move(server), std::move(listener)));
}

void acceptHttpServerConnection(
  const HttpServer& server,
  std::shared_ptr<HttpServerConnectionTransport> transport
) {
  std::shared_ptr<HttpServerState> state = serverState(server);

  if (!state) {
    if (transport) {
      transport->destroy();
    }

    throwHttpError("TypeError: HttpServer connection acceptance failed");
    return;
  }

  state->accept(std::move(transport));
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
