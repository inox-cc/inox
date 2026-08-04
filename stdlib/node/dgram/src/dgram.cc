#include "inox/dgram.h"

#include <array>
#include <cmath>
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
#include "inox/object.h"

#ifdef INOX_LOOP_BACKEND_LIBUV
#include "loop-libuv-internal.h"
#endif

namespace {

void throwDgramError(const char* message) {
  inox::throw_value(inox::String(message == nullptr ? "dgram operation failed" : message));
}

#ifdef INOX_LOOP_BACKEND_LIBUV
void throwDgramUvError(const char* operation, int status) {
  inox::throw_value(inox::String::fromFormat(
    "TypeError: %s failed: %s",
    operation == nullptr ? "dgram operation" : operation,
    uv_strerror(status)
  ));
}
#endif

bool hasText(inox::StringView value, const char* expected) {
  const std::size_t length = std::strlen(expected);
  return value.len == length && std::memcmp(value.bytes, expected, length) == 0;
}

bool containsNull(inox::StringView value) {
  return value.len > 0 && std::memchr(value.bytes, 0, value.len) != nullptr;
}

bool checkedInteger(double value, int minimum, int maximum, int& out, const char* message) {
  if (!std::isfinite(value) || std::floor(value) != value || value < minimum || value > maximum) {
    throwDgramError(message);
    return false;
  }

  out = static_cast<int>(value);
  return true;
}

bool readObjectField(const inox::Value& object, const char* name, inox::Value& out, bool& present) {
  const inox_value raw = object.raw();

  if (raw.tag != INOX_TAG_OBJECT && raw.tag != INOX_TAG_CLASS_INSTANCE) {
    throwDgramError("TypeError: dgram options must be an object");
    return false;
  }

  const inox_status status = inox_object_get(raw, name, std::strlen(name), out.out());

  if (status == INOX_ERR_FIELD) {
    present = false;
    return true;
  }

  if (status != INOX_OK) {
    throwDgramError("TypeError: dgram option read failed");
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
    throwDgramError("TypeError: dgram numeric option is invalid");
    return false;
  }

  out = field.as.number;
  return true;
}

inox::Value materializeRemoteInfo(const DgramRemoteInfo& info) {
  static const inox_field_info fields[] = {
    {"address", INOX_FIELD_READONLY},
    {"family", INOX_FIELD_READONLY},
    {"port", INOX_FIELD_READONLY},
    {"size", INOX_FIELD_READONLY},
  };
  static const inox_shape shape = {4, fields};

  inox::ObjectValue object = inox::ObjectValue::create(&shape);

  if (!object.valid() || inox::thrown()) {
    return inox::Value();
  }

  object.init(0, info.address.raw());
  object.init(1, info.family.raw());
  object.init(2, inox_number_value(info.port));
  object.init(3, inox_number_value(info.size));

  if (inox::thrown()) {
    return inox::Value();
  }

  return object;
}

inox::Value materializeDgramError(inox::StringView message) {
  static const inox_field_info fields[] = {
    {"message", INOX_FIELD_READONLY},
  };
  static const inox_shape shape = {1, fields};

  inox::ObjectValue object = inox::ObjectValue::create(&shape);

  if (!object.valid() || inox::thrown()) {
    return inox::Value();
  }

  inox::String error_message(message.len == 0 ? inox::StringView("dgram operation failed") : message);
  object.init(0, error_message.raw());

  if (inox::thrown()) {
    return inox::Value();
  }

  return object;
}

} // namespace

DgramSocketOptions::DgramSocketOptions()
  : valid_(true), type_("udp4"), reuse_addr_(false), recv_buffer_size_(), send_buffer_size_() {}

DgramSocketOptions::DgramSocketOptions(const inox::Value& value)
  : valid_(false), type_(""), reuse_addr_(false), recv_buffer_size_(), send_buffer_size_() {
  inox::Value type;
  bool present = false;

  if (!readObjectField(value, "type", type, present) || !present || type.tag != INOX_TAG_STRING) {
    if (!inox::thrown()) {
      throwDgramError("TypeError: dgram socket options require a string type");
    }
    return;
  }

  type_ = inox::String(std::move(type));

  if (!hasText(type_, "udp4")) {
    throwDgramError("TypeError: node:dgram currently supports only udp4");
    return;
  }

  inox::Value reuse;
  present = false;

  if (!readObjectField(value, "reuseAddr", reuse, present)) {
    return;
  }

  if (present && reuse.tag != INOX_TAG_UNDEFINED) {
    if (reuse.tag != INOX_TAG_BOOL) {
      throwDgramError("TypeError: dgram reuseAddr must be boolean");
      return;
    }

    reuse_addr_ = reuse.as.boolean;
  }

  if (!readOptionalNumber(value, "recvBufferSize", recv_buffer_size_, 1, std::numeric_limits<int>::max()) ||
      !readOptionalNumber(value, "sendBufferSize", send_buffer_size_, 1, std::numeric_limits<int>::max())) {
    return;
  }

  valid_ = true;
}

DgramBindOptions::DgramBindOptions() : valid_(true), port_(), address_() {}

DgramBindOptions::DgramBindOptions(const inox::Value& value) : valid_(false), port_(), address_() {
  if (!readOptionalNumber(value, "port", port_, 0, 65535)) {
    return;
  }

  inox::Value address;
  bool present = false;

  if (!readObjectField(value, "address", address, present)) {
    return;
  }

  if (present && address.tag != INOX_TAG_UNDEFINED) {
    if (address.tag != INOX_TAG_STRING) {
      throwDgramError("TypeError: dgram bind address must be a string");
      return;
    }

    address_ = inox::String(std::move(address));
  }

  valid_ = true;
}

class DgramSocket::Impl : public std::enable_shared_from_this<DgramSocket::Impl> {
public:
  static std::shared_ptr<Impl> create(
    inox::StringView type,
    bool reuse_addr,
    const std::optional<double>& recv_buffer_size,
    const std::optional<double>& send_buffer_size,
    inox::Callback listener
  );

  Impl();
  ~Impl();

  DgramAddress address(bool remote) const;
  void bind(double port, inox::StringView address, inox::Callback callback);
  void close(inox::Callback callback);
  void connect(double port, inox::StringView address, inox::Callback callback);
  void disconnect();
  void membership(inox::StringView multicast_address, inox::StringView multicast_interface, bool join);
  double getBufferSize(bool receive) const;
  double getSendQueueCount() const;
  double getSendQueueSize() const;
  void on(inox::StringView event_name, inox::Callback listener);
  void ref();
  void send(std::span<const std::uint8_t> message, const double* port, inox::StringView address, inox::Callback callback);
  void setBroadcast(bool enabled);
  void setBufferSize(bool receive, double size);
  void setMulticastInterface(inox::StringView multicast_interface);
  void setMulticastLoopback(bool enabled);
  void setMulticastTTL(double ttl);
  void setTTL(double ttl);
  void unref();

private:
#ifdef INOX_LOOP_BACKEND_LIBUV
  struct ImmediateRequest;
  struct SendRequest;

  inox_loop* loop_;
  uv_udp_t handle_;
  std::vector<inox::Callback> message_listeners_;
  std::vector<inox::Callback> listening_listeners_;
  std::vector<inox::Callback> connect_listeners_;
  std::vector<inox::Callback> error_listeners_;
  std::vector<inox::Callback> close_callbacks_;
  std::shared_ptr<Impl> native_owner_;
  bool initialized_;
  bool closing_;
  bool closed_;
  bool receiving_;
  bool referenced_;
  bool reuse_addr_;

  bool startReceiving();
  void emitError(const char* operation, int status);
  bool resolveAddress(inox::StringView address, double port, bool bind_address, sockaddr_in& out) const;
  void queueCallback(inox::Callback callback);
  void closeFromLoop();
  static inox_status runImmediate(void* context);
  static void finalizeImmediate(void* context);
  static void allocReceiveBuffer(uv_handle_t* handle, std::size_t suggested_size, uv_buf_t* buffer);
  static void receiveDatagram(
    uv_udp_t* handle,
    ssize_t size,
    const uv_buf_t* buffer,
    const sockaddr* address,
    unsigned flags
  );
  static void completeSend(uv_udp_send_t* request, int status);
  static void dgram_close_cb(uv_handle_t* handle);
  static void closeExternalHandle(void* context);
#endif
};

namespace {

struct DgramSocketHolder {
  std::shared_ptr<DgramSocket::Impl> impl;
};

inox_status copyDgramSocketHolder(inox_allocator* allocator, const void* instance, void** out) {
  if (allocator == nullptr || allocator->alloc == nullptr || instance == nullptr || out == nullptr) {
    return INOX_ERR_TYPE;
  }

  void* memory = allocator->alloc(allocator->user, sizeof(DgramSocketHolder), alignof(DgramSocketHolder));

  if (memory == nullptr) {
    *out = nullptr;
    return INOX_ERR_OOM;
  }

  try {
    *out = new (memory) DgramSocketHolder(*static_cast<const DgramSocketHolder*>(instance));
  } catch (const std::bad_alloc&) {
    allocator->free(allocator->user, memory, sizeof(DgramSocketHolder), alignof(DgramSocketHolder));
    *out = nullptr;
    return INOX_ERR_OOM;
  }

  return INOX_OK;
}

void destroyDgramSocketHolder(inox_allocator* allocator, void* instance) {
  if (allocator == nullptr || allocator->free == nullptr || instance == nullptr) {
    return;
  }

  static_cast<DgramSocketHolder*>(instance)->~DgramSocketHolder();
  allocator->free(allocator->user, instance, sizeof(DgramSocketHolder), alignof(DgramSocketHolder));
}

inox_status readDgramSocketField(const void* instance, std::uint32_t index, inox_value* out) {
  (void)instance;
  (void)index;
  (void)out;
  return INOX_ERR_FIELD;
}

const inox_class_descriptor dgramSocketDescriptor = {
  "Socket",
  0,
  nullptr,
  readDgramSocketField,
  copyDgramSocketHolder,
  destroyDgramSocketHolder,
};

DgramSocket materializeDgramSocket(const std::shared_ptr<DgramSocket::Impl>& impl) {
  if (!impl) {
    return DgramSocket();
  }

  const DgramSocketHolder holder = {impl};
  inox_value value = inox_undefined_value();
  const inox_status status = inox_class_instance_ref_copy(
    &inox_default_allocator,
    &dgramSocketDescriptor,
    &holder,
    &value
  );

  if (status != INOX_OK) {
    throwDgramError("TypeError: DgramSocket materialization failed");
    return DgramSocket();
  }

  return DgramSocket(inox::adopt(value));
}

std::shared_ptr<DgramSocket::Impl> dgramSocketImpl(const DgramSocket& socket) {
  const inox_value raw = socket.raw();

  if (raw.tag != INOX_TAG_CLASS_INSTANCE || raw.as.ref == nullptr) {
    return {};
  }

  const auto* ref = reinterpret_cast<const inox_class_instance_ref*>(raw.as.ref);

  if (ref->descriptor != &dgramSocketDescriptor || ref->instance == nullptr) {
    return {};
  }

  return static_cast<const DgramSocketHolder*>(ref->instance)->impl;
}

} // namespace

#ifdef INOX_LOOP_BACKEND_LIBUV

struct DgramSocket::Impl::ImmediateRequest {
  std::shared_ptr<Impl> socket;
  inox::Callback callback;
};

struct DgramSocket::Impl::SendRequest {
  uv_udp_send_t request;
  std::shared_ptr<Impl> socket;
  std::vector<std::uint8_t> bytes;
  inox::Callback callback;

  SendRequest(std::shared_ptr<Impl> socket_value, std::span<const std::uint8_t> message, inox::Callback callback_value)
    : request(), socket(std::move(socket_value)), bytes(message.begin(), message.end()), callback(std::move(callback_value)) {}
};

DgramSocket::Impl::Impl()
  : loop_(nullptr),
    handle_(),
    message_listeners_(),
    listening_listeners_(),
    connect_listeners_(),
    error_listeners_(),
    close_callbacks_(),
    native_owner_(),
    initialized_(false),
    closing_(false),
    closed_(false),
    receiving_(false),
    referenced_(true),
    reuse_addr_(false) {}

DgramSocket::Impl::~Impl() {}

std::shared_ptr<DgramSocket::Impl> DgramSocket::Impl::create(
  inox::StringView type,
  bool reuse_addr,
  const std::optional<double>& recv_buffer_size,
  const std::optional<double>& send_buffer_size,
  inox::Callback listener
) {
  if (!hasText(type, "udp4")) {
    throwDgramError("TypeError: node:dgram currently supports only udp4");
    return {};
  }

  inox_loop* loop = inox::loop();
  uv_loop_t* uv_loop = loop == nullptr ? nullptr : inox_libuv_loop_handle(loop);

  if (loop == nullptr || uv_loop == nullptr) {
    throwDgramError("TypeError: DgramSocket.create failed");
    return {};
  }

  std::shared_ptr<Impl> socket;

  try {
    socket = std::shared_ptr<Impl>(new (std::nothrow) Impl());
  } catch (const std::bad_alloc&) {
    throwDgramError("TypeError: DgramSocket allocation failed");
    return {};
  }

  if (!socket) {
    throwDgramError("TypeError: DgramSocket allocation failed");
    return {};
  }

  socket->loop_ = loop;
  socket->reuse_addr_ = reuse_addr;

  if (listener.valid()) {
    try {
      socket->message_listeners_.push_back(std::move(listener));
    } catch (const std::bad_alloc&) {
      throwDgramError("TypeError: DgramSocket listener allocation failed");
      return {};
    }
  }

  const int init_status = uv_udp_init(uv_loop, &socket->handle_);

  if (init_status != 0) {
    throwDgramUvError("DgramSocket.create", init_status);
    return {};
  }

  socket->initialized_ = true;
  socket->handle_.data = socket.get();

  if (inox_libuv_loop_register_external_handle(loop, socket.get(), closeExternalHandle) != INOX_OK) {
    uv_close(reinterpret_cast<uv_handle_t*>(&socket->handle_), nullptr);
    uv_run(uv_loop, UV_RUN_NOWAIT);
    socket->initialized_ = false;
    throwDgramError("TypeError: DgramSocket.create failed");
    return {};
  }

  socket->native_owner_ = socket;

  if (recv_buffer_size) {
    socket->setBufferSize(true, *recv_buffer_size);
  }

  if (!inox::thrown() && send_buffer_size) {
    socket->setBufferSize(false, *send_buffer_size);
  }

  if (inox::thrown()) {
    socket->close(inox::Callback());
  }

  return socket;
}

bool DgramSocket::Impl::resolveAddress(
  inox::StringView address,
  double port,
  bool bind_address,
  sockaddr_in& out
) const {
  int port_value = 0;

  if (!checkedInteger(port, 0, 65535, port_value, "TypeError: dgram port is invalid")) {
    return false;
  }

  const char* fallback = bind_address ? "0.0.0.0" : "127.0.0.1";
  std::string host;

  try {
    host.assign(
      address.len == 0 ? fallback : address.bytes,
      address.len == 0 ? std::strlen(fallback) : address.len
    );
  } catch (const std::bad_alloc&) {
    throwDgramError("TypeError: dgram address allocation failed");
    return false;
  }

  const int address_status = uv_ip4_addr(host.c_str(), port_value, &out);

  if (address_status != 0) {
    throwDgramUvError("dgram IPv4 address", address_status);
    return false;
  }

  return true;
}

DgramAddress DgramSocket::Impl::address(bool remote) const {
  DgramAddress result = {inox::String(""), inox::String(""), 0};

  if (!initialized_ || closing_ || closed_) {
    throwDgramError("TypeError: DgramSocket.address failed");
    return result;
  }

  sockaddr_storage raw_address = {};
  int length = sizeof(raw_address);
  const int status = remote
    ? uv_udp_getpeername(&handle_, reinterpret_cast<sockaddr*>(&raw_address), &length)
    : uv_udp_getsockname(&handle_, reinterpret_cast<sockaddr*>(&raw_address), &length);

  if (status != 0 || raw_address.ss_family != AF_INET) {
    if (status != 0) {
      throwDgramUvError(remote ? "DgramSocket.remoteAddress" : "DgramSocket.address", status);
    } else {
      throwDgramError("TypeError: DgramSocket.address failed: unsupported address family");
    }
    return result;
  }

  char host[INET_ADDRSTRLEN] = {};
  const sockaddr_in* address = reinterpret_cast<const sockaddr_in*>(&raw_address);

  const int name_status = uv_ip4_name(address, host, sizeof(host));

  if (name_status != 0) {
    throwDgramUvError("DgramSocket.address", name_status);
    return result;
  }

  result.address = inox::String(host);
  result.family = inox::String("IPv4");
  result.port = ntohs(address->sin_port);
  return result;
}

bool DgramSocket::Impl::startReceiving() {
  if (receiving_) {
    return true;
  }

  const int receive_status = uv_udp_recv_start(&handle_, allocReceiveBuffer, receiveDatagram);

  if (receive_status != 0) {
    throwDgramUvError("DgramSocket receive start", receive_status);
    return false;
  }

  receiving_ = true;
  return true;
}

void DgramSocket::Impl::bind(double port, inox::StringView address, inox::Callback callback) {
  if (!initialized_ || closing_ || closed_) {
    throwDgramError("TypeError: DgramSocket.bind failed");
    return;
  }

  sockaddr_in socket_address = {};

  if (!resolveAddress(address, port, true, socket_address)) {
    return;
  }

  const unsigned flags = reuse_addr_ ? UV_UDP_REUSEADDR : 0;

  const int bind_status = uv_udp_bind(&handle_, reinterpret_cast<const sockaddr*>(&socket_address), flags);

  if (bind_status != 0) {
    throwDgramUvError("DgramSocket.bind", bind_status);
    return;
  }

  if (!startReceiving()) {
    return;
  }

  for (const inox::Callback& listener : listening_listeners_) {
    queueCallback(listener);

    if (inox::thrown()) {
      return;
    }
  }

  queueCallback(std::move(callback));
}

void DgramSocket::Impl::connect(double port, inox::StringView address, inox::Callback callback) {
  if (!initialized_ || closing_ || closed_) {
    throwDgramError("TypeError: DgramSocket.connect failed");
    return;
  }

  sockaddr_in socket_address = {};

  if (!resolveAddress(address, port, false, socket_address)) {
    return;
  }

  const int connect_status = uv_udp_connect(&handle_, reinterpret_cast<const sockaddr*>(&socket_address));

  if (connect_status != 0) {
    throwDgramUvError("DgramSocket.connect", connect_status);
    return;
  }

  if (!startReceiving()) {
    return;
  }

  for (const inox::Callback& listener : connect_listeners_) {
    queueCallback(listener);

    if (inox::thrown()) {
      return;
    }
  }

  queueCallback(std::move(callback));
}

void DgramSocket::Impl::disconnect() {
  if (!initialized_ || closing_ || closed_) {
    throwDgramError("TypeError: DgramSocket.disconnect failed");
    return;
  }

  const int status = uv_udp_connect(&handle_, nullptr);

  if (status != 0) {
    throwDgramUvError("DgramSocket.disconnect", status);
  }
}

void DgramSocket::Impl::on(inox::StringView event_name, inox::Callback listener) {
  if (!initialized_ || closing_ || closed_ || !listener.valid()) {
    throwDgramError("TypeError: DgramSocket.on requires a callable listener");
    return;
  }

  std::vector<inox::Callback>* listeners = nullptr;

  if (hasText(event_name, "message")) listeners = &message_listeners_;
  else if (hasText(event_name, "listening")) listeners = &listening_listeners_;
  else if (hasText(event_name, "connect")) listeners = &connect_listeners_;
  else if (hasText(event_name, "error")) listeners = &error_listeners_;
  else if (hasText(event_name, "close")) listeners = &close_callbacks_;
  else {
    throwDgramError("TypeError: unsupported DgramSocket event");
    return;
  }

  try {
    listeners->push_back(std::move(listener));
  } catch (const std::bad_alloc&) {
    throwDgramError("TypeError: DgramSocket listener allocation failed");
  }
}

void DgramSocket::Impl::emitError(const char* operation, int status) {
  if (error_listeners_.empty()) {
    inox_libuv_loop_report_status(loop_, INOX_ERR_FIELD);
    return;
  }

  inox::String message = inox::String::fromFormat(
    "%s failed: %s",
    operation == nullptr ? "dgram operation" : operation,
    uv_strerror(status)
  );
  inox::Value error = materializeDgramError(message);

  if (inox::thrown()) {
    inox_libuv_loop_report_status(loop_, INOX_ERR_OOM);
    return;
  }

  std::vector<inox::Callback> listeners;

  try {
    listeners = error_listeners_;
  } catch (const std::bad_alloc&) {
    inox_libuv_loop_report_status(loop_, INOX_ERR_OOM);
    return;
  }

  const std::array<inox::Value, 1> arguments = {error};

  for (const inox::Callback& listener : listeners) {
    inox::Value result = listener.call(std::span<const inox::Value>(arguments));
    (void)result;

    if (inox::thrown()) {
      inox_libuv_loop_report_status(loop_, INOX_ERR_THROW);
      return;
    }
  }
}

void DgramSocket::Impl::send(
  std::span<const std::uint8_t> message,
  const double* port,
  inox::StringView address,
  inox::Callback callback
) {
  if (!initialized_ || closing_ || closed_ || message.size() > std::numeric_limits<unsigned int>::max()) {
    throwDgramError("TypeError: DgramSocket.send failed");
    return;
  }

  sockaddr_in socket_address = {};
  const sockaddr* destination = nullptr;

  if (port != nullptr) {
    if (!resolveAddress(address, *port, false, socket_address)) {
      return;
    }

    destination = reinterpret_cast<const sockaddr*>(&socket_address);
  }

  SendRequest* send = nullptr;

  try {
    send = new (std::nothrow) SendRequest(shared_from_this(), message, std::move(callback));
  } catch (const std::bad_alloc&) {
    throwDgramError("TypeError: DgramSocket send allocation failed");
    return;
  }

  if (send == nullptr) {
    throwDgramError("TypeError: DgramSocket send allocation failed");
    return;
  }

  if (inox_libuv_loop_retain_request(loop_) != INOX_OK) {
    delete send;
    throwDgramError("TypeError: DgramSocket.send failed");
    return;
  }

  char* bytes = send->bytes.empty() ? nullptr : reinterpret_cast<char*>(send->bytes.data());
  uv_buf_t buffer = uv_buf_init(bytes, static_cast<unsigned int>(send->bytes.size()));
  send->request.data = send;
  uv_udp_send_cb completion = completeSend;

  const int send_status = uv_udp_send(&send->request, &handle_, &buffer, 1, destination, completion);

  if (send_status != 0) {
    inox_libuv_loop_release_request(loop_);
    delete send;
    throwDgramUvError("DgramSocket.send", send_status);
    return;
  }

  if (!startReceiving()) {
    return;
  }
}

void DgramSocket::Impl::completeSend(uv_udp_send_t* request, int status) {
  SendRequest* send = request == nullptr ? nullptr : static_cast<SendRequest*>(request->data);

  if (send == nullptr) {
    return;
  }

  std::shared_ptr<Impl> socket = send->socket;
  inox::Callback callback = send->callback;
  const double bytes = status == 0 ? static_cast<double>(send->bytes.size()) : 0;
  delete send;

  if (status != 0 && !callback.valid()) {
    socket->emitError("DgramSocket.send", status);
  }

  if (callback.valid()) {
    inox::Value error = status == 0
      ? inox::Value(inox_null_value())
      : materializeDgramError(inox::StringView(uv_strerror(status)));

    if (inox::thrown()) {
      inox_libuv_loop_report_status(socket->loop_, INOX_ERR_TYPE);
      inox_libuv_loop_release_request(socket->loop_);
      return;
    }

    std::array<inox::Value, 2> arguments = {error, inox::Value(inox_number_value(bytes))};
    inox::Value result = callback.call(std::span<const inox::Value>(arguments));
    (void)result;

    if (inox::thrown()) {
      inox_libuv_loop_report_status(socket->loop_, INOX_ERR_THROW);
    }
  }

  inox_libuv_loop_release_request(socket->loop_);
}

void DgramSocket::Impl::membership(
  inox::StringView multicast_address,
  inox::StringView multicast_interface,
  bool join
) {
  if (!initialized_ || closing_ || closed_ || multicast_address.len == 0 ||
      containsNull(multicast_address) || containsNull(multicast_interface)) {
    throwDgramError("TypeError: DgramSocket membership operation failed");
    return;
  }

  std::string group;
  std::string interface_address;

  try {
    group.assign(multicast_address.bytes, multicast_address.len);
    interface_address.assign(multicast_interface.bytes, multicast_interface.len);
  } catch (const std::bad_alloc&) {
    throwDgramError("TypeError: DgramSocket membership allocation failed");
    return;
  }

  const int status = uv_udp_set_membership(
    &handle_,
    group.c_str(),
    interface_address.empty() ? nullptr : interface_address.c_str(),
    join ? UV_JOIN_GROUP : UV_LEAVE_GROUP
  );

  if (status != 0) {
    throwDgramUvError(join ? "DgramSocket.addMembership" : "DgramSocket.dropMembership", status);
  }
}

double DgramSocket::Impl::getSendQueueCount() const {
  if (!initialized_ || closing_ || closed_) {
    throwDgramError("TypeError: DgramSocket.getSendQueueCount failed");
    return 0;
  }

  return static_cast<double>(uv_udp_get_send_queue_count(&handle_));
}

double DgramSocket::Impl::getSendQueueSize() const {
  if (!initialized_ || closing_ || closed_) {
    throwDgramError("TypeError: DgramSocket.getSendQueueSize failed");
    return 0;
  }

  return static_cast<double>(uv_udp_get_send_queue_size(&handle_));
}

void DgramSocket::Impl::setBroadcast(bool enabled) {
  if (!initialized_ || closing_ || closed_) {
    throwDgramError("TypeError: DgramSocket.setBroadcast failed");
    return;
  }

  const int status = uv_udp_set_broadcast(&handle_, enabled ? 1 : 0);

  if (status != 0) {
    throwDgramUvError("DgramSocket.setBroadcast", status);
  }
}

void DgramSocket::Impl::setMulticastInterface(inox::StringView multicast_interface) {
  if (!initialized_ || closing_ || closed_ || multicast_interface.len == 0 ||
      containsNull(multicast_interface)) {
    throwDgramError("TypeError: DgramSocket.setMulticastInterface failed");
    return;
  }

  std::string interface_address;

  try {
    interface_address.assign(multicast_interface.bytes, multicast_interface.len);
  } catch (const std::bad_alloc&) {
    throwDgramError("TypeError: DgramSocket multicast interface allocation failed");
    return;
  }

  const int status = uv_udp_set_multicast_interface(&handle_, interface_address.c_str());

  if (status != 0) {
    throwDgramUvError("DgramSocket.setMulticastInterface", status);
  }
}

void DgramSocket::Impl::setMulticastLoopback(bool enabled) {
  if (!initialized_ || closing_ || closed_) {
    throwDgramError("TypeError: DgramSocket.setMulticastLoopback failed");
    return;
  }

  const int status = uv_udp_set_multicast_loop(&handle_, enabled ? 1 : 0);

  if (status != 0) {
    throwDgramUvError("DgramSocket.setMulticastLoopback", status);
  }
}

void DgramSocket::Impl::setMulticastTTL(double ttl) {
  int value = 0;

  if (!initialized_ || closing_ || closed_ ||
      !checkedInteger(ttl, 0, 255, value, "TypeError: DgramSocket.setMulticastTTL failed")) {
    if (!inox::thrown()) {
      throwDgramError("TypeError: DgramSocket.setMulticastTTL failed");
    }
    return;
  }

  const int status = uv_udp_set_multicast_ttl(&handle_, value);

  if (status != 0) {
    throwDgramUvError("DgramSocket.setMulticastTTL", status);
  }
}

void DgramSocket::Impl::setTTL(double ttl) {
  int value = 0;

  if (!initialized_ || closing_ || closed_ ||
      !checkedInteger(ttl, 1, 255, value, "TypeError: DgramSocket.setTTL failed")) {
    if (!inox::thrown()) {
      throwDgramError("TypeError: DgramSocket.setTTL failed");
    }
    return;
  }

  const int status = uv_udp_set_ttl(&handle_, value);

  if (status != 0) {
    throwDgramUvError("DgramSocket.setTTL", status);
  }
}

double DgramSocket::Impl::getBufferSize(bool receive) const {
  if (!initialized_ || closing_ || closed_) {
    throwDgramError("TypeError: DgramSocket.getBufferSize failed");
    return 0;
  }

  int size = 0;
  const int status = receive
    ? uv_recv_buffer_size(reinterpret_cast<uv_handle_t*>(const_cast<uv_udp_t*>(&handle_)), &size)
    : uv_send_buffer_size(reinterpret_cast<uv_handle_t*>(const_cast<uv_udp_t*>(&handle_)), &size);

  if (status != 0) {
    throwDgramUvError("DgramSocket.getBufferSize", status);
    return 0;
  }

  return size;
}

void DgramSocket::Impl::setBufferSize(bool receive, double size) {
  int value = 0;

  if (!initialized_ || closing_ || closed_ ||
      !checkedInteger(size, 1, std::numeric_limits<int>::max(), value, "TypeError: DgramSocket.setBufferSize failed")) {
    if (!inox::thrown()) {
      throwDgramError("TypeError: DgramSocket.setBufferSize failed");
    }
    return;
  }

  const int status = receive ? uv_recv_buffer_size(reinterpret_cast<uv_handle_t*>(&handle_), &value)
                             : uv_send_buffer_size(reinterpret_cast<uv_handle_t*>(&handle_), &value);

  if (status != 0) {
    throwDgramUvError("DgramSocket.setBufferSize", status);
  }
}

void DgramSocket::Impl::ref() {
  if (!initialized_ || closing_ || closed_) {
    throwDgramError("TypeError: DgramSocket.ref failed");
    return;
  }

  if (!referenced_) {
    uv_ref(reinterpret_cast<uv_handle_t*>(&handle_));
    referenced_ = true;
  }
}

void DgramSocket::Impl::unref() {
  if (!initialized_ || closing_ || closed_) {
    throwDgramError("TypeError: DgramSocket.unref failed");
    return;
  }

  if (referenced_) {
    uv_unref(reinterpret_cast<uv_handle_t*>(&handle_));
    referenced_ = false;
  }
}

void DgramSocket::Impl::queueCallback(inox::Callback callback) {
  if (!callback.valid()) {
    return;
  }

  ImmediateRequest* request = new (std::nothrow) ImmediateRequest{shared_from_this(), std::move(callback)};

  if (request == nullptr) {
    throwDgramError("TypeError: dgram callback allocation failed");
    return;
  }

  if (inox_loop_queue_immediate(loop_, runImmediate, request, finalizeImmediate, nullptr) != INOX_OK) {
    delete request;
    throwDgramError("TypeError: dgram callback queue failed");
  }
}

inox_status DgramSocket::Impl::runImmediate(void* context) {
  ImmediateRequest* request = static_cast<ImmediateRequest*>(context);

  if (request == nullptr || !request->callback.valid()) {
    return INOX_OK;
  }

  inox::Value result = request->callback.call();
  (void)result;
  return inox::thrown() ? INOX_ERR_THROW : INOX_OK;
}

void DgramSocket::Impl::finalizeImmediate(void* context) {
  delete static_cast<ImmediateRequest*>(context);
}

void DgramSocket::Impl::allocReceiveBuffer(uv_handle_t* handle, std::size_t suggested_size, uv_buf_t* buffer) {
  (void)handle;
  const std::size_t size = suggested_size == 0 ? 65536 : suggested_size;
  char* bytes = new (std::nothrow) char[size];
  *buffer = uv_buf_init(bytes, bytes == nullptr ? 0 : static_cast<unsigned int>(size));
}

void DgramSocket::Impl::receiveDatagram(
  uv_udp_t* handle,
  ssize_t size,
  const uv_buf_t* buffer,
  const sockaddr* address,
  unsigned flags
) {
  (void)flags;
  Impl* socket = handle == nullptr ? nullptr : static_cast<Impl*>(handle->data);

  if (socket == nullptr) {
    delete[] (buffer == nullptr ? nullptr : buffer->base);
    return;
  }

  if (size < 0) {
    socket->emitError("DgramSocket.receive", static_cast<int>(size));
  } else if (address != nullptr && !socket->message_listeners_.empty()) {
    std::vector<inox::Callback> listeners;

    try {
      listeners = socket->message_listeners_;
    } catch (const std::bad_alloc&) {
      inox_libuv_loop_report_status(socket->loop_, INOX_ERR_OOM);
      delete[] (buffer == nullptr ? nullptr : buffer->base);
      return;
    }

    DgramRemoteInfo info = {DgramAddress{inox::String(""), inox::String(""), 0}, static_cast<double>(size)};

    if (address->sa_family == AF_INET) {
      char host[INET_ADDRSTRLEN] = {};
      const sockaddr_in* ipv4 = reinterpret_cast<const sockaddr_in*>(address);

      if (uv_ip4_name(ipv4, host, sizeof(host)) == 0) {
        info.address = inox::String(host);
        info.family = inox::String("IPv4");
        info.port = ntohs(ipv4->sin_port);
      }
    }

    const std::uint8_t* begin = reinterpret_cast<const std::uint8_t*>(buffer->base);
    Buffer message(std::span<const std::uint8_t>(begin, static_cast<std::size_t>(size)));
    inox::Value remote = materializeRemoteInfo(info);

    if (message.valid() && !inox::thrown()) {
      std::array<inox::Value, 2> arguments = {message, remote};

      for (const inox::Callback& listener : listeners) {
        inox::Value result = listener.call(std::span<const inox::Value>(arguments));
        (void)result;

        if (inox::thrown()) {
          inox_libuv_loop_report_status(socket->loop_, INOX_ERR_THROW);
          break;
        }
      }
    } else {
      inox_libuv_loop_report_status(socket->loop_, INOX_ERR_TYPE);
    }
  }

  delete[] (buffer == nullptr ? nullptr : buffer->base);
}

void DgramSocket::Impl::close(inox::Callback callback) {
  if (closed_) {
    queueCallback(std::move(callback));
    return;
  }

  if (callback.valid()) {
    try {
      close_callbacks_.push_back(std::move(callback));
    } catch (const std::bad_alloc&) {
      throwDgramError("TypeError: DgramSocket close callback allocation failed");
      return;
    }
  }

  if (!initialized_ || closing_) {
    return;
  }

  closing_ = true;

  if (receiving_) {
    uv_udp_recv_stop(&handle_);
    receiving_ = false;
  }

  uv_close(reinterpret_cast<uv_handle_t*>(&handle_), dgram_close_cb);
}

void DgramSocket::Impl::closeFromLoop() {
  close(inox::Callback());
}

void DgramSocket::Impl::closeExternalHandle(void* context) {
  Impl* socket = static_cast<Impl*>(context);

  if (socket != nullptr) {
    socket->close_callbacks_.clear();
    socket->message_listeners_.clear();
    socket->listening_listeners_.clear();
    socket->connect_listeners_.clear();
    socket->error_listeners_.clear();
    socket->closeFromLoop();
  }
}

void DgramSocket::Impl::dgram_close_cb(uv_handle_t* handle) {
  Impl* socket = handle == nullptr ? nullptr : static_cast<Impl*>(handle->data);

  if (socket == nullptr) {
    return;
  }

  std::shared_ptr<Impl> owner = socket->native_owner_;
  socket->closed_ = true;
  socket->initialized_ = false;
  inox_libuv_loop_unregister_external_handle(socket->loop_, socket);
  std::vector<inox::Callback> callbacks = std::move(socket->close_callbacks_);
  socket->message_listeners_.clear();
  socket->listening_listeners_.clear();
  socket->connect_listeners_.clear();
  socket->error_listeners_.clear();

  for (const inox::Callback& callback : callbacks) {
    inox::Value result = callback.call();
    (void)result;

    if (inox::thrown()) {
      inox_libuv_loop_report_status(socket->loop_, INOX_ERR_THROW);
      break;
    }
  }

  socket->native_owner_.reset();
}

#else

DgramSocket::Impl::Impl() {}
DgramSocket::Impl::~Impl() {}

std::shared_ptr<DgramSocket::Impl> DgramSocket::Impl::create(
  inox::StringView type,
  bool reuse_addr,
  const std::optional<double>& recv_buffer_size,
  const std::optional<double>& send_buffer_size,
  inox::Callback listener
) {
  (void)type;
  (void)reuse_addr;
  (void)recv_buffer_size;
  (void)send_buffer_size;
  (void)listener;
  throwDgramError("TypeError: node:dgram is unsupported without libuv");
  return {};
}

DgramAddress DgramSocket::Impl::address(bool remote) const {
  (void)remote;
  throwDgramError("TypeError: node:dgram is unsupported without libuv");
  return {inox::String(""), inox::String(""), 0};
}

void DgramSocket::Impl::bind(double port, inox::StringView address, inox::Callback callback) {
  (void)port;
  (void)address;
  (void)callback;
  throwDgramError("TypeError: node:dgram is unsupported without libuv");
}

void DgramSocket::Impl::close(inox::Callback callback) { (void)callback; }

void DgramSocket::Impl::connect(double port, inox::StringView address, inox::Callback callback) {
  (void)port;
  (void)address;
  (void)callback;
  throwDgramError("TypeError: node:dgram is unsupported without libuv");
}

void DgramSocket::Impl::disconnect() { throwDgramError("TypeError: node:dgram is unsupported without libuv"); }
void DgramSocket::Impl::membership(
  inox::StringView multicast_address,
  inox::StringView multicast_interface,
  bool join
) {
  (void)multicast_address;
  (void)multicast_interface;
  (void)join;
  throwDgramError("TypeError: node:dgram is unsupported without libuv");
}
double DgramSocket::Impl::getBufferSize(bool receive) const {
  (void)receive;
  throwDgramError("TypeError: node:dgram is unsupported without libuv");
  return 0;
}
double DgramSocket::Impl::getSendQueueCount() const {
  throwDgramError("TypeError: node:dgram is unsupported without libuv");
  return 0;
}
double DgramSocket::Impl::getSendQueueSize() const {
  throwDgramError("TypeError: node:dgram is unsupported without libuv");
  return 0;
}
void DgramSocket::Impl::on(inox::StringView event_name, inox::Callback listener) {
  (void)event_name;
  (void)listener;
  throwDgramError("TypeError: node:dgram is unsupported without libuv");
}
void DgramSocket::Impl::ref() { throwDgramError("TypeError: node:dgram is unsupported without libuv"); }
void DgramSocket::Impl::send(
  std::span<const std::uint8_t> message,
  const double* port,
  inox::StringView address,
  inox::Callback callback
) {
  (void)message;
  (void)port;
  (void)address;
  (void)callback;
  throwDgramError("TypeError: node:dgram is unsupported without libuv");
}
void DgramSocket::Impl::setBroadcast(bool enabled) {
  (void)enabled;
  throwDgramError("TypeError: node:dgram is unsupported without libuv");
}
void DgramSocket::Impl::setBufferSize(bool receive, double size) {
  (void)receive;
  (void)size;
  throwDgramError("TypeError: node:dgram is unsupported without libuv");
}
void DgramSocket::Impl::setMulticastInterface(inox::StringView multicast_interface) {
  (void)multicast_interface;
  throwDgramError("TypeError: node:dgram is unsupported without libuv");
}
void DgramSocket::Impl::setMulticastLoopback(bool enabled) {
  (void)enabled;
  throwDgramError("TypeError: node:dgram is unsupported without libuv");
}
void DgramSocket::Impl::setMulticastTTL(double ttl) {
  (void)ttl;
  throwDgramError("TypeError: node:dgram is unsupported without libuv");
}
void DgramSocket::Impl::setTTL(double ttl) {
  (void)ttl;
  throwDgramError("TypeError: node:dgram is unsupported without libuv");
}
void DgramSocket::Impl::unref() { throwDgramError("TypeError: node:dgram is unsupported without libuv"); }

#endif

namespace {

void requireSocket(bool valid, const char* operation) {
  if (!valid && !inox::thrown()) {
    throwDgramError(operation);
  }
}

std::span<const std::uint8_t> stringBytes(inox::StringView value) {
  return std::span<const std::uint8_t>(reinterpret_cast<const std::uint8_t*>(value.bytes), value.len);
}

} // namespace

DgramSocket::DgramSocket() : inox::Value() {}
DgramSocket::DgramSocket(const inox::Value& value) : inox::Value(value) {}
DgramSocket::DgramSocket(inox::Value&& value) : inox::Value(std::move(value)) {}

DgramSocket& DgramSocket::addMembership(inox::StringView multicast_address) {
  return addMembership(multicast_address, inox::StringView());
}

DgramSocket& DgramSocket::addMembership(
  inox::StringView multicast_address,
  inox::StringView multicast_interface
) {
  std::shared_ptr<Impl> impl = dgramSocketImpl(*this);
  requireSocket(impl != nullptr, "TypeError: DgramSocket.addMembership failed");
  if (impl) impl->membership(multicast_address, multicast_interface, true);
  return *this;
}

DgramAddress DgramSocket::address() const {
  std::shared_ptr<Impl> impl = dgramSocketImpl(*this);
  requireSocket(impl != nullptr, "TypeError: DgramSocket.address failed");
  return impl ? impl->address(false) : DgramAddress{inox::String(""), inox::String(""), 0};
}

DgramSocket& DgramSocket::bind() { return bind(0, inox::StringView("0.0.0.0")); }
DgramSocket& DgramSocket::bind(double port) { return bind(port, inox::StringView("0.0.0.0")); }
DgramSocket& DgramSocket::bind(double port, inox::StringView address) {
  std::shared_ptr<Impl> impl = dgramSocketImpl(*this);
  requireSocket(impl != nullptr, "TypeError: DgramSocket.bind failed");
  if (impl) impl->bind(port, address, inox::Callback());
  return *this;
}
DgramSocket& DgramSocket::bind(double port, inox::StringView address, inox::Callback callback) {
  std::shared_ptr<Impl> impl = dgramSocketImpl(*this);
  requireSocket(impl != nullptr, "TypeError: DgramSocket.bind failed");
  if (impl) impl->bind(port, address, std::move(callback));
  return *this;
}
DgramSocket& DgramSocket::bind(const DgramBindOptions& options) {
  return bind(options, inox::Callback());
}
DgramSocket& DgramSocket::bind(const DgramBindOptions& options, inox::Callback callback) {
  if (inox::thrown() || !options.valid_) return *this;
  const double port = options.port_.value_or(0);
  const inox::StringView address = options.address_ ? inox::StringView(*options.address_) : inox::StringView("0.0.0.0");
  return bind(port, address, std::move(callback));
}
DgramSocket& DgramSocket::close() { return close(inox::Callback()); }
DgramSocket& DgramSocket::close(inox::Callback callback) {
  std::shared_ptr<Impl> impl = dgramSocketImpl(*this);
  requireSocket(impl != nullptr, "TypeError: DgramSocket.close failed");
  if (impl) impl->close(std::move(callback));
  return *this;
}
DgramSocket& DgramSocket::connect(double port) { return connect(port, inox::StringView("127.0.0.1")); }
DgramSocket& DgramSocket::connect(double port, inox::StringView address) {
  std::shared_ptr<Impl> impl = dgramSocketImpl(*this);
  requireSocket(impl != nullptr, "TypeError: DgramSocket.connect failed");
  if (impl) impl->connect(port, address, inox::Callback());
  return *this;
}
DgramSocket& DgramSocket::connect(double port, inox::StringView address, inox::Callback callback) {
  std::shared_ptr<Impl> impl = dgramSocketImpl(*this);
  requireSocket(impl != nullptr, "TypeError: DgramSocket.connect failed");
  if (impl) impl->connect(port, address, std::move(callback));
  return *this;
}
DgramSocket& DgramSocket::disconnect() {
  std::shared_ptr<Impl> impl = dgramSocketImpl(*this);
  requireSocket(impl != nullptr, "TypeError: DgramSocket.disconnect failed");
  if (impl) impl->disconnect();
  return *this;
}

DgramSocket& DgramSocket::dropMembership(inox::StringView multicast_address) {
  return dropMembership(multicast_address, inox::StringView());
}

DgramSocket& DgramSocket::dropMembership(
  inox::StringView multicast_address,
  inox::StringView multicast_interface
) {
  std::shared_ptr<Impl> impl = dgramSocketImpl(*this);
  requireSocket(impl != nullptr, "TypeError: DgramSocket.dropMembership failed");
  if (impl) impl->membership(multicast_address, multicast_interface, false);
  return *this;
}
double DgramSocket::getRecvBufferSize() const {
  std::shared_ptr<Impl> impl = dgramSocketImpl(*this);
  requireSocket(impl != nullptr, "TypeError: DgramSocket.getRecvBufferSize failed");
  return impl ? impl->getBufferSize(true) : 0;
}
double DgramSocket::getSendBufferSize() const {
  std::shared_ptr<Impl> impl = dgramSocketImpl(*this);
  requireSocket(impl != nullptr, "TypeError: DgramSocket.getSendBufferSize failed");
  return impl ? impl->getBufferSize(false) : 0;
}

double DgramSocket::getSendQueueCount() const {
  std::shared_ptr<Impl> impl = dgramSocketImpl(*this);
  requireSocket(impl != nullptr, "TypeError: DgramSocket.getSendQueueCount failed");
  return impl ? impl->getSendQueueCount() : 0;
}

double DgramSocket::getSendQueueSize() const {
  std::shared_ptr<Impl> impl = dgramSocketImpl(*this);
  requireSocket(impl != nullptr, "TypeError: DgramSocket.getSendQueueSize failed");
  return impl ? impl->getSendQueueSize() : 0;
}
DgramSocket& DgramSocket::on(inox::StringView event_name, inox::Callback listener) {
  std::shared_ptr<Impl> impl = dgramSocketImpl(*this);
  requireSocket(impl != nullptr, "TypeError: DgramSocket.on failed");
  if (impl) impl->on(event_name, std::move(listener));
  return *this;
}
DgramSocket& DgramSocket::ref() {
  std::shared_ptr<Impl> impl = dgramSocketImpl(*this);
  requireSocket(impl != nullptr, "TypeError: DgramSocket.ref failed");
  if (impl) impl->ref();
  return *this;
}
DgramAddress DgramSocket::remoteAddress() const {
  std::shared_ptr<Impl> impl = dgramSocketImpl(*this);
  requireSocket(impl != nullptr, "TypeError: DgramSocket.remoteAddress failed");
  return impl ? impl->address(true) : DgramAddress{inox::String(""), inox::String(""), 0};
}
void DgramSocket::send(inox::StringView message) { send(message, inox::Callback()); }
void DgramSocket::send(inox::StringView message, inox::Callback callback) {
  std::shared_ptr<Impl> impl = dgramSocketImpl(*this);
  requireSocket(impl != nullptr, "TypeError: DgramSocket.send failed");
  if (impl) impl->send(stringBytes(message), nullptr, inox::StringView(), std::move(callback));
}
void DgramSocket::send(inox::StringView message, double port, inox::StringView address) {
  send(message, port, address, inox::Callback());
}
void DgramSocket::send(inox::StringView message, double port, inox::StringView address, inox::Callback callback) {
  std::shared_ptr<Impl> impl = dgramSocketImpl(*this);
  requireSocket(impl != nullptr, "TypeError: DgramSocket.send failed");
  if (impl) impl->send(stringBytes(message), &port, address, std::move(callback));
}
void DgramSocket::send(const Uint8Array& message) { send(message, inox::Callback()); }
void DgramSocket::send(const Uint8Array& message, inox::Callback callback) {
  std::shared_ptr<Impl> impl = dgramSocketImpl(*this);
  requireSocket(impl != nullptr, "TypeError: DgramSocket.send failed");
  if (impl) impl->send(message.bytes(), nullptr, inox::StringView(), std::move(callback));
}
void DgramSocket::send(const Uint8Array& message, double port, inox::StringView address) {
  send(message, port, address, inox::Callback());
}
void DgramSocket::send(const Uint8Array& message, double port, inox::StringView address, inox::Callback callback) {
  std::shared_ptr<Impl> impl = dgramSocketImpl(*this);
  requireSocket(impl != nullptr, "TypeError: DgramSocket.send failed");
  if (impl) impl->send(message.bytes(), &port, address, std::move(callback));
}
DgramSocket& DgramSocket::setBroadcast(bool enabled) {
  std::shared_ptr<Impl> impl = dgramSocketImpl(*this);
  requireSocket(impl != nullptr, "TypeError: DgramSocket.setBroadcast failed");
  if (impl) impl->setBroadcast(enabled);
  return *this;
}

DgramSocket& DgramSocket::setMulticastInterface(inox::StringView multicast_interface) {
  std::shared_ptr<Impl> impl = dgramSocketImpl(*this);
  requireSocket(impl != nullptr, "TypeError: DgramSocket.setMulticastInterface failed");
  if (impl) impl->setMulticastInterface(multicast_interface);
  return *this;
}

DgramSocket& DgramSocket::setMulticastLoopback(bool enabled) {
  std::shared_ptr<Impl> impl = dgramSocketImpl(*this);
  requireSocket(impl != nullptr, "TypeError: DgramSocket.setMulticastLoopback failed");
  if (impl) impl->setMulticastLoopback(enabled);
  return *this;
}

DgramSocket& DgramSocket::setMulticastTTL(double ttl) {
  std::shared_ptr<Impl> impl = dgramSocketImpl(*this);
  requireSocket(impl != nullptr, "TypeError: DgramSocket.setMulticastTTL failed");
  if (impl) impl->setMulticastTTL(ttl);
  return *this;
}
DgramSocket& DgramSocket::setRecvBufferSize(double size) {
  std::shared_ptr<Impl> impl = dgramSocketImpl(*this);
  requireSocket(impl != nullptr, "TypeError: DgramSocket.setRecvBufferSize failed");
  if (impl) impl->setBufferSize(true, size);
  return *this;
}
DgramSocket& DgramSocket::setSendBufferSize(double size) {
  std::shared_ptr<Impl> impl = dgramSocketImpl(*this);
  requireSocket(impl != nullptr, "TypeError: DgramSocket.setSendBufferSize failed");
  if (impl) impl->setBufferSize(false, size);
  return *this;
}
DgramSocket& DgramSocket::setTTL(double ttl) {
  std::shared_ptr<Impl> impl = dgramSocketImpl(*this);
  requireSocket(impl != nullptr, "TypeError: DgramSocket.setTTL failed");
  if (impl) impl->setTTL(ttl);
  return *this;
}
DgramSocket& DgramSocket::unref() {
  std::shared_ptr<Impl> impl = dgramSocketImpl(*this);
  requireSocket(impl != nullptr, "TypeError: DgramSocket.unref failed");
  if (impl) impl->unref();
  return *this;
}

DgramSocket DgramModule::createSocket(inox::StringView type) const {
  return createSocket(type, inox::Callback());
}
DgramSocket DgramModule::createSocket(inox::StringView type, inox::Callback listener) const {
  return materializeDgramSocket(DgramSocket::Impl::create(type, false, {}, {}, std::move(listener)));
}
DgramSocket DgramModule::createSocket(const DgramSocketOptions& options) const {
  return createSocket(options, inox::Callback());
}
DgramSocket DgramModule::createSocket(const DgramSocketOptions& options, inox::Callback listener) const {
  if (inox::thrown() || !options.valid_) return DgramSocket();
  return materializeDgramSocket(DgramSocket::Impl::create(
    options.type_,
    options.reuse_addr_,
    options.recv_buffer_size_,
    options.send_buffer_size_,
    std::move(listener)
  ));
}

const DgramModule dgram;
