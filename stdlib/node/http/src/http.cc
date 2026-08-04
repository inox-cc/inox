#include "inox/http.h"

#include <array>
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

namespace {

constexpr std::size_t maxRequestBytes = 64 * 1024;
constexpr std::size_t maxRequestHeaders = 64;
constexpr std::size_t maxResponseBodyBytes = 64 * 1024;
constexpr std::size_t maxResponseHeaders = 64;
constexpr std::size_t maxResponseHeaderBytes = 16 * 1024;

void throwHttpError(const char* message) {
  inox::throw_value(inox::String(message == nullptr ? "TypeError: HTTP operation failed" : message));
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

struct HttpServerHolder {
  std::shared_ptr<HttpServerState> state;
};

struct HttpRequestHolder {
  std::shared_ptr<HttpRequestState> state;
};

struct HttpResponseHolder {
  std::shared_ptr<HttpResponseState> state;
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

  HttpRequestState(
    inox::Value headers,
    inox::String http_version,
    inox::String method,
    NetSocket socket,
    inox::String url
  )
    : headers_(std::move(headers)),
      http_version_(std::move(http_version)),
      method_(std::move(method)),
      socket_(std::move(socket)),
      url_(std::move(url)) {}
};

class HttpResponseState : public std::enable_shared_from_this<HttpResponseState> {
public:
  std::shared_ptr<HttpConnectionState> connection_;
  std::vector<ResponseHeader> headers_;
  std::vector<std::uint8_t> body_;
  double status_code_;
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
};

class HttpServerState : public std::enable_shared_from_this<HttpServerState> {
public:
  NetServer net_server_;
  std::vector<inox::Callback> request_listeners_;
  std::shared_ptr<HttpServerState> native_owner_;
  bool closed_;

  HttpServerState();

  static std::shared_ptr<HttpServerState> create(inox::Callback listener);
  void accept(NetSocket socket);
  void close(inox::Callback callback);
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
  bool request_dispatched_;
  bool closed_;

  HttpConnectionState(std::shared_ptr<HttpServerState> server, NetSocket socket);

  static std::shared_ptr<HttpConnectionState> create(
    const std::shared_ptr<HttpServerState>& server,
    NetSocket socket
  );
  void onClose();
  void onData(inox::StringView data);
  void sendError(double status, inox::StringView message);
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

const inox_class_field_descriptor requestFields[] = {
  {"headers", "object", "IncomingHttpHeaders", "owned", INOX_CLASS_FIELD_READONLY | INOX_CLASS_FIELD_ENUMERABLE},
  {"httpVersion", "string", "string", "owned", INOX_CLASS_FIELD_READONLY | INOX_CLASS_FIELD_ENUMERABLE},
  {"method", "string", "string", "owned", INOX_CLASS_FIELD_READONLY | INOX_CLASS_FIELD_ENUMERABLE},
  {"socket", "object", "Socket", "owned", INOX_CLASS_FIELD_READONLY | INOX_CLASS_FIELD_ENUMERABLE},
  {"url", "string", "string", "owned", INOX_CLASS_FIELD_READONLY | INOX_CLASS_FIELD_ENUMERABLE},
};

const inox_class_field_descriptor responseFields[] = {
  {"headersSent", "boolean", "boolean", "value", INOX_CLASS_FIELD_READONLY | INOX_CLASS_FIELD_ENUMERABLE},
  {"statusCode", "number", "number", "value", INOX_CLASS_FIELD_ENUMERABLE},
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
  5,
  requestFields,
  readRequestField,
  copyHolder<HttpRequestHolder>,
  destroyHolder<HttpRequestHolder>,
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
    return holder->state->url_.copy_to(out);
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
inox_status onResponseShutdown(void* context, const inox_value* args, std::size_t arg_count, inox_value* out);

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
      return {RequestParseResult::invalid, 0, 0, 0, 0};
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
  };
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
  : net_server_(), request_listeners_(), native_owner_(), closed_(false) {}

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

  (void)HttpConnectionState::create(shared_from_this(), std::move(socket));
}

void HttpServerState::close(inox::Callback callback) {
  if (closed_) {
    throwHttpError("TypeError: HttpServer.close failed");
    return;
  }

  net_server_.close(std::move(callback));
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
  server_.reset();
  request_bytes_.clear();
  native_owner_.reset();
}

void HttpConnectionState::onData(inox::StringView data) {
  if (closed_ || request_dispatched_) {
    return;
  }

  if (data.len > maxRequestBytes - request_bytes_.size()) {
    request_dispatched_ = true;
    sendError(413, "payload too large");
    return;
  }

  try {
    request_bytes_.insert(request_bytes_.end(), data.bytes, data.bytes + data.len);
  } catch (const std::bad_alloc&) {
    request_dispatched_ = true;
    sendError(500, "internal server error");
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
    std::vector<inox::Callback> listeners = server_->request_listeners_;
    const std::array<inox::Value, 2> arguments = {request_value, response_value};

    for (const inox::Callback& listener : listeners) {
      inox::Value result = listener.call(std::span<const inox::Value>(arguments));
      (void)result;

      if (inox::thrown()) {
        socket_.destroy();
        return;
      }
    }
  } catch (const std::bad_alloc&) {
    throwHttpError("TypeError: HTTP listener snapshot allocation failed");
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

HttpResponseState::HttpResponseState(std::shared_ptr<HttpConnectionState> connection)
  : connection_(std::move(connection)), headers_(), body_(), status_code_(200), ending_(false), ended_(false) {
  try {
    headers_.reserve(8);
    body_.reserve(1024);
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
  if (ending_ || ended_ || !validHeaderName(name) || !validHeaderValue(value)) {
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
  return ending_ || ended_;
}

void HttpResponseState::removeHeader(inox::StringView name) {
  if (ending_ || ended_ || !validHeaderName(name)) {
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
  if (ending_ || ended_ || !std::isfinite(value) || std::floor(value) != value || value < 100 || value > 999) {
    throwHttpError("TypeError: HttpResponse.statusCode is invalid");
    return;
  }

  status_code_ = value;
}

bool HttpResponseState::write(std::span<const std::uint8_t> body) {
  if (ending_ || ended_) {
    throwHttpError("TypeError: HttpResponse.write failed");
    return false;
  }

  if (body.size() > maxResponseBodyBytes - body_.size()) {
    throwHttpError("TypeError: HttpResponse body is too large");
    return false;
  }

  try {
    body_.insert(body_.end(), body.begin(), body.end());
  } catch (const std::bad_alloc&) {
    throwHttpError("TypeError: HttpResponse body allocation failed");
    return false;
  }

  return true;
}

void HttpResponseState::end(std::span<const std::uint8_t> body) {
  if (ending_ || ended_ || !connection_ || connection_->closed_) {
    throwHttpError("TypeError: HttpResponse.end failed");
    return;
  }

  if (body.size() > maxResponseBodyBytes - body_.size()) {
    throwHttpError("TypeError: HttpResponse body is too large");
    return;
  }

  std::vector<std::uint8_t> response_body;

  try {
    response_body = body_;
    response_body.insert(response_body.end(), body.begin(), body.end());
  } catch (const std::bad_alloc&) {
    throwHttpError("TypeError: HttpResponse body allocation failed");
    return;
  }

  std::string content_length;

  try {
    content_length = std::to_string(response_body.size());
  } catch (const std::bad_alloc&) {
    throwHttpError("TypeError: HttpResponse header allocation failed");
    return;
  }

  setHeader("Content-Length", inox::StringView(content_length.data(), content_length.size()));

  if (!inox::thrown()) {
    setHeader("Connection", "close");
  }

  if (inox::thrown()) {
    return;
  }

  std::string header_bytes;

  try {
    header_bytes.reserve(256);
    header_bytes.append("HTTP/1.1 ");
    header_bytes.append(std::to_string(static_cast<int>(status_code_)));
    header_bytes.push_back(' ');
    header_bytes.append(statusText(static_cast<int>(status_code_)));
    header_bytes.append("\r\n");

    for (const ResponseHeader& header : headers_) {
      const inox::StringView name = header.name;
      const inox::StringView value = header.value;
      header_bytes.append(name.bytes, name.len);
      header_bytes.append(": ");
      header_bytes.append(value.bytes, value.len);
      header_bytes.append("\r\n");
    }

    header_bytes.append("\r\n");
  } catch (const std::bad_alloc&) {
    throwHttpError("TypeError: HttpResponse header allocation failed");
    return;
  }

  if (header_bytes.size() > maxResponseHeaderBytes) {
    throwHttpError("TypeError: HttpResponse header is too large");
    return;
  }

  std::vector<std::uint8_t> response_bytes;

  try {
    response_bytes.reserve(header_bytes.size() + response_body.size());
    response_bytes.insert(response_bytes.end(), header_bytes.begin(), header_bytes.end());
    response_bytes.insert(response_bytes.end(), response_body.begin(), response_body.end());
  } catch (const std::bad_alloc&) {
    throwHttpError("TypeError: HttpResponse allocation failed");
    return;
  }

  inox::Callback shutdown = makeWeakCallback(connection_, onResponseShutdown);

  if (inox::thrown()) {
    return;
  }

  ending_ = true;
  connection_->socket_.end(
    inox::StringView(reinterpret_cast<const char*>(response_bytes.data()), response_bytes.size()),
    std::move(shutdown)
  );

  if (inox::thrown()) {
    ending_ = false;
    connection_->socket_.destroy();
    return;
  }

  body_ = std::move(response_body);
  ended_ = true;
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

inox_status onResponseShutdown(
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
    connection->socket_.destroy();
  }

  return callbackStatus();
}

} // namespace

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

HttpHeaders::HttpHeaders() : value_() {}

HttpHeaders::HttpHeaders(const inox::Value& value) : value_(value) {
  if (value.tag != INOX_TAG_OBJECT) {
    throwHttpError("TypeError: HTTP headers must be an object");
  }
}

HttpServer::HttpServer() : inox::Value() {}

HttpServer::HttpServer(const inox::Value& value) : inox::Value(value) {}

HttpServer::HttpServer(inox::Value&& value) : inox::Value(std::move(value)) {}

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

NetSocket HttpRequest::socket() const {
  std::shared_ptr<HttpRequestState> state = requestState(*this);

  if (!state) {
    throwHttpError("TypeError: HttpRequest.socket failed");
    return NetSocket();
  }

  return state->socket_;
}

inox::String HttpRequest::url() const {
  std::shared_ptr<HttpRequestState> state = requestState(*this);

  if (!state) {
    throwHttpError("TypeError: HttpRequest.url failed");
    return inox::String("");
  }

  return state->url_;
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

const HttpModule http;
