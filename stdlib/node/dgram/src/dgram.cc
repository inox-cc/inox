#include "inox/dgram.h"

#include <string.h>

#include "inox/string.h"

DgramSocket::DgramSocket() : socket_(0) {}

DgramSocket::DgramSocket(inox_dgram_socket* socket) : socket_(socket) {}

static void inox_dgram_throw_failed(const char* message) {
  inox::throw_value(inox::String(message == 0 ? "dgram operation failed" : message));
}

static void inox_dgram_throw_status(inox_status status, const char* message) {
  if (status != INOX_OK) {
    inox_dgram_throw_failed(message);
  }
}

static bool inox_dgram_copy_host(inox::StringView host, const char* fallback, char* out, size_t out_len) {
  const char* bytes = host.len == 0 && fallback != 0 ? fallback : host.bytes;
  size_t len = host.len == 0 && fallback != 0 ? strlen(fallback) : host.len;

  if (bytes == 0 || out == 0 || out_len == 0 || len >= out_len) {
    return false;
  }

  if (len != 0) {
    memcpy(out, bytes, len);
  }

  out[len] = '\0';
  return true;
}

#ifdef INOX_LOOP_BACKEND_LIBUV
#include "loop-libuv-internal.h"

#include <stdlib.h>

struct DgramSendRequest {
  uv_udp_send_t request;
  inox_dgram_socket* socket;
  char* bytes;
  size_t length;
};

struct inox_dgram_socket {
  inox_loop* loop;
  inox_allocator* allocator;
  DgramRecvFn recv;
  void* recv_user;
  DgramCloseFn close;
  void* close_user;
  uv_udp_t handle;
  int closing;
  int retained;
};

static inox_status inox_dgram_ip4_addr(const char* host, int port, struct sockaddr_in* out);
static inox_status inox_dgram_sockaddr_to_address(const struct sockaddr* addr, DgramAddress* out);
static void inox_dgram_send_bytes(inox_dgram_socket* socket, inox::StringView bytes, const struct sockaddr* addr);
static void inox_dgram_alloc_cb(uv_handle_t* handle, size_t suggested_size, uv_buf_t* buf);
static void inox_dgram_recv_cb(uv_udp_t* handle, ssize_t nread, const uv_buf_t* buf, const struct sockaddr* addr, unsigned flags);
static void inox_dgram_send_cb(uv_udp_send_t* request, int status);
static void inox_dgram_close_cb(uv_handle_t* handle);

DgramSocket DgramSocket::create(
  inox_loop* loop,
  DgramRecvFn recv,
  void* user
) {
  if (loop == 0 || loop->allocator == 0) {
    inox_dgram_throw_failed("TypeError: DgramSocket.create failed");
    return DgramSocket();
  }

  uv_loop_t* uv_loop = inox_libuv_loop_handle(loop);

  if (uv_loop == 0) {
    inox_dgram_throw_failed("TypeError: DgramSocket.create failed");
    return DgramSocket();
  }

  inox_allocator* allocator = loop->allocator;
  inox_dgram_socket* socket =
    (inox_dgram_socket*)allocator->alloc(allocator->user, sizeof(inox_dgram_socket), alignof(inox_dgram_socket));

  if (socket == 0) {
    inox_dgram_throw_failed("TypeError: DgramSocket allocation failed");
    return DgramSocket();
  }

  memset(socket, 0, sizeof(inox_dgram_socket));
  socket->loop = loop;
  socket->allocator = allocator;
  socket->recv = recv;
  socket->recv_user = user;

  if (uv_udp_init(uv_loop, &socket->handle) != 0) {
    allocator->free(allocator->user, socket, sizeof(inox_dgram_socket), alignof(inox_dgram_socket));
    inox_dgram_throw_failed("TypeError: DgramSocket.create failed");
    return DgramSocket();
  }

  if (inox_libuv_loop_retain_request(loop) != INOX_OK) {
    uv_close((uv_handle_t*)&socket->handle, 0);
    uv_run(uv_loop, UV_RUN_NOWAIT);
    allocator->free(allocator->user, socket, sizeof(inox_dgram_socket), alignof(inox_dgram_socket));
    inox_dgram_throw_failed("TypeError: DgramSocket.create failed");
    return DgramSocket();
  }

  socket->retained = 1;
  socket->handle.data = socket;

  return DgramSocket(socket);
}

void DgramSocket::bind(inox::StringView host, int port, unsigned int flags) const {
  inox_dgram_socket* socket = socket_;

  if (socket == 0 || socket->closing) {
    inox_dgram_throw_failed("TypeError: DgramSocket.bind failed");
    return;
  }

  struct sockaddr_in addr;
  char host_buffer[256];

  if (!inox_dgram_copy_host(host, "0.0.0.0", host_buffer, sizeof(host_buffer))) {
    inox_dgram_throw_failed("TypeError: DgramSocket.bind failed");
    return;
  }

  inox_status status = inox_dgram_ip4_addr(host_buffer, port, &addr);

  if (status != INOX_OK) {
    inox_dgram_throw_failed("TypeError: DgramSocket.bind failed");
    return;
  }

  unsigned int uv_flags = (flags & INOX_DGRAM_BIND_REUSEADDR) != 0 ? UV_UDP_REUSEADDR : 0;

  if (uv_udp_bind(&socket->handle, (const struct sockaddr*)&addr, uv_flags) != 0) {
    inox_dgram_throw_failed("TypeError: DgramSocket.bind failed");
  }
}

void DgramSocket::onMessage(DgramRecvFn recv, void* user) const {
  inox_dgram_socket* socket = socket_;

  if (socket == 0 || socket->closing || recv == 0) {
    inox_dgram_throw_failed("TypeError: DgramSocket.onMessage failed");
    return;
  }

  socket->recv = recv;
  socket->recv_user = user;
}

void DgramSocket::onClose(DgramCloseFn close, void* user) const {
  inox_dgram_socket* socket = socket_;

  if (socket == 0 || socket->closing || close == 0) {
    inox_dgram_throw_failed("TypeError: DgramSocket.onClose failed");
    return;
  }

  socket->close = close;
  socket->close_user = user;
}

void DgramSocket::connect(inox::StringView host, int port) const {
  inox_dgram_socket* socket = socket_;

  if (socket == 0 || socket->closing) {
    inox_dgram_throw_failed("TypeError: DgramSocket.connect failed");
    return;
  }

  struct sockaddr_in addr;
  char host_buffer[256];

  if (!inox_dgram_copy_host(host, 0, host_buffer, sizeof(host_buffer))) {
    inox_dgram_throw_failed("TypeError: DgramSocket.connect failed");
    return;
  }

  inox_status status = inox_dgram_ip4_addr(host_buffer, port, &addr);

  if (status != INOX_OK) {
    inox_dgram_throw_failed("TypeError: DgramSocket.connect failed");
    return;
  }

  if (uv_udp_connect(&socket->handle, (const struct sockaddr*)&addr) != 0) {
    inox_dgram_throw_failed("TypeError: DgramSocket.connect failed");
  }
}

void DgramSocket::disconnect() const {
  inox_dgram_socket* socket = socket_;

  if (socket == 0 || socket->closing) {
    inox_dgram_throw_failed("TypeError: DgramSocket.disconnect failed");
    return;
  }

  if (uv_udp_connect(&socket->handle, 0) != 0) {
    inox_dgram_throw_failed("TypeError: DgramSocket.disconnect failed");
  }
}

void DgramSocket::recvStart() const {
  inox_dgram_socket* socket = socket_;

  if (socket == 0 || socket->closing || socket->recv == 0) {
    inox_dgram_throw_failed("TypeError: DgramSocket.recvStart failed");
    return;
  }

  if (uv_udp_recv_start(&socket->handle, inox_dgram_alloc_cb, inox_dgram_recv_cb) != 0) {
    inox_dgram_throw_failed("TypeError: DgramSocket.recvStart failed");
  }
}

void DgramSocket::recvStop() const {
  inox_dgram_socket* socket = socket_;

  if (socket == 0) {
    inox_dgram_throw_failed("TypeError: DgramSocket.recvStop failed");
    return;
  }

  if (uv_udp_recv_stop(&socket->handle) != 0) {
    inox_dgram_throw_failed("TypeError: DgramSocket.recvStop failed");
  }
}

static void inox_dgram_send_bytes(inox_dgram_socket* socket, inox::StringView bytes, const struct sockaddr* addr) {
  if (socket == 0 || socket->closing || (bytes.bytes == 0 && bytes.len != 0)) {
    inox_dgram_throw_failed("TypeError: DgramSocket.send failed");
    return;
  }

  inox_allocator* allocator = socket->allocator;
  DgramSendRequest* request =
    (DgramSendRequest*)allocator->alloc(allocator->user, sizeof(DgramSendRequest), alignof(DgramSendRequest));

  if (request == 0) {
    inox_dgram_throw_failed("TypeError: DgramSocket send allocation failed");
    return;
  }

  memset(request, 0, sizeof(DgramSendRequest));
  request->socket = socket;
  request->length = bytes.len;

  if (bytes.len != 0) {
    request->bytes = (char*)allocator->alloc(allocator->user, bytes.len, alignof(char));

    if (request->bytes == 0) {
      allocator->free(allocator->user, request, sizeof(DgramSendRequest), alignof(DgramSendRequest));
      inox_dgram_throw_failed("TypeError: DgramSocket send allocation failed");
      return;
    }

    memcpy(request->bytes, bytes.bytes, bytes.len);
  }

  inox_status status = inox_libuv_loop_retain_request(socket->loop);

  if (status != INOX_OK) {
    if (request->bytes != 0) {
      allocator->free(allocator->user, request->bytes, bytes.len, alignof(char));
    }

    allocator->free(allocator->user, request, sizeof(DgramSendRequest), alignof(DgramSendRequest));
    inox_dgram_throw_failed("TypeError: DgramSocket.send failed");
    return;
  }

  uv_buf_t buffer = uv_buf_init(request->bytes, (unsigned int)bytes.len);
  request->request.data = request;

  if (uv_udp_send(&request->request, &socket->handle, &buffer, 1, addr, inox_dgram_send_cb) != 0) {
    inox_libuv_loop_release_request(socket->loop);

    if (request->bytes != 0) {
      allocator->free(allocator->user, request->bytes, bytes.len, alignof(char));
    }

    allocator->free(allocator->user, request, sizeof(DgramSendRequest), alignof(DgramSendRequest));
    inox_dgram_throw_failed("TypeError: DgramSocket.send failed");
    return;
  }
}

void DgramSocket::send(inox::StringView bytes) const {
  inox_dgram_send_bytes(socket_, bytes, 0);
}

void DgramSocket::send(inox::StringView bytes, inox::StringView host, int port) const {
  struct sockaddr_in addr;
  char host_buffer[256];

  if (!inox_dgram_copy_host(host, 0, host_buffer, sizeof(host_buffer))) {
    inox_dgram_throw_failed("TypeError: DgramSocket.send failed");
    return;
  }

  inox_status status = inox_dgram_ip4_addr(host_buffer, port, &addr);

  if (status != INOX_OK) {
    inox_dgram_throw_failed("TypeError: DgramSocket.send failed");
    return;
  }

  inox_dgram_send_bytes(socket_, bytes, (const struct sockaddr*)&addr);
}

DgramAddress DgramSocket::address() const {
  inox_dgram_socket* socket = socket_;
  DgramAddress out = {};

  if (socket == 0) {
    inox_dgram_throw_failed("TypeError: DgramSocket.address failed");
    return out;
  }

  struct sockaddr_storage addr;
  int len = sizeof(addr);

  if (uv_udp_getsockname(&socket->handle, (struct sockaddr*)&addr, &len) != 0) {
    inox_dgram_throw_failed("TypeError: DgramSocket.address failed");
    return out;
  }

  inox_status status = inox_dgram_sockaddr_to_address((const struct sockaddr*)&addr, &out);
  inox_dgram_throw_status(status, "TypeError: DgramSocket.address failed");

  return out;
}

DgramAddress DgramSocket::remoteAddress() const {
  inox_dgram_socket* socket = socket_;
  DgramAddress out = {};

  if (socket == 0) {
    inox_dgram_throw_failed("TypeError: DgramSocket.remoteAddress failed");
    return out;
  }

  struct sockaddr_storage addr;
  int len = sizeof(addr);

  if (uv_udp_getpeername(&socket->handle, (struct sockaddr*)&addr, &len) != 0) {
    inox_dgram_throw_failed("TypeError: DgramSocket.remoteAddress failed");
    return out;
  }

  inox_status status = inox_dgram_sockaddr_to_address((const struct sockaddr*)&addr, &out);
  inox_dgram_throw_status(status, "TypeError: DgramSocket.remoteAddress failed");

  return out;
}

int DgramSocket::localPort() const {
  inox_dgram_socket* socket = socket_;

  if (socket == 0) {
    inox_dgram_throw_failed("TypeError: DgramSocket.localPort failed");
    return 0;
  }

  struct sockaddr_storage addr;
  int len = sizeof(addr);

  if (uv_udp_getsockname(&socket->handle, (struct sockaddr*)&addr, &len) != 0) {
    inox_dgram_throw_failed("TypeError: DgramSocket.localPort failed");
    return 0;
  }

  if (((struct sockaddr*)&addr)->sa_family != AF_INET) {
    inox_dgram_throw_failed("TypeError: DgramSocket.localPort failed");
    return 0;
  }

  return ntohs(((struct sockaddr_in*)&addr)->sin_port);
}

void DgramSocket::setBroadcast(bool enabled) const {
  inox_dgram_socket* socket = socket_;

  if (socket == 0 || socket->closing) {
    inox_dgram_throw_failed("TypeError: DgramSocket.setBroadcast failed");
    return;
  }

  if (uv_udp_set_broadcast(&socket->handle, enabled ? 1 : 0) != 0) {
    inox_dgram_throw_failed("TypeError: DgramSocket.setBroadcast failed");
  }
}

void DgramSocket::setTTL(int ttl) const {
  inox_dgram_socket* socket = socket_;

  if (socket == 0 || socket->closing) {
    inox_dgram_throw_failed("TypeError: DgramSocket.setTTL failed");
    return;
  }

  if (uv_udp_set_ttl(&socket->handle, ttl) != 0) {
    inox_dgram_throw_failed("TypeError: DgramSocket.setTTL failed");
  }
}

int DgramSocket::getSendBufferSize() const {
  inox_dgram_socket* socket = socket_;

  if (socket == 0 || socket->closing) {
    inox_dgram_throw_failed("TypeError: DgramSocket.getSendBufferSize failed");
    return 0;
  }

  int size = 0;

  if (uv_send_buffer_size((uv_handle_t*)&socket->handle, &size) != 0) {
    inox_dgram_throw_failed("TypeError: DgramSocket.getSendBufferSize failed");
    return 0;
  }

  return size;
}

void DgramSocket::setSendBufferSize(int size) const {
  inox_dgram_socket* socket = socket_;

  if (socket == 0 || socket->closing || size <= 0) {
    inox_dgram_throw_failed("TypeError: DgramSocket.setSendBufferSize failed");
    return;
  }

  int value = size;

  if (uv_send_buffer_size((uv_handle_t*)&socket->handle, &value) != 0) {
    inox_dgram_throw_failed("TypeError: DgramSocket.setSendBufferSize failed");
  }
}

int DgramSocket::getRecvBufferSize() const {
  inox_dgram_socket* socket = socket_;

  if (socket == 0 || socket->closing) {
    inox_dgram_throw_failed("TypeError: DgramSocket.getRecvBufferSize failed");
    return 0;
  }

  int size = 0;

  if (uv_recv_buffer_size((uv_handle_t*)&socket->handle, &size) != 0) {
    inox_dgram_throw_failed("TypeError: DgramSocket.getRecvBufferSize failed");
    return 0;
  }

  return size;
}

void DgramSocket::setRecvBufferSize(int size) const {
  inox_dgram_socket* socket = socket_;

  if (socket == 0 || socket->closing || size <= 0) {
    inox_dgram_throw_failed("TypeError: DgramSocket.setRecvBufferSize failed");
    return;
  }

  int value = size;

  if (uv_recv_buffer_size((uv_handle_t*)&socket->handle, &value) != 0) {
    inox_dgram_throw_failed("TypeError: DgramSocket.setRecvBufferSize failed");
  }
}

void DgramSocket::ref() const {
  inox_dgram_socket* socket = socket_;

  if (socket == 0 || socket->closing) {
    inox_dgram_throw_failed("TypeError: DgramSocket.ref failed");
    return;
  }
}

void DgramSocket::unref() const {
  inox_dgram_socket* socket = socket_;

  if (socket == 0 || socket->closing) {
    inox_dgram_throw_failed("TypeError: DgramSocket.unref failed");
    return;
  }
}

void DgramSocket::close() const {
  inox_dgram_socket* socket = socket_;

  if (socket == 0 || socket->closing) {
    return;
  }

  socket->closing = 1;
  uv_udp_recv_stop(&socket->handle);
  uv_close((uv_handle_t*)&socket->handle, inox_dgram_close_cb);
}

static inox_status inox_dgram_sockaddr_to_address(const struct sockaddr* addr, DgramAddress* out) {
  if (addr == 0 || out == 0) {
    return INOX_ERR_TYPE;
  }

  memset(out, 0, sizeof(DgramAddress));

  if (addr->sa_family != AF_INET) {
    return INOX_ERR_UNSUPPORTED;
  }

  const struct sockaddr_in* ip4 = (const struct sockaddr_in*)addr;
  uv_ip4_name(ip4, out->address, sizeof(out->address));
  out->family = "IPv4";
  out->port = ntohs(ip4->sin_port);

  return INOX_OK;
}

static inox_status inox_dgram_ip4_addr(const char* host, int port, struct sockaddr_in* out) {
  if (host == 0 || out == 0 || port < 0 || port > 65535) {
    return INOX_ERR_TYPE;
  }

  return uv_ip4_addr(host, port, out) == 0 ? INOX_OK : INOX_ERR_UNSUPPORTED;
}

static void inox_dgram_alloc_cb(uv_handle_t* handle, size_t suggested_size, uv_buf_t* buf) {
  inox_dgram_socket* socket = handle == 0 ? 0 : (inox_dgram_socket*)handle->data;
  size_t len = suggested_size == 0 ? 65536 : suggested_size;

  if (socket == 0 || socket->allocator == 0) {
    *buf = uv_buf_init(0, 0);
    return;
  }

  char* bytes = (char*)socket->allocator->alloc(socket->allocator->user, len, alignof(char));

  *buf = uv_buf_init(bytes, bytes == 0 ? 0 : (unsigned int)len);
}

static void inox_dgram_recv_cb(
  uv_udp_t* handle,
  ssize_t nread,
  const uv_buf_t* buf,
  const struct sockaddr* addr,
  unsigned flags
) {
  (void)flags;
  inox_dgram_socket* socket = handle == 0 ? 0 : (inox_dgram_socket*)handle->data;

  if (socket == 0) {
    return;
  }

  if (nread < 0) {
    inox_libuv_loop_report_status(socket->loop, INOX_ERR_FIELD);
  } else if (nread > 0 && socket->recv != 0) {
    char host[INET6_ADDRSTRLEN] = { 0 };
    int port = 0;

    if (addr != 0 && addr->sa_family == AF_INET) {
      const struct sockaddr_in* ip4 = (const struct sockaddr_in*)addr;
      uv_ip4_name(ip4, host, sizeof(host));
      port = ntohs(ip4->sin_port);
    }

    inox_status status = socket->recv(socket->recv_user, socket, buf->base, (size_t)nread, host, port);

    if (status != INOX_OK) {
      inox_libuv_loop_report_status(socket->loop, status);
    }
  }

  if (buf != 0 && buf->base != 0) {
    socket->allocator->free(socket->allocator->user, buf->base, buf->len, alignof(char));
  }
}

static void inox_dgram_send_cb(uv_udp_send_t* request, int status) {
  DgramSendRequest* send = request == 0 ? 0 : (DgramSendRequest*)request->data;

  if (send == 0 || send->socket == 0) {
    return;
  }

  inox_dgram_socket* socket = send->socket;

  if (status != 0) {
    inox_libuv_loop_report_status(socket->loop, INOX_ERR_FIELD);
  }

  inox_libuv_loop_release_request(socket->loop);

  if (send->bytes != 0) {
    socket->allocator->free(socket->allocator->user, send->bytes, send->length, alignof(char));
  }

  socket->allocator->free(socket->allocator->user, send, sizeof(DgramSendRequest), alignof(DgramSendRequest));
}

static void inox_dgram_close_cb(uv_handle_t* handle) {
  inox_dgram_socket* socket = handle == 0 ? 0 : (inox_dgram_socket*)handle->data;

  if (socket == 0) {
    return;
  }

  if (socket->close != 0) {
    socket->close(socket->close_user, socket);
  }

  if (socket->retained) {
    inox_libuv_loop_release_request(socket->loop);
  }

  socket->allocator->free(socket->allocator->user, socket, sizeof(inox_dgram_socket), alignof(inox_dgram_socket));
}

#else

struct inox_dgram_socket {
  int unused;
};

DgramSocket DgramSocket::create(
  inox_loop* loop,
  DgramRecvFn recv,
  void* user
) {
  (void)loop;
  (void)recv;
  (void)user;

  inox_dgram_throw_failed("TypeError: DgramSocket.create is unsupported");
  return DgramSocket();
}

void DgramSocket::bind(inox::StringView host, int port, unsigned int flags) const {
  (void)socket_;
  (void)host;
  (void)port;
  (void)flags;
  inox_dgram_throw_failed("TypeError: DgramSocket.bind is unsupported");
}

void DgramSocket::onMessage(DgramRecvFn recv, void* user) const {
  (void)socket_;
  (void)recv;
  (void)user;
  inox_dgram_throw_failed("TypeError: DgramSocket.onMessage is unsupported");
}

void DgramSocket::onClose(DgramCloseFn close, void* user) const {
  (void)socket_;
  (void)close;
  (void)user;
  inox_dgram_throw_failed("TypeError: DgramSocket.onClose is unsupported");
}

void DgramSocket::connect(inox::StringView host, int port) const {
  (void)socket_;
  (void)host;
  (void)port;
  inox_dgram_throw_failed("TypeError: DgramSocket.connect is unsupported");
}

void DgramSocket::disconnect() const {
  (void)socket_;
  inox_dgram_throw_failed("TypeError: DgramSocket.disconnect is unsupported");
}

void DgramSocket::recvStart() const {
  (void)socket_;
  inox_dgram_throw_failed("TypeError: DgramSocket.recvStart is unsupported");
}

void DgramSocket::recvStop() const {
  (void)socket_;
  inox_dgram_throw_failed("TypeError: DgramSocket.recvStop is unsupported");
}

void DgramSocket::send(inox::StringView bytes) const {
  (void)socket_;
  (void)bytes;
  inox_dgram_throw_failed("TypeError: DgramSocket.send is unsupported");
}

void DgramSocket::send(inox::StringView bytes, inox::StringView host, int port) const {
  (void)socket_;
  (void)bytes;
  (void)host;
  (void)port;
  inox_dgram_throw_failed("TypeError: DgramSocket.send is unsupported");
}

DgramAddress DgramSocket::address() const {
  (void)socket_;
  DgramAddress out = {};
  inox_dgram_throw_failed("TypeError: DgramSocket.address is unsupported");
  return out;
}

DgramAddress DgramSocket::remoteAddress() const {
  (void)socket_;
  DgramAddress out = {};
  inox_dgram_throw_failed("TypeError: DgramSocket.remoteAddress is unsupported");
  return out;
}

int DgramSocket::localPort() const {
  (void)socket_;
  inox_dgram_throw_failed("TypeError: DgramSocket.localPort is unsupported");
  return 0;
}

void DgramSocket::setBroadcast(bool enabled) const {
  (void)socket_;
  (void)enabled;
  inox_dgram_throw_failed("TypeError: DgramSocket.setBroadcast is unsupported");
}

void DgramSocket::setTTL(int ttl) const {
  (void)socket_;
  (void)ttl;
  inox_dgram_throw_failed("TypeError: DgramSocket.setTTL is unsupported");
}

int DgramSocket::getSendBufferSize() const {
  (void)socket_;
  inox_dgram_throw_failed("TypeError: DgramSocket.getSendBufferSize is unsupported");
  return 0;
}

void DgramSocket::setSendBufferSize(int size) const {
  (void)socket_;
  (void)size;
  inox_dgram_throw_failed("TypeError: DgramSocket.setSendBufferSize is unsupported");
}

int DgramSocket::getRecvBufferSize() const {
  (void)socket_;
  inox_dgram_throw_failed("TypeError: DgramSocket.getRecvBufferSize is unsupported");
  return 0;
}

void DgramSocket::setRecvBufferSize(int size) const {
  (void)socket_;
  (void)size;
  inox_dgram_throw_failed("TypeError: DgramSocket.setRecvBufferSize is unsupported");
}

void DgramSocket::ref() const {
  (void)socket_;
  inox_dgram_throw_failed("TypeError: DgramSocket.ref is unsupported");
}

void DgramSocket::unref() const {
  (void)socket_;
  inox_dgram_throw_failed("TypeError: DgramSocket.unref is unsupported");
}

void DgramSocket::close() const {
  (void)socket_;
}

#endif
