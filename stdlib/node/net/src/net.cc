#include "inox/net.h"

#include <array>
#include <cmath>
#include <cstdio>
#include <cstdint>
#include <cstring>
#include <limits>
#include <memory>
#include <new>
#include <string>
#include <utility>
#include <vector>

#include "inox/class_descriptor.h"
#include "inox/loop.h"
#include "inox/object.h"

#ifdef INOX_LOOP_BACKEND_LIBUV
#include "loop-libuv-internal.h"
#endif

namespace {

void throwNetError(const char* message) {
  inox::throw_value(inox::String(message == nullptr ? "TypeError: net operation failed" : message));
}

inox::Value materializeNetError(const inox::String& message) {
  static const inox_field_info fields[] = {
    {"message", INOX_FIELD_READONLY},
  };
  static const inox_shape shape = {1, fields};

  inox::ObjectValue object = inox::ObjectValue::create(&shape);

  if (!object.valid() || inox::thrown()) {
    return inox::Value();
  }

  object.init(0, message.raw());

  if (inox::thrown()) {
    return inox::Value();
  }

  return object;
}

bool hasText(inox::StringView value, const char* expected) {
  const std::size_t length = std::strlen(expected);
  return value.len == length && std::memcmp(value.bytes, expected, length) == 0;
}

bool readObjectField(const inox::Value& object, const char* name, inox::Value& out, bool& present) {
  const inox_value raw = object.raw();

  if (raw.tag != INOX_TAG_OBJECT && raw.tag != INOX_TAG_CLASS_INSTANCE) {
    throwNetError("TypeError: net options must be an object");
    return false;
  }

  const inox_status status = inox_object_get(raw, name, std::strlen(name), out.out());

  if (status == INOX_ERR_FIELD) {
    present = false;
    return true;
  }

  if (status != INOX_OK) {
    throwNetError("TypeError: net option read failed");
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
    throwNetError("TypeError: net numeric option is invalid");
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
    throwNetError("TypeError: net string option is invalid");
    return false;
  }

  out = inox::String(std::move(field));
  return true;
}

bool checkedInteger(double value, int minimum, int maximum, int& out, const char* message) {
  if (!std::isfinite(value) || std::floor(value) != value || value < minimum || value > maximum) {
    throwNetError(message);
    return false;
  }

  out = static_cast<int>(value);
  return true;
}

class NetServerState;
class NetSocketState;

struct NetServerHolder {
  std::shared_ptr<NetServerState> state;
};

struct NetSocketHolder {
  std::shared_ptr<NetSocketState> state;
};

inox_status copyServerHolder(inox_allocator* allocator, const void* instance, void** out) {
  if (allocator == nullptr || allocator->alloc == nullptr || instance == nullptr || out == nullptr) {
    return INOX_ERR_TYPE;
  }

  void* memory = allocator->alloc(allocator->user, sizeof(NetServerHolder), alignof(NetServerHolder));

  if (memory == nullptr) {
    *out = nullptr;
    return INOX_ERR_OOM;
  }

  try {
    *out = new (memory) NetServerHolder(*static_cast<const NetServerHolder*>(instance));
  } catch (const std::bad_alloc&) {
    allocator->free(allocator->user, memory, sizeof(NetServerHolder), alignof(NetServerHolder));
    *out = nullptr;
    return INOX_ERR_OOM;
  }

  return INOX_OK;
}

void destroyServerHolder(inox_allocator* allocator, void* instance) {
  if (allocator == nullptr || allocator->free == nullptr || instance == nullptr) {
    return;
  }

  static_cast<NetServerHolder*>(instance)->~NetServerHolder();
  allocator->free(allocator->user, instance, sizeof(NetServerHolder), alignof(NetServerHolder));
}

inox_status copySocketHolder(inox_allocator* allocator, const void* instance, void** out) {
  if (allocator == nullptr || allocator->alloc == nullptr || instance == nullptr || out == nullptr) {
    return INOX_ERR_TYPE;
  }

  void* memory = allocator->alloc(allocator->user, sizeof(NetSocketHolder), alignof(NetSocketHolder));

  if (memory == nullptr) {
    *out = nullptr;
    return INOX_ERR_OOM;
  }

  try {
    *out = new (memory) NetSocketHolder(*static_cast<const NetSocketHolder*>(instance));
  } catch (const std::bad_alloc&) {
    allocator->free(allocator->user, memory, sizeof(NetSocketHolder), alignof(NetSocketHolder));
    *out = nullptr;
    return INOX_ERR_OOM;
  }

  return INOX_OK;
}

void destroySocketHolder(inox_allocator* allocator, void* instance) {
  if (allocator == nullptr || allocator->free == nullptr || instance == nullptr) {
    return;
  }

  static_cast<NetSocketHolder*>(instance)->~NetSocketHolder();
  allocator->free(allocator->user, instance, sizeof(NetSocketHolder), alignof(NetSocketHolder));
}

inox_status readServerField(const void* instance, std::uint32_t index, inox_value* out);
inox_status readSocketField(const void* instance, std::uint32_t index, inox_value* out);

const inox_class_field_descriptor serverFields[] = {
  {"listening", "boolean", "boolean", "value", INOX_CLASS_FIELD_READONLY | INOX_CLASS_FIELD_ENUMERABLE},
  {"maxConnections", "number", "number", "value", INOX_CLASS_FIELD_OPTIONAL | INOX_CLASS_FIELD_ENUMERABLE},
};

const inox_class_field_descriptor socketFields[] = {
  {"bytesRead", "number", "number", "value", INOX_CLASS_FIELD_READONLY | INOX_CLASS_FIELD_ENUMERABLE},
  {"bytesWritten", "number", "number", "value", INOX_CLASS_FIELD_READONLY | INOX_CLASS_FIELD_ENUMERABLE},
  {"connecting", "boolean", "boolean", "value", INOX_CLASS_FIELD_READONLY | INOX_CLASS_FIELD_ENUMERABLE},
  {"destroyed", "boolean", "boolean", "value", INOX_CLASS_FIELD_READONLY | INOX_CLASS_FIELD_ENUMERABLE},
  {"localAddress", "string", "string", "owned", INOX_CLASS_FIELD_READONLY | INOX_CLASS_FIELD_ENUMERABLE},
  {"localPort", "number", "number", "value", INOX_CLASS_FIELD_READONLY | INOX_CLASS_FIELD_ENUMERABLE},
  {"pending", "boolean", "boolean", "value", INOX_CLASS_FIELD_READONLY | INOX_CLASS_FIELD_ENUMERABLE},
  {"readyState", "string", "string", "owned", INOX_CLASS_FIELD_READONLY | INOX_CLASS_FIELD_ENUMERABLE},
  {"remoteAddress", "string", "string", "owned", INOX_CLASS_FIELD_READONLY | INOX_CLASS_FIELD_ENUMERABLE},
  {"remotePort", "number", "number", "value", INOX_CLASS_FIELD_READONLY | INOX_CLASS_FIELD_ENUMERABLE},
};

const inox_class_descriptor serverDescriptor = {
  "Server",
  2,
  serverFields,
  readServerField,
  copyServerHolder,
  destroyServerHolder,
};

const inox_class_descriptor socketDescriptor = {
  "Socket",
  10,
  socketFields,
  readSocketField,
  copySocketHolder,
  destroySocketHolder,
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

std::shared_ptr<NetServerState> serverState(const NetServer& server) {
  const NetServerHolder* holder = holderFromValue<NetServerHolder>(server, serverDescriptor);
  return holder == nullptr ? std::shared_ptr<NetServerState>() : holder->state;
}

std::shared_ptr<NetSocketState> socketState(const NetSocket& socket) {
  const NetSocketHolder* holder = holderFromValue<NetSocketHolder>(socket, socketDescriptor);
  return holder == nullptr ? std::shared_ptr<NetSocketState>() : holder->state;
}

NetServer materializeServer(const std::shared_ptr<NetServerState>& state) {
  if (!state) {
    return NetServer();
  }

  const NetServerHolder holder = {state};
  inox_value value = inox_undefined_value();
  const inox_status status = inox_class_instance_ref_copy(
    &inox_default_allocator,
    &serverDescriptor,
    &holder,
    &value
  );

  if (status != INOX_OK) {
    throwNetError("TypeError: NetServer materialization failed");
    return NetServer();
  }

  return NetServer(inox::adopt(value));
}

NetSocket materializeSocket(const std::shared_ptr<NetSocketState>& state) {
  if (!state) {
    return NetSocket();
  }

  const NetSocketHolder holder = {state};
  inox_value value = inox_undefined_value();
  const inox_status status = inox_class_instance_ref_copy(
    &inox_default_allocator,
    &socketDescriptor,
    &holder,
    &value
  );

  if (status != INOX_OK) {
    throwNetError("TypeError: NetSocket materialization failed");
    return NetSocket();
  }

  return NetSocket(inox::adopt(value));
}

#ifdef INOX_LOOP_BACKEND_LIBUV

void reportCallbackStatus(inox_loop* loop) {
  if (inox::thrown()) {
    inox_libuv_loop_report_status(loop, INOX_ERR_THROW);
  }
}

void callListeners(inox_loop* loop, const std::vector<inox::Callback>& source) {
  std::vector<inox::Callback> listeners;

  try {
    listeners = source;
  } catch (const std::bad_alloc&) {
    inox_libuv_loop_report_status(loop, INOX_ERR_OOM);
    return;
  }

  for (const inox::Callback& listener : listeners) {
    inox::Value result = listener.call();
    (void)result;

    if (inox::thrown()) {
      reportCallbackStatus(loop);
      return;
    }
  }
}

void callListeners(inox_loop* loop, const std::vector<inox::Callback>& source, const inox::Value& argument) {
  std::vector<inox::Callback> listeners;

  try {
    listeners = source;
  } catch (const std::bad_alloc&) {
    inox_libuv_loop_report_status(loop, INOX_ERR_OOM);
    return;
  }

  const std::array<inox::Value, 1> arguments = {argument};

  for (const inox::Callback& listener : listeners) {
    inox::Value result = listener.call(std::span<const inox::Value>(arguments));
    (void)result;

    if (inox::thrown()) {
      reportCallbackStatus(loop);
      return;
    }
  }
}

NetAddress socketAddress(uv_tcp_t& handle, bool remote) {
  NetAddress result = {inox::String(""), inox::String(""), 0};
  sockaddr_storage address = {};
  int length = sizeof(address);
  const int status = remote
    ? uv_tcp_getpeername(&handle, reinterpret_cast<sockaddr*>(&address), &length)
    : uv_tcp_getsockname(&handle, reinterpret_cast<sockaddr*>(&address), &length);

  if (status != 0 || address.ss_family != AF_INET) {
    throwNetError("TypeError: net address is unavailable");
    return result;
  }

  char host[INET_ADDRSTRLEN] = {};
  const auto* ipv4 = reinterpret_cast<const sockaddr_in*>(&address);

  if (uv_ip4_name(ipv4, host, sizeof(host)) != 0) {
    throwNetError("TypeError: net address conversion failed");
    return result;
  }

  result.address = inox::String(host);
  result.family = inox::String("IPv4");
  result.port = ntohs(ipv4->sin_port);
  return result;
}

bool resolveIpv4(inox_loop* loop, inox::StringView host, int port, bool bind_address, sockaddr_in& out) {
  const char* fallback = bind_address ? "0.0.0.0" : "127.0.0.1";
  std::string hostname;

  try {
    hostname.assign(host.len == 0 ? fallback : host.bytes, host.len == 0 ? std::strlen(fallback) : host.len);
  } catch (const std::bad_alloc&) {
    throwNetError("TypeError: net address allocation failed");
    return false;
  }

  if (uv_ip4_addr(hostname.c_str(), port, &out) == 0) {
    return true;
  }

  uv_loop_t* uv_loop = loop == nullptr ? nullptr : inox_libuv_loop_handle(loop);

  if (uv_loop == nullptr) {
    throwNetError("TypeError: net address resolution failed");
    return false;
  }

  char service[16] = {};
  const int service_length = std::snprintf(service, sizeof(service), "%d", port);

  if (service_length <= 0 || static_cast<std::size_t>(service_length) >= sizeof(service)) {
    throwNetError("TypeError: net address resolution failed");
    return false;
  }

  addrinfo hints = {};
  hints.ai_family = AF_INET;
  hints.ai_socktype = SOCK_STREAM;
  hints.ai_protocol = IPPROTO_TCP;
  uv_getaddrinfo_t request = {};

  if (uv_getaddrinfo(uv_loop, &request, nullptr, hostname.c_str(), service, &hints) != 0) {
    throwNetError("TypeError: net address resolution failed");
    return false;
  }

  bool found = false;

  for (addrinfo* item = request.addrinfo; item != nullptr; item = item->ai_next) {
    if (item->ai_family == AF_INET && item->ai_addr != nullptr && item->ai_addrlen <= sizeof(out)) {
      std::memcpy(&out, item->ai_addr, item->ai_addrlen);
      found = true;
      break;
    }
  }

  uv_freeaddrinfo(request.addrinfo);

  if (!found) {
    throwNetError("TypeError: node:net currently supports only TCP4 addresses");
  }

  return found;
}

class NetSocketState : public std::enable_shared_from_this<NetSocketState> {
public:
  struct ConnectRequest;
  struct WriteRequest;
  struct ShutdownRequest;

  inox_loop* loop_;
  uv_tcp_t handle_;
  std::vector<inox::Callback> connect_listeners_;
  std::vector<inox::Callback> ready_listeners_;
  std::vector<inox::Callback> data_listeners_;
  std::vector<inox::Callback> end_listeners_;
  std::vector<inox::Callback> close_listeners_;
  std::vector<inox::Callback> error_listeners_;
  std::vector<inox::Callback> drain_listeners_;
  std::vector<inox::Callback> timeout_listeners_;
  std::vector<inox::Callback> timeout_once_listeners_;
  std::shared_ptr<NetSocketState> native_owner_;
  std::weak_ptr<NetServerState> server_;
  std::size_t bytes_read_;
  std::size_t bytes_written_;
  bool initialized_;
  bool connecting_;
  bool connected_;
  bool closing_;
  bool closed_;
  bool reading_;
  bool paused_;
  bool referenced_;
  bool utf8_encoding_;
  bool needs_drain_;
  bool ending_;
  bool shutdown_started_;
  bool had_error_;
  bool server_connection_counted_;
  double timeout_ms_;
  inox_timer_handle* timeout_timer_;

  NetSocketState();
  ~NetSocketState();

  static std::shared_ptr<NetSocketState> create(inox_loop* loop);
  static std::shared_ptr<NetSocketState> connect(
    double port,
    inox::StringView host,
    inox::Callback callback
  );

  NetAddress address(bool remote) const;
  void close(inox::Callback callback, bool had_error = false);
  void end(inox::StringView text, inox::Callback callback);
  void on(inox::StringView event_name, inox::Callback listener);
  void pause();
  void ref();
  inox::String readyState() const;
  void resume();
  void setEncoding(inox::StringView encoding);
  void setKeepAlive(bool enabled, double initial_delay);
  void setNoDelay(bool enabled);
  void setTimeout(double timeout, inox::Callback callback);
  void startReading();
  void stopTimeout();
  void touchTimeout();
  void unref();
  bool write(inox::StringView text, inox::Callback callback);
  void reportError(const char* message, int status);
  void startShutdown(inox::Callback callback);

  static void closeExternalHandle(void* context);
};

class NetServerState : public std::enable_shared_from_this<NetServerState> {
public:
  struct ImmediateRequest;
  struct ConnectionCountRequest;

  inox_loop* loop_;
  uv_tcp_t handle_;
  std::vector<inox::Callback> connection_listeners_;
  std::vector<inox::Callback> listening_listeners_;
  std::vector<inox::Callback> close_listeners_;
  std::vector<inox::Callback> error_listeners_;
  std::shared_ptr<NetServerState> native_owner_;
  bool initialized_;
  bool listening_;
  bool closing_;
  bool closed_;
  bool handle_closed_;
  std::size_t connection_count_;
  std::optional<std::size_t> max_connections_;

  NetServerState();
  ~NetServerState();

  static std::shared_ptr<NetServerState> create(inox::Callback listener);
  NetAddress address() const;
  void close(inox::Callback callback);
  void connectionClosed();
  void finishClose();
  void getConnections(inox::Callback callback);
  void listen(double port, inox::StringView host, double backlog, inox::Callback callback);
  void on(inox::StringView event_name, inox::Callback listener);
  void ref();
  void reportError(const char* message, int status);
  void unref();
  void queueListening();
  void setMaxConnections(double maximum);

  static void closeExternalHandle(void* context);
};

struct NetSocketState::ConnectRequest {
  uv_connect_t request;
  std::shared_ptr<NetSocketState> socket;
  inox::Callback callback;
};

struct NetSocketState::WriteRequest {
  uv_write_t request;
  std::shared_ptr<NetSocketState> socket;
  std::vector<char> bytes;
  inox::Callback callback;
  bool shutdown_after;
};

struct NetSocketState::ShutdownRequest {
  uv_shutdown_t request;
  std::shared_ptr<NetSocketState> socket;
  inox::Callback callback;
};

struct NetServerState::ImmediateRequest {
  std::shared_ptr<NetServerState> server;
};

struct NetServerState::ConnectionCountRequest {
  std::shared_ptr<NetServerState> server;
  inox::Callback callback;
};

struct NetSocketTimerContext {
  std::weak_ptr<NetSocketState> socket;
};

void net_server_connection_cb(uv_stream_t* stream, int status);
void net_connect_cb(uv_connect_t* request, int status);
void net_alloc_cb(uv_handle_t* handle, std::size_t suggested_size, uv_buf_t* buffer);
void net_read_cb(uv_stream_t* stream, ssize_t size, const uv_buf_t* buffer);
void net_write_cb(uv_write_t* request, int status);
void net_shutdown_cb(uv_shutdown_t* request, int status);
void net_server_close_cb(uv_handle_t* handle);
void net_socket_close_cb(uv_handle_t* handle);
inox_status net_socket_timeout_cb(void* context);
void finalize_net_socket_timeout(void* context);

NetSocketState::NetSocketState()
  : loop_(nullptr),
    handle_(),
    connect_listeners_(),
    ready_listeners_(),
    data_listeners_(),
    end_listeners_(),
    close_listeners_(),
    error_listeners_(),
    drain_listeners_(),
    timeout_listeners_(),
    timeout_once_listeners_(),
    native_owner_(),
    server_(),
    bytes_read_(0),
    bytes_written_(0),
    initialized_(false),
    connecting_(false),
    connected_(false),
    closing_(false),
    closed_(false),
    reading_(false),
    paused_(false),
    referenced_(true),
    utf8_encoding_(false),
    needs_drain_(false),
    ending_(false),
    shutdown_started_(false),
    had_error_(false),
    server_connection_counted_(false),
    timeout_ms_(0),
    timeout_timer_(nullptr) {}

NetSocketState::~NetSocketState() {}

std::shared_ptr<NetSocketState> NetSocketState::create(inox_loop* loop) {
  uv_loop_t* uv_loop = loop == nullptr ? nullptr : inox_libuv_loop_handle(loop);

  if (loop == nullptr || uv_loop == nullptr) {
    throwNetError("TypeError: NetSocket creation failed");
    return {};
  }

  std::shared_ptr<NetSocketState> socket;

  try {
    socket = std::make_shared<NetSocketState>();
  } catch (const std::bad_alloc&) {
    throwNetError("TypeError: NetSocket allocation failed");
    return {};
  }

  socket->loop_ = loop;
  const int init_status = uv_tcp_init(uv_loop, &socket->handle_);

  if (init_status != 0) {
    throwNetError("TypeError: NetSocket initialization failed");
    return {};
  }

  socket->initialized_ = true;
  socket->handle_.data = socket.get();

  if (inox_libuv_loop_register_external_handle(loop, socket.get(), closeExternalHandle) != INOX_OK) {
    uv_close(reinterpret_cast<uv_handle_t*>(&socket->handle_), nullptr);
    uv_run(uv_loop, UV_RUN_NOWAIT);
    socket->initialized_ = false;
    throwNetError("TypeError: NetSocket registration failed");
    return {};
  }

  socket->native_owner_ = socket;
  return socket;
}

std::shared_ptr<NetSocketState> NetSocketState::connect(
  double port,
  inox::StringView host,
  inox::Callback callback
) {
  int port_value = 0;

  if (!checkedInteger(port, 0, 65535, port_value, "TypeError: net port is invalid")) {
    return {};
  }

  inox_loop* loop = inox::loop();
  std::shared_ptr<NetSocketState> socket = create(loop);

  if (!socket) {
    return {};
  }

  sockaddr_in address = {};

  if (!resolveIpv4(loop, host, port_value, false, address)) {
    socket->close(inox::Callback());
    return {};
  }

  ConnectRequest* request = new (std::nothrow) ConnectRequest{
    uv_connect_t(),
    socket,
    std::move(callback),
  };

  if (request == nullptr) {
    socket->close(inox::Callback());
    throwNetError("TypeError: NetSocket connect allocation failed");
    return {};
  }

  request->request.data = request;
  const int status = uv_tcp_connect(
    &request->request,
    &socket->handle_,
    reinterpret_cast<const sockaddr*>(&address),
    net_connect_cb
  );

  if (status != 0) {
    delete request;
    socket->close(inox::Callback());
    throwNetError("TypeError: NetSocket.connect failed");
    return {};
  }

  socket->connecting_ = true;

  return socket;
}

NetAddress NetSocketState::address(bool remote) const {
  if (!initialized_ || closing_ || closed_) {
    throwNetError("TypeError: NetSocket.address failed");
    return {inox::String(""), inox::String(""), 0};
  }

  return socketAddress(const_cast<uv_tcp_t&>(handle_), remote);
}

void NetSocketState::reportError(const char* message, int status) {
  if (!error_listeners_.empty()) {
    inox::String error_message = inox::String::fromFormat(
      "%s: %s",
      message == nullptr ? "net operation failed" : message,
      status == 0 ? "unknown error" : uv_strerror(status)
    );
    inox::Value error = materializeNetError(error_message);

    if (inox::thrown() || error.tag != INOX_TAG_OBJECT) {
      reportCallbackStatus(loop_);
      return;
    }

    callListeners(loop_, error_listeners_, error);
    return;
  }

  inox_libuv_loop_report_status(loop_, INOX_ERR_FIELD);
}

void NetSocketState::startReading() {
  if (reading_ || paused_ || !connected_ || closing_ || closed_) {
    return;
  }

  const int status = uv_read_start(
    reinterpret_cast<uv_stream_t*>(&handle_),
    net_alloc_cb,
    net_read_cb
  );

  if (status != 0) {
    reportError("NetSocket read failed", status);
    close(inox::Callback(), true);
    return;
  }

  reading_ = true;
}

void NetSocketState::pause() {
  if (!initialized_ || closing_ || closed_) {
    throwNetError("TypeError: NetSocket.pause failed");
    return;
  }

  paused_ = true;

  if (reading_) {
    uv_read_stop(reinterpret_cast<uv_stream_t*>(&handle_));
    reading_ = false;
  }
}

void NetSocketState::resume() {
  if (!initialized_ || closing_ || closed_) {
    throwNetError("TypeError: NetSocket.resume failed");
    return;
  }

  paused_ = false;
  startReading();
}

inox::String NetSocketState::readyState() const {
  if (connecting_) {
    return inox::String("opening");
  }

  if (!initialized_ || closing_ || closed_ || !connected_) {
    return inox::String("closed");
  }

  const bool readable = !closing_ && !closed_;
  const bool writable = !ending_ && !shutdown_started_ && !closing_ && !closed_;

  if (readable && writable) return inox::String("open");
  if (readable) return inox::String("readOnly");
  if (writable) return inox::String("writeOnly");
  return inox::String("closed");
}

void NetSocketState::on(inox::StringView event_name, inox::Callback listener) {
  if (!listener.valid()) {
    throwNetError("TypeError: NetSocket.on requires a function");
    return;
  }

  std::vector<inox::Callback>* listeners = nullptr;

  if (hasText(event_name, "connect")) listeners = &connect_listeners_;
  else if (hasText(event_name, "ready")) listeners = &ready_listeners_;
  else if (hasText(event_name, "data")) listeners = &data_listeners_;
  else if (hasText(event_name, "end")) listeners = &end_listeners_;
  else if (hasText(event_name, "close")) listeners = &close_listeners_;
  else if (hasText(event_name, "error")) listeners = &error_listeners_;
  else if (hasText(event_name, "drain")) listeners = &drain_listeners_;
  else if (hasText(event_name, "timeout")) listeners = &timeout_listeners_;
  else {
    throwNetError("TypeError: unsupported NetSocket event");
    return;
  }

  try {
    listeners->push_back(std::move(listener));
  } catch (const std::bad_alloc&) {
    throwNetError("TypeError: NetSocket listener allocation failed");
  }
}

void NetSocketState::close(inox::Callback callback, bool had_error) {
  had_error_ = had_error_ || had_error;

  if (closed_) {
    return;
  }

  if (callback.valid()) {
    try {
      close_listeners_.push_back(std::move(callback));
    } catch (const std::bad_alloc&) {
      throwNetError("TypeError: NetSocket close callback allocation failed");
      return;
    }
  }

  if (!initialized_ || closing_) {
    return;
  }

  closing_ = true;
  stopTimeout();

  if (reading_) {
    uv_read_stop(reinterpret_cast<uv_stream_t*>(&handle_));
    reading_ = false;
  }

  uv_close(reinterpret_cast<uv_handle_t*>(&handle_), net_socket_close_cb);
}

bool NetSocketState::write(inox::StringView text, inox::Callback callback) {
  if (!initialized_ || closing_ || closed_ || ending_ || shutdown_started_) {
    throwNetError("TypeError: NetSocket.write failed");
    return false;
  }

  WriteRequest* request = new (std::nothrow) WriteRequest{
    uv_write_t(),
    shared_from_this(),
    std::vector<char>(),
    std::move(callback),
    false,
  };

  if (request == nullptr) {
    throwNetError("TypeError: NetSocket write allocation failed");
    return false;
  }

  try {
    request->bytes.assign(text.bytes, text.bytes + text.len);
  } catch (const std::bad_alloc&) {
    delete request;
    throwNetError("TypeError: NetSocket write allocation failed");
    return false;
  }

  request->request.data = request;
  uv_buf_t buffer = uv_buf_init(
    request->bytes.empty() ? nullptr : request->bytes.data(),
    static_cast<unsigned int>(request->bytes.size())
  );
  const int status = uv_write(
    &request->request,
    reinterpret_cast<uv_stream_t*>(&handle_),
    &buffer,
    1,
    net_write_cb);

  if (status != 0) {
    delete request;
    throwNetError("TypeError: NetSocket.write failed");
    return false;
  }

  constexpr std::size_t highWaterMark = 16 * 1024;
  needs_drain_ = uv_stream_get_write_queue_size(reinterpret_cast<uv_stream_t*>(&handle_)) >= highWaterMark;
  return !needs_drain_;
}

void NetSocketState::startShutdown(inox::Callback callback) {
  if (shutdown_started_) {
    throwNetError("TypeError: NetSocket.end failed");
    return;
  }

  shutdown_started_ = true;
  ShutdownRequest* request = new (std::nothrow) ShutdownRequest{
    uv_shutdown_t(),
    shared_from_this(),
    std::move(callback),
  };

  if (request == nullptr) {
    shutdown_started_ = false;
    throwNetError("TypeError: NetSocket shutdown allocation failed");
    return;
  }

  request->request.data = request;
  const int status = uv_shutdown(
    &request->request,
    reinterpret_cast<uv_stream_t*>(&handle_),
    net_shutdown_cb);

  if (status != 0) {
    shutdown_started_ = false;
    delete request;
    throwNetError("TypeError: NetSocket.end failed");
  }
}

void NetSocketState::end(inox::StringView text, inox::Callback callback) {
  if (!initialized_ || closing_ || closed_ || ending_ || shutdown_started_) {
    throwNetError("TypeError: NetSocket.end failed");
    return;
  }

  ending_ = true;

  if (text.len == 0) {
    startShutdown(std::move(callback));

    if (inox::thrown()) {
      ending_ = false;
    }

    return;
  }

  WriteRequest* request = new (std::nothrow) WriteRequest{
    uv_write_t(),
    shared_from_this(),
    std::vector<char>(),
    std::move(callback),
    true,
  };

  if (request == nullptr) {
    ending_ = false;
    throwNetError("TypeError: NetSocket end allocation failed");
    return;
  }

  try {
    request->bytes.assign(text.bytes, text.bytes + text.len);
  } catch (const std::bad_alloc&) {
    delete request;
    ending_ = false;
    throwNetError("TypeError: NetSocket end allocation failed");
    return;
  }

  request->request.data = request;
  uv_buf_t buffer = uv_buf_init(request->bytes.data(), static_cast<unsigned int>(request->bytes.size()));
  const int status = uv_write(
    &request->request,
    reinterpret_cast<uv_stream_t*>(&handle_),
    &buffer,
    1,
    net_write_cb);

  if (status != 0) {
    delete request;
    ending_ = false;
    throwNetError("TypeError: NetSocket.end failed");
  }
}

void NetSocketState::setEncoding(inox::StringView encoding) {
  if (encoding.len == 0) {
    utf8_encoding_ = false;
    return;
  }

  if (!hasText(encoding, "utf8") && !hasText(encoding, "utf-8")) {
    throwNetError("TypeError: NetSocket.setEncoding supports only utf8");
    return;
  }

  utf8_encoding_ = true;
}

void NetSocketState::setKeepAlive(bool enabled, double initial_delay) {
  int delay = 0;

  if (!checkedInteger(
        initial_delay,
        0,
        std::numeric_limits<int>::max(),
        delay,
        "TypeError: NetSocket.setKeepAlive initialDelay is invalid"
      )) {
    return;
  }

  const int status = uv_tcp_keepalive(&handle_, enabled ? 1 : 0, static_cast<unsigned int>(delay));

  if (status != 0) {
    throwNetError("TypeError: NetSocket.setKeepAlive failed");
  }
}

void NetSocketState::setNoDelay(bool enabled) {
  if (uv_tcp_nodelay(&handle_, enabled ? 1 : 0) != 0) {
    throwNetError("TypeError: NetSocket.setNoDelay failed");
  }
}

void NetSocketState::stopTimeout() {
  if (timeout_timer_ == nullptr) return;
  inox_timer_handle* timer = timeout_timer_;
  timeout_timer_ = nullptr;
  inox_loop_clear_timer(timer);
}

void NetSocketState::touchTimeout() {
  stopTimeout();

  if (timeout_ms_ <= 0 || !connected_ || closing_ || closed_) return;

  auto* context = new (std::nothrow) NetSocketTimerContext{weak_from_this()};

  if (context == nullptr ||
      inox_loop_set_timeout(
        loop_,
        timeout_ms_,
        net_socket_timeout_cb,
        context,
        finalize_net_socket_timeout,
        &timeout_timer_
      ) != INOX_OK) {
    delete context;
    timeout_timer_ = nullptr;
    throwNetError("TypeError: NetSocket timeout allocation failed");
    return;
  }

  inox_loop_unref_timer(timeout_timer_);
}

void NetSocketState::setTimeout(double timeout, inox::Callback callback) {
  if (!std::isfinite(timeout) || std::floor(timeout) != timeout || timeout < 0) {
    throwNetError("TypeError: NetSocket.setTimeout requires a non-negative integer");
    return;
  }

  if (callback.valid()) {
    try {
      timeout_once_listeners_.push_back(std::move(callback));
    } catch (const std::bad_alloc&) {
      throwNetError("TypeError: NetSocket timeout listener allocation failed");
      return;
    }
  }

  timeout_ms_ = timeout;
  touchTimeout();
}

void NetSocketState::ref() {
  if (!referenced_) {
    uv_ref(reinterpret_cast<uv_handle_t*>(&handle_));
    referenced_ = true;
  }
}

void NetSocketState::unref() {
  if (referenced_) {
    uv_unref(reinterpret_cast<uv_handle_t*>(&handle_));
    referenced_ = false;
  }
}

void NetSocketState::closeExternalHandle(void* context) {
  auto* socket = static_cast<NetSocketState*>(context);

  if (socket != nullptr) {
    socket->connect_listeners_.clear();
    socket->ready_listeners_.clear();
    socket->data_listeners_.clear();
    socket->end_listeners_.clear();
    socket->close_listeners_.clear();
    socket->error_listeners_.clear();
    socket->drain_listeners_.clear();
    socket->timeout_listeners_.clear();
    socket->timeout_once_listeners_.clear();
    socket->close(inox::Callback());
  }
}

inox_status net_socket_timeout_cb(void* context) {
  const auto* timer = static_cast<NetSocketTimerContext*>(context);
  const std::shared_ptr<NetSocketState> socket = timer == nullptr ? nullptr : timer->socket.lock();

  if (!socket) return INOX_OK;

  socket->timeout_timer_ = nullptr;

  if (socket->closing_ || socket->closed_) return INOX_OK;

  std::vector<inox::Callback> once_listeners = std::move(socket->timeout_once_listeners_);
  callListeners(socket->loop_, once_listeners);

  if (!inox::thrown()) {
    callListeners(socket->loop_, socket->timeout_listeners_);
  }

  return inox::thrown() ? INOX_ERR_THROW : INOX_OK;
}

void finalize_net_socket_timeout(void* context) {
  delete static_cast<NetSocketTimerContext*>(context);
}

NetServerState::NetServerState()
  : loop_(nullptr),
    handle_(),
    connection_listeners_(),
    listening_listeners_(),
    close_listeners_(),
    error_listeners_(),
    native_owner_(),
    initialized_(false),
    listening_(false),
    closing_(false),
    closed_(false),
    handle_closed_(false),
    connection_count_(0),
    max_connections_() {}

NetServerState::~NetServerState() {}

std::shared_ptr<NetServerState> NetServerState::create(inox::Callback listener) {
  inox_loop* loop = inox::loop();
  uv_loop_t* uv_loop = loop == nullptr ? nullptr : inox_libuv_loop_handle(loop);

  if (loop == nullptr || uv_loop == nullptr) {
    throwNetError("TypeError: NetServer creation failed");
    return {};
  }

  std::shared_ptr<NetServerState> server;

  try {
    server = std::make_shared<NetServerState>();
  } catch (const std::bad_alloc&) {
    throwNetError("TypeError: NetServer allocation failed");
    return {};
  }

  server->loop_ = loop;

  if (listener.valid()) {
    try {
      server->connection_listeners_.push_back(std::move(listener));
    } catch (const std::bad_alloc&) {
      throwNetError("TypeError: NetServer listener allocation failed");
      return {};
    }
  }

  if (uv_tcp_init(uv_loop, &server->handle_) != 0) {
    throwNetError("TypeError: NetServer initialization failed");
    return {};
  }

  server->initialized_ = true;
  server->handle_.data = server.get();

  if (inox_libuv_loop_register_external_handle(loop, server.get(), closeExternalHandle) != INOX_OK) {
    uv_close(reinterpret_cast<uv_handle_t*>(&server->handle_), nullptr);
    uv_run(uv_loop, UV_RUN_NOWAIT);
    server->initialized_ = false;
    throwNetError("TypeError: NetServer registration failed");
    return {};
  }

  server->native_owner_ = server;
  return server;
}

NetAddress NetServerState::address() const {
  if (!initialized_ || closing_ || closed_ || !listening_) {
    throwNetError("TypeError: NetServer.address failed");
    return {inox::String(""), inox::String(""), 0};
  }

  return socketAddress(const_cast<uv_tcp_t&>(handle_), false);
}

void NetServerState::reportError(const char* message, int status) {
  if (!error_listeners_.empty()) {
    inox::String error_message = inox::String::fromFormat(
      "%s: %s",
      message == nullptr ? "net server failed" : message,
      status == 0 ? "unknown error" : uv_strerror(status)
    );
    inox::Value error = materializeNetError(error_message);

    if (inox::thrown() || error.tag != INOX_TAG_OBJECT) {
      reportCallbackStatus(loop_);
      return;
    }

    callListeners(loop_, error_listeners_, error);
    return;
  }

  inox_libuv_loop_report_status(loop_, INOX_ERR_FIELD);
}

inox_status runListeningImmediate(void* context) {
  auto* request = static_cast<NetServerState::ImmediateRequest*>(context);

  if (request == nullptr || !request->server) {
    return INOX_OK;
  }

  try {
    std::vector<inox::Callback> listeners = request->server->listening_listeners_;

    for (const inox::Callback& listener : listeners) {
      inox::Value result = listener.call();
      (void)result;

      if (inox::thrown()) {
        return INOX_ERR_THROW;
      }
    }
  } catch (const std::bad_alloc&) {
    return INOX_ERR_OOM;
  }

  return INOX_OK;
}

void finalizeListeningImmediate(void* context) {
  delete static_cast<NetServerState::ImmediateRequest*>(context);
}

inox_status runConnectionCountImmediate(void* context) {
  auto* request = static_cast<NetServerState::ConnectionCountRequest*>(context);

  if (request == nullptr || !request->server || !request->callback.valid()) {
    return INOX_OK;
  }

  const std::array<inox::Value, 2> arguments = {
    inox::Value(inox_null_value()),
    inox::Value(inox_number_value(static_cast<double>(request->server->connection_count_))),
  };
  inox::Value result = request->callback.call(std::span<const inox::Value>(arguments));
  (void)result;
  return inox::thrown() ? INOX_ERR_THROW : INOX_OK;
}

void finalizeConnectionCountImmediate(void* context) {
  delete static_cast<NetServerState::ConnectionCountRequest*>(context);
}

void NetServerState::queueListening() {
  ImmediateRequest* request = new (std::nothrow) ImmediateRequest{shared_from_this()};

  if (request == nullptr) {
    throwNetError("TypeError: NetServer listening callback allocation failed");
    return;
  }

  if (inox_loop_queue_immediate(
        loop_,
        runListeningImmediate,
        request,
        finalizeListeningImmediate,
        nullptr
      ) != INOX_OK) {
    delete request;
    throwNetError("TypeError: NetServer listening callback queue failed");
  }
}

void NetServerState::getConnections(inox::Callback callback) {
  if (!callback.valid()) {
    throwNetError("TypeError: NetServer.getConnections requires a function");
    return;
  }

  ConnectionCountRequest* request = new (std::nothrow) ConnectionCountRequest{
    shared_from_this(),
    std::move(callback),
  };

  if (request == nullptr ||
      inox_loop_queue_immediate(
        loop_,
        runConnectionCountImmediate,
        request,
        finalizeConnectionCountImmediate,
        nullptr
      ) != INOX_OK) {
    delete request;
    throwNetError("TypeError: NetServer.getConnections callback queue failed");
  }
}

void NetServerState::listen(double port, inox::StringView host, double backlog, inox::Callback callback) {
  if (!initialized_ || listening_ || closing_ || closed_) {
    throwNetError("TypeError: NetServer.listen failed");
    return;
  }

  int port_value = 0;
  int backlog_value = 0;

  if (!checkedInteger(port, 0, 65535, port_value, "TypeError: net port is invalid") ||
      !checkedInteger(
        backlog,
        1,
        std::numeric_limits<int>::max(),
        backlog_value,
        "TypeError: net backlog is invalid"
      )) {
    return;
  }

  if (callback.valid()) {
    try {
      listening_listeners_.push_back(std::move(callback));
    } catch (const std::bad_alloc&) {
      throwNetError("TypeError: NetServer listening callback allocation failed");
      return;
    }
  }

  sockaddr_in address = {};

  if (!resolveIpv4(loop_, host, port_value, true, address)) {
    return;
  }

  int status = uv_tcp_bind(&handle_, reinterpret_cast<const sockaddr*>(&address), 0);

  if (status == 0) {
    status = uv_listen(reinterpret_cast<uv_stream_t*>(&handle_), backlog_value, net_server_connection_cb);
  }

  if (status != 0) {
    reportError("NetServer.listen failed", status);
    return;
  }

  listening_ = true;
  queueListening();
}

void NetServerState::on(inox::StringView event_name, inox::Callback listener) {
  if (!listener.valid()) {
    throwNetError("TypeError: NetServer.on requires a function");
    return;
  }

  std::vector<inox::Callback>* listeners = nullptr;

  if (hasText(event_name, "connection")) listeners = &connection_listeners_;
  else if (hasText(event_name, "listening")) listeners = &listening_listeners_;
  else if (hasText(event_name, "close")) listeners = &close_listeners_;
  else if (hasText(event_name, "error")) listeners = &error_listeners_;
  else {
    throwNetError("TypeError: unsupported NetServer event");
    return;
  }

  try {
    listeners->push_back(std::move(listener));
  } catch (const std::bad_alloc&) {
    throwNetError("TypeError: NetServer listener allocation failed");
  }
}

void NetServerState::ref() {
  if (!initialized_ || closing_ || closed_) {
    throwNetError("TypeError: NetServer.ref failed");
    return;
  }

  uv_ref(reinterpret_cast<uv_handle_t*>(&handle_));
}

void NetServerState::unref() {
  if (!initialized_ || closing_ || closed_) {
    throwNetError("TypeError: NetServer.unref failed");
    return;
  }

  uv_unref(reinterpret_cast<uv_handle_t*>(&handle_));
}

void NetServerState::setMaxConnections(double maximum) {
  constexpr double maxSafeInteger = 9007199254740991.0;

  if (!std::isfinite(maximum) || std::floor(maximum) != maximum || maximum < 0 ||
      maximum > maxSafeInteger || maximum > static_cast<double>(std::numeric_limits<std::size_t>::max())) {
    throwNetError("TypeError: NetServer.maxConnections requires a non-negative integer");
    return;
  }

  max_connections_ = static_cast<std::size_t>(maximum);
}

void NetServerState::close(inox::Callback callback) {
  if (closed_) {
    throwNetError("TypeError: NetServer.close failed: server is not running");
    return;
  }

  if (callback.valid()) {
    try {
      close_listeners_.push_back(std::move(callback));
    } catch (const std::bad_alloc&) {
      throwNetError("TypeError: NetServer close callback allocation failed");
      return;
    }
  }

  if (!initialized_ || closing_) {
    return;
  }

  closing_ = true;
  uv_close(reinterpret_cast<uv_handle_t*>(&handle_), net_server_close_cb);
}

void NetServerState::connectionClosed() {
  if (connection_count_ > 0) {
    connection_count_ -= 1;
  }

  finishClose();
}

void NetServerState::finishClose() {
  if (closed_ || !handle_closed_ || connection_count_ != 0) return;

  closed_ = true;
  std::vector<inox::Callback> close_listeners = std::move(close_listeners_);
  connection_listeners_.clear();
  listening_listeners_.clear();
  error_listeners_.clear();
  callListeners(loop_, close_listeners);
  native_owner_.reset();
}

void NetServerState::closeExternalHandle(void* context) {
  auto* server = static_cast<NetServerState*>(context);

  if (server != nullptr) {
    server->connection_listeners_.clear();
    server->listening_listeners_.clear();
    server->close_listeners_.clear();
    server->error_listeners_.clear();
    server->close(inox::Callback());
  }
}

void net_server_connection_cb(uv_stream_t* stream, int status) {
  auto* server = stream == nullptr ? nullptr : static_cast<NetServerState*>(stream->data);

  if (server == nullptr) {
    return;
  }

  if (status != 0) {
    server->reportError("NetServer connection failed", status);
    return;
  }

  std::shared_ptr<NetSocketState> socket = NetSocketState::create(server->loop_);

  if (!socket) {
    server->reportError("NetServer socket creation failed", UV_ENOMEM);
    return;
  }

  const int accept_status = uv_accept(stream, reinterpret_cast<uv_stream_t*>(&socket->handle_));

  if (accept_status != 0) {
    socket->close(inox::Callback());
    server->reportError("NetServer accept failed", accept_status);
    return;
  }

  if (server->max_connections_ && server->connection_count_ >= *server->max_connections_) {
    socket->connected_ = true;
    socket->close(inox::Callback());
    return;
  }

  socket->connected_ = true;
  socket->server_ = server->weak_from_this();
  socket->server_connection_counted_ = true;
  server->connection_count_ += 1;
  socket->startReading();
  NetSocket facade = materializeSocket(socket);

  if (!inox::thrown()) {
    callListeners(server->loop_, server->connection_listeners_, facade);
  } else {
    socket->close(inox::Callback(), true);
  }
}

void net_connect_cb(uv_connect_t* raw_request, int status) {
  auto* request = raw_request == nullptr
    ? nullptr
    : static_cast<NetSocketState::ConnectRequest*>(raw_request->data);

  if (request == nullptr || !request->socket) {
    return;
  }

  std::shared_ptr<NetSocketState> socket = request->socket;
  inox::Callback callback = std::move(request->callback);
  delete request;
  socket->connecting_ = false;

  if (status != 0) {
    socket->reportError("NetSocket.connect failed", status);
    socket->close(inox::Callback(), true);
    return;
  }

  socket->connected_ = true;
  socket->startReading();
  socket->touchTimeout();

  if (inox::thrown()) {
    reportCallbackStatus(socket->loop_);
    socket->close(inox::Callback(), true);
    return;
  }

  if (callback.valid()) {
    inox::Value result = callback.call();
    (void)result;
    reportCallbackStatus(socket->loop_);
  }

  if (!inox::thrown()) callListeners(socket->loop_, socket->connect_listeners_);
  if (!inox::thrown()) callListeners(socket->loop_, socket->ready_listeners_);
}

void net_alloc_cb(uv_handle_t* handle, std::size_t suggested_size, uv_buf_t* buffer) {
  (void)handle;
  const std::size_t length = suggested_size == 0 ? 65536 : suggested_size;
  char* bytes = new (std::nothrow) char[length];
  *buffer = uv_buf_init(bytes, bytes == nullptr ? 0 : static_cast<unsigned int>(length));
}

void net_read_cb(uv_stream_t* stream, ssize_t size, const uv_buf_t* buffer) {
  auto* socket = stream == nullptr ? nullptr : static_cast<NetSocketState*>(stream->data);
  char* bytes = buffer == nullptr ? nullptr : buffer->base;

  if (socket == nullptr) {
    delete[] bytes;
    return;
  }

  if (size > 0) {
    socket->bytes_read_ += static_cast<std::size_t>(size);
    socket->touchTimeout();

    if (inox::thrown()) {
      reportCallbackStatus(socket->loop_);
      socket->close(inox::Callback(), true);
      delete[] bytes;
      return;
    }

    inox::String data(bytes, static_cast<std::size_t>(size));

    if (data.valid() && !inox::thrown()) {
      callListeners(socket->loop_, socket->data_listeners_, data);
    } else {
      inox_libuv_loop_report_status(socket->loop_, INOX_ERR_OOM);
    }
  } else if (size == UV_EOF) {
    if (socket->reading_) {
      uv_read_stop(stream);
      socket->reading_ = false;
    }

    callListeners(socket->loop_, socket->end_listeners_);
    socket->close(inox::Callback());
  } else if (size < 0) {
    if (socket->reading_) {
      uv_read_stop(stream);
      socket->reading_ = false;
    }

    socket->reportError("NetSocket read failed", static_cast<int>(size));
    socket->close(inox::Callback(), true);
  }

  delete[] bytes;
}

void net_write_cb(uv_write_t* raw_request, int status) {
  auto* request = raw_request == nullptr
    ? nullptr
    : static_cast<NetSocketState::WriteRequest*>(raw_request->data);

  if (request == nullptr || !request->socket) {
    return;
  }

  std::shared_ptr<NetSocketState> socket = request->socket;
  inox::Callback callback = std::move(request->callback);
  const bool shutdown_after = request->shutdown_after;
  const std::size_t length = request->bytes.size();
  delete request;

  if (status != 0) {
    socket->reportError("NetSocket.write failed", status);
    socket->close(inox::Callback(), true);
    return;
  }

  socket->bytes_written_ += length;
  socket->touchTimeout();

  if (inox::thrown()) {
    reportCallbackStatus(socket->loop_);
    socket->close(inox::Callback(), true);
    return;
  }

  if (shutdown_after) {
    socket->startShutdown(std::move(callback));

    if (inox::thrown()) {
      reportCallbackStatus(socket->loop_);
      socket->close(inox::Callback(), true);
    }

    return;
  }

  if (callback.valid()) {
    inox::Value result = callback.call();
    (void)result;
    reportCallbackStatus(socket->loop_);
  }

  if (socket->needs_drain_ &&
      uv_stream_get_write_queue_size(reinterpret_cast<uv_stream_t*>(&socket->handle_)) == 0) {
    socket->needs_drain_ = false;
    callListeners(socket->loop_, socket->drain_listeners_);
  }
}

void net_shutdown_cb(uv_shutdown_t* raw_request, int status) {
  auto* request = raw_request == nullptr
    ? nullptr
    : static_cast<NetSocketState::ShutdownRequest*>(raw_request->data);

  if (request == nullptr || !request->socket) {
    return;
  }

  std::shared_ptr<NetSocketState> socket = request->socket;
  inox::Callback callback = std::move(request->callback);
  delete request;

  if (status != 0) {
    socket->reportError("NetSocket.end failed", status);
    socket->close(inox::Callback(), true);
    return;
  }

  if (callback.valid()) {
    inox::Value result = callback.call();
    (void)result;
    reportCallbackStatus(socket->loop_);
  }
}

void net_server_close_cb(uv_handle_t* handle) {
  auto* server = handle == nullptr ? nullptr : static_cast<NetServerState*>(handle->data);

  if (server == nullptr) {
    return;
  }

  std::shared_ptr<NetServerState> owner = server->native_owner_;
  server->initialized_ = false;
  server->listening_ = false;
  server->handle_closed_ = true;
  inox_libuv_loop_unregister_external_handle(server->loop_, server);
  server->finishClose();
}

void net_socket_close_cb(uv_handle_t* handle) {
  auto* socket = handle == nullptr ? nullptr : static_cast<NetSocketState*>(handle->data);

  if (socket == nullptr) {
    return;
  }

  std::shared_ptr<NetSocketState> owner = socket->native_owner_;
  socket->closed_ = true;
  socket->initialized_ = false;
  socket->connecting_ = false;
  socket->connected_ = false;
  socket->stopTimeout();
  inox_libuv_loop_unregister_external_handle(socket->loop_, socket);
  std::vector<inox::Callback> close_listeners_ = std::move(socket->close_listeners_);
  socket->connect_listeners_.clear();
  socket->ready_listeners_.clear();
  socket->data_listeners_.clear();
  socket->end_listeners_.clear();
  socket->error_listeners_.clear();
  socket->drain_listeners_.clear();
  socket->timeout_listeners_.clear();
  socket->timeout_once_listeners_.clear();
  const inox::Value had_error(inox_bool_value(socket->had_error_));
  callListeners(socket->loop_, close_listeners_, had_error);

  if (socket->server_connection_counted_) {
    socket->server_connection_counted_ = false;
    const std::shared_ptr<NetServerState> server = socket->server_.lock();
    socket->server_.reset();
    if (server) server->connectionClosed();
  }

  socket->native_owner_.reset();
}

#else

class NetServerState {};
class NetSocketState {};

#endif

inox_status readServerField(const void* instance, std::uint32_t index, inox_value* out) {
  if (instance == nullptr || out == nullptr) {
    return INOX_ERR_FIELD;
  }

  const auto* holder = static_cast<const NetServerHolder*>(instance);
  NetServer server = materializeServer(holder->state);

  if (!holder->state || inox::thrown()) {
    return INOX_ERR_TYPE;
  }

  if (index == 0) {
    *out = inox_bool_value(server.listening());
    return inox::thrown() ? INOX_ERR_TYPE : INOX_OK;
  }

  if (index == 1) {
    return server.maxConnections().copy_to(out);
  }

  return INOX_ERR_FIELD;
}

inox_status readSocketField(const void* instance, std::uint32_t index, inox_value* out) {
  if (instance == nullptr || out == nullptr) {
    return INOX_ERR_TYPE;
  }

  const auto* holder = static_cast<const NetSocketHolder*>(instance);
  NetSocket socket = materializeSocket(holder->state);

  if (!holder->state || inox::thrown()) {
    return INOX_ERR_TYPE;
  }

  switch (index) {
    case 0:
      *out = inox_number_value(socket.bytesRead());
      return INOX_OK;
    case 1:
      *out = inox_number_value(socket.bytesWritten());
      return INOX_OK;
    case 2:
      *out = inox_bool_value(socket.connecting());
      return INOX_OK;
    case 3:
      *out = inox_bool_value(socket.destroyed());
      return INOX_OK;
    case 4:
      return socket.localAddress().copy_to(out);
    case 5:
      *out = inox_number_value(socket.localPort());
      return INOX_OK;
    case 6:
      *out = inox_bool_value(socket.pending());
      return INOX_OK;
    case 7:
      return socket.readyState().copy_to(out);
    case 8:
      return socket.remoteAddress().copy_to(out);
    case 9:
      *out = inox_number_value(socket.remotePort());
      return INOX_OK;
    default:
      return INOX_ERR_FIELD;
  }
}

std::shared_ptr<NetSocketState> connectSocket(
  double port,
  inox::StringView host,
  inox::Callback callback
) {
#ifdef INOX_LOOP_BACKEND_LIBUV
  return NetSocketState::connect(port, host, std::move(callback));
#else
  (void)port;
  (void)host;
  (void)callback;
  throwNetError("TypeError: node:net is unsupported without libuv");
  return {};
#endif
}

} // namespace

NetListenOptions::NetListenOptions() : valid_(true), port_(), host_(), backlog_() {}

NetListenOptions::NetListenOptions(const inox::Value& value)
  : valid_(false), port_(), host_(), backlog_() {
  if (!readOptionalNumber(value, "port", port_, 0, 65535) ||
      !readOptionalString(value, "host", host_) ||
      !readOptionalNumber(value, "backlog", backlog_, 1, std::numeric_limits<int>::max())) {
    return;
  }

  valid_ = true;
}

NetConnectionOptions::NetConnectionOptions() : valid_(false), port_(), host_() {}

NetConnectionOptions::NetConnectionOptions(const inox::Value& value)
  : valid_(false), port_(), host_() {
  if (!readOptionalNumber(value, "port", port_, 0, 65535) ||
      !readOptionalString(value, "host", host_)) {
    return;
  }

  if (!port_) {
    throwNetError("TypeError: net connection options require port");
    return;
  }

  valid_ = true;
}

NetServer::NetServer() : inox::Value() {}
NetServer::NetServer(const inox::Value& value) : inox::Value(value) {}
NetServer::NetServer(inox::Value&& value) : inox::Value(std::move(value)) {}

NetAddress NetServer::address() const {
  std::shared_ptr<NetServerState> state = serverState(*this);

#ifdef INOX_LOOP_BACKEND_LIBUV
  if (state) return state->address();
#endif

  throwNetError("TypeError: NetServer.address failed");
  return {inox::String(""), inox::String(""), 0};
}

NetServer& NetServer::close() {
  return close(inox::Callback());
}

NetServer& NetServer::close(inox::Callback callback) {
  std::shared_ptr<NetServerState> state = serverState(*this);

#ifdef INOX_LOOP_BACKEND_LIBUV
  if (state) state->close(std::move(callback));
  else throwNetError("TypeError: NetServer.close failed");
#else
  (void)state;
  (void)callback;
  throwNetError("TypeError: node:net is unsupported without libuv");
#endif

  return *this;
}

NetServer& NetServer::getConnections(inox::Callback callback) {
  std::shared_ptr<NetServerState> state = serverState(*this);

#ifdef INOX_LOOP_BACKEND_LIBUV
  if (state) state->getConnections(std::move(callback));
  else throwNetError("TypeError: NetServer.getConnections failed");
#else
  (void)state;
  (void)callback;
  throwNetError("TypeError: node:net is unsupported without libuv");
#endif

  return *this;
}

bool NetServer::listening() const {
  std::shared_ptr<NetServerState> state = serverState(*this);

#ifdef INOX_LOOP_BACKEND_LIBUV
  if (state) return state->listening_ && !state->closing_ && !state->closed_;
  throwNetError("TypeError: NetServer.listening failed");
#else
  (void)state;
  throwNetError("TypeError: node:net is unsupported without libuv");
#endif

  return false;
}

NetServer& NetServer::listen() {
  return listen(0, inox::StringView("0.0.0.0"), 128, inox::Callback());
}

NetServer& NetServer::listen(inox::Callback callback) {
  return listen(0, inox::StringView("0.0.0.0"), 128, std::move(callback));
}

NetServer& NetServer::listen(double port) {
  return listen(port, inox::StringView("0.0.0.0"), 128, inox::Callback());
}

NetServer& NetServer::listen(double port, double backlog) {
  return listen(port, inox::StringView("0.0.0.0"), backlog, inox::Callback());
}

NetServer& NetServer::listen(double port, inox::Callback callback) {
  return listen(port, inox::StringView("0.0.0.0"), 128, std::move(callback));
}

NetServer& NetServer::listen(double port, inox::StringView host) {
  return listen(port, host, 128, inox::Callback());
}

NetServer& NetServer::listen(double port, inox::StringView host, inox::Callback callback) {
  return listen(port, host, 128, std::move(callback));
}

NetServer& NetServer::listen(double port, inox::StringView host, double backlog) {
  return listen(port, host, backlog, inox::Callback());
}

NetServer& NetServer::listen(double port, double backlog, inox::Callback callback) {
  return listen(port, inox::StringView("0.0.0.0"), backlog, std::move(callback));
}

NetServer& NetServer::listen(
  double port,
  inox::StringView host,
  double backlog,
  inox::Callback callback
) {
  std::shared_ptr<NetServerState> state = serverState(*this);

#ifdef INOX_LOOP_BACKEND_LIBUV
  if (state) state->listen(port, host, backlog, std::move(callback));
  else throwNetError("TypeError: NetServer.listen failed");
#else
  (void)state;
  (void)port;
  (void)host;
  (void)backlog;
  (void)callback;
  throwNetError("TypeError: node:net is unsupported without libuv");
#endif

  return *this;
}

NetServer& NetServer::listen(const NetListenOptions& options) {
  return listen(options, inox::Callback());
}

NetServer& NetServer::listen(const NetListenOptions& options, inox::Callback callback) {
  if (inox::thrown() || !options.valid_) {
    return *this;
  }

  const double port = options.port_.value_or(0);
  const inox::StringView host = options.host_
    ? inox::StringView(*options.host_)
    : inox::StringView("0.0.0.0");
  return listen(port, host, options.backlog_.value_or(128), std::move(callback));
}

inox::Value NetServer::maxConnections() const {
  std::shared_ptr<NetServerState> state = serverState(*this);

#ifdef INOX_LOOP_BACKEND_LIBUV
  if (state) {
    if (!state->max_connections_) return inox::Value(inox_undefined_value());
    return inox::Value(inox_number_value(static_cast<double>(*state->max_connections_)));
  }

  throwNetError("TypeError: NetServer.maxConnections failed");
#else
  (void)state;
  throwNetError("TypeError: node:net is unsupported without libuv");
#endif

  return inox::Value();
}

NetServer& NetServer::on(inox::StringView event_name, inox::Callback listener) {
  std::shared_ptr<NetServerState> state = serverState(*this);

#ifdef INOX_LOOP_BACKEND_LIBUV
  if (state) state->on(event_name, std::move(listener));
  else throwNetError("TypeError: NetServer.on failed");
#else
  (void)state;
  (void)event_name;
  (void)listener;
  throwNetError("TypeError: node:net is unsupported without libuv");
#endif

  return *this;
}

NetServer& NetServer::ref() {
  std::shared_ptr<NetServerState> state = serverState(*this);

#ifdef INOX_LOOP_BACKEND_LIBUV
  if (state) state->ref();
  else throwNetError("TypeError: NetServer.ref failed");
#else
  (void)state;
  throwNetError("TypeError: node:net is unsupported without libuv");
#endif

  return *this;
}

void NetServer::setMaxConnections(double maximum) {
  std::shared_ptr<NetServerState> state = serverState(*this);

#ifdef INOX_LOOP_BACKEND_LIBUV
  if (state) state->setMaxConnections(maximum);
  else throwNetError("TypeError: NetServer.maxConnections assignment failed");
#else
  (void)state;
  (void)maximum;
  throwNetError("TypeError: node:net is unsupported without libuv");
#endif
}

NetServer& NetServer::unref() {
  std::shared_ptr<NetServerState> state = serverState(*this);

#ifdef INOX_LOOP_BACKEND_LIBUV
  if (state) state->unref();
  else throwNetError("TypeError: NetServer.unref failed");
#else
  (void)state;
  throwNetError("TypeError: node:net is unsupported without libuv");
#endif

  return *this;
}

NetSocket::NetSocket() : inox::Value() {}
NetSocket::NetSocket(const inox::Value& value) : inox::Value(value) {}
NetSocket::NetSocket(inox::Value&& value) : inox::Value(std::move(value)) {}

NetAddress NetSocket::address() const {
  std::shared_ptr<NetSocketState> state = socketState(*this);

#ifdef INOX_LOOP_BACKEND_LIBUV
  if (state) return state->address(false);
#endif

  throwNetError("TypeError: NetSocket.address failed");
  return {inox::String(""), inox::String(""), 0};
}

double NetSocket::bytesRead() const {
  std::shared_ptr<NetSocketState> state = socketState(*this);

#ifdef INOX_LOOP_BACKEND_LIBUV
  if (state) return static_cast<double>(state->bytes_read_);
#endif

  throwNetError("TypeError: NetSocket.bytesRead failed");
  return 0;
}

double NetSocket::bytesWritten() const {
  std::shared_ptr<NetSocketState> state = socketState(*this);

#ifdef INOX_LOOP_BACKEND_LIBUV
  if (state) return static_cast<double>(state->bytes_written_);
#endif

  throwNetError("TypeError: NetSocket.bytesWritten failed");
  return 0;
}

bool NetSocket::connecting() const {
  std::shared_ptr<NetSocketState> state = socketState(*this);

#ifdef INOX_LOOP_BACKEND_LIBUV
  if (state) return state->connecting_;
  throwNetError("TypeError: NetSocket.connecting failed");
#else
  (void)state;
  throwNetError("TypeError: node:net is unsupported without libuv");
#endif

  return false;
}

NetSocket& NetSocket::destroy() {
  std::shared_ptr<NetSocketState> state = socketState(*this);

#ifdef INOX_LOOP_BACKEND_LIBUV
  if (state) state->close(inox::Callback());
  else throwNetError("TypeError: NetSocket.destroy failed");
#else
  (void)state;
  throwNetError("TypeError: node:net is unsupported without libuv");
#endif

  return *this;
}

bool NetSocket::destroyed() const {
  std::shared_ptr<NetSocketState> state = socketState(*this);

#ifdef INOX_LOOP_BACKEND_LIBUV
  if (state) return state->closing_ || state->closed_;
  throwNetError("TypeError: NetSocket.destroyed failed");
#else
  (void)state;
  throwNetError("TypeError: node:net is unsupported without libuv");
#endif

  return false;
}

NetSocket& NetSocket::end() {
  return end(inox::StringView(), inox::Callback());
}

NetSocket& NetSocket::end(inox::Callback callback) {
  return end(inox::StringView(), std::move(callback));
}

NetSocket& NetSocket::end(inox::StringView text) {
  return end(text, inox::Callback());
}

NetSocket& NetSocket::end(inox::StringView text, inox::Callback callback) {
  std::shared_ptr<NetSocketState> state = socketState(*this);

#ifdef INOX_LOOP_BACKEND_LIBUV
  if (state) state->end(text, std::move(callback));
  else throwNetError("TypeError: NetSocket.end failed");
#else
  (void)state;
  (void)text;
  (void)callback;
  throwNetError("TypeError: node:net is unsupported without libuv");
#endif

  return *this;
}

bool NetSocket::isPaused() const {
  std::shared_ptr<NetSocketState> state = socketState(*this);

#ifdef INOX_LOOP_BACKEND_LIBUV
  if (state) return state->paused_;
  throwNetError("TypeError: NetSocket.isPaused failed");
#else
  (void)state;
  throwNetError("TypeError: node:net is unsupported without libuv");
#endif

  return false;
}

inox::String NetSocket::localAddress() const {
  return address().address;
}

double NetSocket::localPort() const {
  return address().port;
}

NetSocket& NetSocket::on(inox::StringView event_name, inox::Callback listener) {
  std::shared_ptr<NetSocketState> state = socketState(*this);

#ifdef INOX_LOOP_BACKEND_LIBUV
  if (state) state->on(event_name, std::move(listener));
  else throwNetError("TypeError: NetSocket.on failed");
#else
  (void)state;
  (void)event_name;
  (void)listener;
  throwNetError("TypeError: node:net is unsupported without libuv");
#endif

  return *this;
}

NetSocket& NetSocket::pause() {
  std::shared_ptr<NetSocketState> state = socketState(*this);

#ifdef INOX_LOOP_BACKEND_LIBUV
  if (state) state->pause();
  else throwNetError("TypeError: NetSocket.pause failed");
#else
  (void)state;
  throwNetError("TypeError: node:net is unsupported without libuv");
#endif

  return *this;
}

bool NetSocket::pending() const {
  return connecting();
}

inox::String NetSocket::readyState() const {
  std::shared_ptr<NetSocketState> state = socketState(*this);

#ifdef INOX_LOOP_BACKEND_LIBUV
  if (state) return state->readyState();
  throwNetError("TypeError: NetSocket.readyState failed");
#else
  (void)state;
  throwNetError("TypeError: node:net is unsupported without libuv");
#endif

  return inox::String("closed");
}

NetSocket& NetSocket::ref() {
  std::shared_ptr<NetSocketState> state = socketState(*this);

#ifdef INOX_LOOP_BACKEND_LIBUV
  if (state) state->ref();
  else throwNetError("TypeError: NetSocket.ref failed");
#else
  (void)state;
  throwNetError("TypeError: node:net is unsupported without libuv");
#endif

  return *this;
}

NetSocket& NetSocket::resume() {
  std::shared_ptr<NetSocketState> state = socketState(*this);

#ifdef INOX_LOOP_BACKEND_LIBUV
  if (state) state->resume();
  else throwNetError("TypeError: NetSocket.resume failed");
#else
  (void)state;
  throwNetError("TypeError: node:net is unsupported without libuv");
#endif

  return *this;
}

inox::String NetSocket::remoteAddress() const {
  std::shared_ptr<NetSocketState> state = socketState(*this);

#ifdef INOX_LOOP_BACKEND_LIBUV
  if (state) return state->address(true).address;
#endif

  throwNetError("TypeError: NetSocket.remoteAddress failed");
  return inox::String("");
}

double NetSocket::remotePort() const {
  std::shared_ptr<NetSocketState> state = socketState(*this);

#ifdef INOX_LOOP_BACKEND_LIBUV
  if (state) return state->address(true).port;
#endif

  throwNetError("TypeError: NetSocket.remotePort failed");
  return 0;
}

NetSocket& NetSocket::setEncoding(inox::StringView encoding) {
  std::shared_ptr<NetSocketState> state = socketState(*this);

#ifdef INOX_LOOP_BACKEND_LIBUV
  if (state) state->setEncoding(encoding);
  else throwNetError("TypeError: NetSocket.setEncoding failed");
#else
  (void)state;
  (void)encoding;
  throwNetError("TypeError: node:net is unsupported without libuv");
#endif

  return *this;
}

NetSocket& NetSocket::setKeepAlive() {
  return setKeepAlive(false, 0);
}

NetSocket& NetSocket::setKeepAlive(bool enabled) {
  return setKeepAlive(enabled, 0);
}

NetSocket& NetSocket::setKeepAlive(bool enabled, double initial_delay) {
  std::shared_ptr<NetSocketState> state = socketState(*this);

#ifdef INOX_LOOP_BACKEND_LIBUV
  if (state) state->setKeepAlive(enabled, initial_delay);
  else throwNetError("TypeError: NetSocket.setKeepAlive failed");
#else
  (void)state;
  (void)enabled;
  (void)initial_delay;
  throwNetError("TypeError: node:net is unsupported without libuv");
#endif

  return *this;
}

NetSocket& NetSocket::setNoDelay() {
  return setNoDelay(true);
}

NetSocket& NetSocket::setNoDelay(bool enabled) {
  std::shared_ptr<NetSocketState> state = socketState(*this);

#ifdef INOX_LOOP_BACKEND_LIBUV
  if (state) state->setNoDelay(enabled);
  else throwNetError("TypeError: NetSocket.setNoDelay failed");
#else
  (void)state;
  (void)enabled;
  throwNetError("TypeError: node:net is unsupported without libuv");
#endif

  return *this;
}

NetSocket& NetSocket::setTimeout(double timeout) {
  return setTimeout(timeout, inox::Callback());
}

NetSocket& NetSocket::setTimeout(double timeout, inox::Callback callback) {
  std::shared_ptr<NetSocketState> state = socketState(*this);

#ifdef INOX_LOOP_BACKEND_LIBUV
  if (state) state->setTimeout(timeout, std::move(callback));
  else throwNetError("TypeError: NetSocket.setTimeout failed");
#else
  (void)state;
  (void)timeout;
  (void)callback;
  throwNetError("TypeError: node:net is unsupported without libuv");
#endif

  return *this;
}

NetSocket& NetSocket::unref() {
  std::shared_ptr<NetSocketState> state = socketState(*this);

#ifdef INOX_LOOP_BACKEND_LIBUV
  if (state) state->unref();
  else throwNetError("TypeError: NetSocket.unref failed");
#else
  (void)state;
  throwNetError("TypeError: node:net is unsupported without libuv");
#endif

  return *this;
}

bool NetSocket::write(inox::StringView text) {
  return write(text, inox::Callback());
}

bool NetSocket::write(inox::StringView text, inox::Callback callback) {
  std::shared_ptr<NetSocketState> state = socketState(*this);

#ifdef INOX_LOOP_BACKEND_LIBUV
  if (state) return state->write(text, std::move(callback));
  throwNetError("TypeError: NetSocket.write failed");
#else
  (void)state;
  (void)text;
  (void)callback;
  throwNetError("TypeError: node:net is unsupported without libuv");
#endif

  return false;
}

NetSocket NetModule::connect(double port) const {
  return NetSocket(materializeSocket(connectSocket(port, inox::StringView("127.0.0.1"), inox::Callback())));
}

NetSocket NetModule::connect(double port, inox::Callback callback) const {
  return NetSocket(materializeSocket(connectSocket(port, inox::StringView("127.0.0.1"), std::move(callback))));
}

NetSocket NetModule::connect(double port, inox::StringView host) const {
  return NetSocket(materializeSocket(connectSocket(port, host, inox::Callback())));
}

NetSocket NetModule::connect(double port, inox::StringView host, inox::Callback callback) const {
  return NetSocket(materializeSocket(connectSocket(port, host, std::move(callback))));
}

NetSocket NetModule::connect(const NetConnectionOptions& options) const {
  return connect(options, inox::Callback());
}

NetSocket NetModule::connect(const NetConnectionOptions& options, inox::Callback callback) const {
  if (inox::thrown() || !options.valid_ || !options.port_) {
    return NetSocket();
  }

  const inox::StringView host = options.host_
    ? inox::StringView(*options.host_)
    : inox::StringView("127.0.0.1");
  return NetSocket(materializeSocket(connectSocket(*options.port_, host, std::move(callback))));
}

NetServer NetModule::createServer() const {
  return createServer(inox::Callback());
}

NetServer NetModule::createServer(inox::Callback listener) const {
#ifdef INOX_LOOP_BACKEND_LIBUV
  return materializeServer(NetServerState::create(std::move(listener)));
#else
  (void)listener;
  throwNetError("TypeError: node:net is unsupported without libuv");
  return NetServer();
#endif
}

const NetModule net;
