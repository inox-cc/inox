#include "inox/dgram.h"

#include <string.h>

#ifdef INOX_LOOP_BACKEND_LIBUV
#include "loop-libuv-internal.h"

#include <stdlib.h>

typedef struct inox_dgram_send_request {
  uv_udp_send_t request;
  inox_dgram_socket* socket;
  char* bytes;
  size_t len;
  inox_dgram_send_fn callback;
  void* user;
} inox_dgram_send_request;

struct inox_dgram_socket {
  inox_loop* loop;
  inox_allocator* allocator;
  inox_dgram_recv_fn recv;
  void* recv_user;
  inox_dgram_close_fn close;
  void* close_user;
  uv_udp_t handle;
  int closing;
  int retained;
};

static inox_status inox_dgram_ip4_addr(const char* host, int port, struct sockaddr_in* out);
static inox_status inox_dgram_send_resolved(
  inox_dgram_socket* socket,
  const char* bytes,
  size_t len,
  const struct sockaddr* addr,
  inox_dgram_send_fn callback,
  void* user
);
static inox_status inox_dgram_sockaddr_to_address(const struct sockaddr* addr, inox_dgram_address* out);
static void inox_dgram_alloc_cb(uv_handle_t* handle, size_t suggested_size, uv_buf_t* buf);
static void inox_dgram_recv_cb(uv_udp_t* handle, ssize_t nread, const uv_buf_t* buf, const struct sockaddr* addr, unsigned flags);
static void inox_dgram_send_cb(uv_udp_send_t* request, int status);
static void inox_dgram_close_cb(uv_handle_t* handle);

inox_status inox_dgram_socket_new(
  inox_loop* loop,
  inox_dgram_recv_fn recv,
  void* user,
  inox_dgram_socket** out
) {
  if (loop == 0 || loop->allocator == 0 || out == 0) {
    return INOX_ERR_TYPE;
  }

  *out = 0;

  uv_loop_t* uv_loop = inox_libuv_loop_handle(loop);

  if (uv_loop == 0) {
    return INOX_ERR_TYPE;
  }

  inox_allocator* allocator = loop->allocator;
  inox_dgram_socket* socket =
    (inox_dgram_socket*)allocator->alloc(allocator->user, sizeof(inox_dgram_socket), alignof(inox_dgram_socket));

  if (socket == 0) {
    return INOX_ERR_OOM;
  }

  memset(socket, 0, sizeof(inox_dgram_socket));
  socket->loop = loop;
  socket->allocator = allocator;
  socket->recv = recv;
  socket->recv_user = user;

  if (uv_udp_init(uv_loop, &socket->handle) != 0) {
    allocator->free(allocator->user, socket, sizeof(inox_dgram_socket), alignof(inox_dgram_socket));
    return INOX_ERR_FIELD;
  }

  if (inox_libuv_loop_retain_request(loop) != INOX_OK) {
    uv_close((uv_handle_t*)&socket->handle, 0);
    uv_run(uv_loop, UV_RUN_NOWAIT);
    allocator->free(allocator->user, socket, sizeof(inox_dgram_socket), alignof(inox_dgram_socket));
    return INOX_ERR_TYPE;
  }

  socket->retained = 1;
  socket->handle.data = socket;
  *out = socket;

  return INOX_OK;
}

inox_status inox_dgram_bind(inox_dgram_socket* socket, const char* host, int port) {
  if (socket == 0 || socket->closing) {
    return INOX_ERR_TYPE;
  }

  struct sockaddr_in addr;
  inox_status status = inox_dgram_ip4_addr(host == 0 ? "0.0.0.0" : host, port, &addr);

  if (status != INOX_OK) {
    return status;
  }

  return uv_udp_bind(&socket->handle, (const struct sockaddr*)&addr, 0) == 0 ? INOX_OK : INOX_ERR_FIELD;
}

inox_status inox_dgram_bind_flags(inox_dgram_socket* socket, const char* host, int port, unsigned int flags) {
  if (socket == 0 || socket->closing) {
    return INOX_ERR_TYPE;
  }

  struct sockaddr_in addr;
  inox_status status = inox_dgram_ip4_addr(host == 0 ? "0.0.0.0" : host, port, &addr);

  if (status != INOX_OK) {
    return status;
  }

  unsigned int uv_flags = (flags & INOX_DGRAM_BIND_REUSEADDR) != 0 ? UV_UDP_REUSEADDR : 0;

  return uv_udp_bind(&socket->handle, (const struct sockaddr*)&addr, uv_flags) == 0 ? INOX_OK : INOX_ERR_FIELD;
}

inox_status inox_dgram_socket_on_message(inox_dgram_socket* socket, inox_dgram_recv_fn recv, void* user) {
  if (socket == 0 || socket->closing || recv == 0) {
    return INOX_ERR_TYPE;
  }

  socket->recv = recv;
  socket->recv_user = user;
  return INOX_OK;
}

inox_status inox_dgram_socket_on_close(inox_dgram_socket* socket, inox_dgram_close_fn close, void* user) {
  if (socket == 0 || socket->closing || close == 0) {
    return INOX_ERR_TYPE;
  }

  socket->close = close;
  socket->close_user = user;
  return INOX_OK;
}

inox_status inox_dgram_socket_connect(inox_dgram_socket* socket, const char* host, int port) {
  if (socket == 0 || socket->closing || host == 0) {
    return INOX_ERR_TYPE;
  }

  struct sockaddr_in addr;
  inox_status status = inox_dgram_ip4_addr(host, port, &addr);

  if (status != INOX_OK) {
    return status;
  }

  return uv_udp_connect(&socket->handle, (const struct sockaddr*)&addr) == 0 ? INOX_OK : INOX_ERR_FIELD;
}

inox_status inox_dgram_socket_disconnect(inox_dgram_socket* socket) {
  if (socket == 0 || socket->closing) {
    return INOX_ERR_TYPE;
  }

  return uv_udp_connect(&socket->handle, 0) == 0 ? INOX_OK : INOX_ERR_FIELD;
}

inox_status inox_dgram_recv_start(inox_dgram_socket* socket) {
  if (socket == 0 || socket->closing || socket->recv == 0) {
    return INOX_ERR_TYPE;
  }

  return uv_udp_recv_start(&socket->handle, inox_dgram_alloc_cb, inox_dgram_recv_cb) == 0 ? INOX_OK : INOX_ERR_FIELD;
}

inox_status inox_dgram_recv_stop(inox_dgram_socket* socket) {
  if (socket == 0) {
    return INOX_ERR_TYPE;
  }

  return uv_udp_recv_stop(&socket->handle) == 0 ? INOX_OK : INOX_ERR_FIELD;
}

inox_status inox_dgram_send(inox_dgram_socket* socket, const char* bytes, size_t len, const char* host, int port) {
  if (host == 0) {
    return INOX_ERR_TYPE;
  }

  struct sockaddr_in addr;
  inox_status status = inox_dgram_ip4_addr(host, port, &addr);

  if (status != INOX_OK) {
    return status;
  }

  return inox_dgram_send_resolved(socket, bytes, len, (const struct sockaddr*)&addr, 0, 0);
}

inox_status inox_dgram_send_with_callback(
  inox_dgram_socket* socket,
  const char* bytes,
  size_t len,
  const char* host,
  int port,
  inox_dgram_send_fn callback,
  void* user
) {
  if (host == 0) {
    return INOX_ERR_TYPE;
  }

  struct sockaddr_in addr;
  inox_status status = inox_dgram_ip4_addr(host, port, &addr);

  if (status != INOX_OK) {
    return status;
  }

  return inox_dgram_send_resolved(socket, bytes, len, (const struct sockaddr*)&addr, callback, user);
}

inox_status inox_dgram_send_connected(inox_dgram_socket* socket, const char* bytes, size_t len) {
  return inox_dgram_send_resolved(socket, bytes, len, 0, 0, 0);
}

inox_status inox_dgram_send_connected_with_callback(
  inox_dgram_socket* socket,
  const char* bytes,
  size_t len,
  inox_dgram_send_fn callback,
  void* user
) {
  return inox_dgram_send_resolved(socket, bytes, len, 0, callback, user);
}

inox_status inox_dgram_socket_address(inox_dgram_socket* socket, inox_dgram_address* out) {
  if (socket == 0 || out == 0) {
    return INOX_ERR_TYPE;
  }

  struct sockaddr_storage addr;
  int len = sizeof(addr);

  if (uv_udp_getsockname(&socket->handle, (struct sockaddr*)&addr, &len) != 0) {
    return INOX_ERR_FIELD;
  }

  return inox_dgram_sockaddr_to_address((const struct sockaddr*)&addr, out);
}

inox_status inox_dgram_socket_remote_address(inox_dgram_socket* socket, inox_dgram_address* out) {
  if (socket == 0 || out == 0) {
    return INOX_ERR_TYPE;
  }

  struct sockaddr_storage addr;
  int len = sizeof(addr);

  if (uv_udp_getpeername(&socket->handle, (struct sockaddr*)&addr, &len) != 0) {
    return INOX_ERR_FIELD;
  }

  return inox_dgram_sockaddr_to_address((const struct sockaddr*)&addr, out);
}

inox_status inox_dgram_local_port(inox_dgram_socket* socket, int* out_port) {
  if (socket == 0 || out_port == 0) {
    return INOX_ERR_TYPE;
  }

  struct sockaddr_storage addr;
  int len = sizeof(addr);

  if (uv_udp_getsockname(&socket->handle, (struct sockaddr*)&addr, &len) != 0) {
    return INOX_ERR_FIELD;
  }

  if (((struct sockaddr*)&addr)->sa_family != AF_INET) {
    return INOX_ERR_UNSUPPORTED;
  }

  *out_port = ntohs(((struct sockaddr_in*)&addr)->sin_port);

  return INOX_OK;
}

inox_status inox_dgram_set_broadcast(inox_dgram_socket* socket, int enabled) {
  if (socket == 0 || socket->closing) {
    return INOX_ERR_TYPE;
  }

  return uv_udp_set_broadcast(&socket->handle, enabled ? 1 : 0) == 0 ? INOX_OK : INOX_ERR_FIELD;
}

inox_status inox_dgram_set_ttl(inox_dgram_socket* socket, int ttl) {
  if (socket == 0 || socket->closing) {
    return INOX_ERR_TYPE;
  }

  return uv_udp_set_ttl(&socket->handle, ttl) == 0 ? INOX_OK : INOX_ERR_FIELD;
}

inox_status inox_dgram_get_send_buffer_size(inox_dgram_socket* socket, int* out_size) {
  if (socket == 0 || socket->closing || out_size == 0) {
    return INOX_ERR_TYPE;
  }

  int size = 0;

  if (uv_send_buffer_size((uv_handle_t*)&socket->handle, &size) != 0) {
    return INOX_ERR_FIELD;
  }

  *out_size = size;
  return INOX_OK;
}

inox_status inox_dgram_set_send_buffer_size(inox_dgram_socket* socket, int size) {
  if (socket == 0 || socket->closing || size <= 0) {
    return INOX_ERR_TYPE;
  }

  int value = size;

  return uv_send_buffer_size((uv_handle_t*)&socket->handle, &value) == 0 ? INOX_OK : INOX_ERR_FIELD;
}

inox_status inox_dgram_get_recv_buffer_size(inox_dgram_socket* socket, int* out_size) {
  if (socket == 0 || socket->closing || out_size == 0) {
    return INOX_ERR_TYPE;
  }

  int size = 0;

  if (uv_recv_buffer_size((uv_handle_t*)&socket->handle, &size) != 0) {
    return INOX_ERR_FIELD;
  }

  *out_size = size;
  return INOX_OK;
}

inox_status inox_dgram_set_recv_buffer_size(inox_dgram_socket* socket, int size) {
  if (socket == 0 || socket->closing || size <= 0) {
    return INOX_ERR_TYPE;
  }

  int value = size;

  return uv_recv_buffer_size((uv_handle_t*)&socket->handle, &value) == 0 ? INOX_OK : INOX_ERR_FIELD;
}

inox_status inox_dgram_ref(inox_dgram_socket* socket) {
  if (socket == 0 || socket->closing) {
    return INOX_ERR_TYPE;
  }

  return INOX_OK;
}

inox_status inox_dgram_unref(inox_dgram_socket* socket) {
  if (socket == 0 || socket->closing) {
    return INOX_ERR_TYPE;
  }

  return INOX_OK;
}

void inox_dgram_close(inox_dgram_socket* socket) {
  if (socket == 0 || socket->closing) {
    return;
  }

  socket->closing = 1;
  uv_udp_recv_stop(&socket->handle);
  uv_close((uv_handle_t*)&socket->handle, inox_dgram_close_cb);
}

static inox_status inox_dgram_send_resolved(
  inox_dgram_socket* socket,
  const char* bytes,
  size_t len,
  const struct sockaddr* addr,
  inox_dgram_send_fn callback,
  void* user
) {
  if (socket == 0 || socket->closing || (bytes == 0 && len != 0)) {
    return INOX_ERR_TYPE;
  }

  inox_allocator* allocator = socket->allocator;
  inox_dgram_send_request* request =
    (inox_dgram_send_request*)allocator->alloc(allocator->user, sizeof(inox_dgram_send_request), alignof(inox_dgram_send_request));

  if (request == 0) {
    return INOX_ERR_OOM;
  }

  memset(request, 0, sizeof(inox_dgram_send_request));
  request->socket = socket;
  request->len = len;
  request->callback = callback;
  request->user = user;

  if (len != 0) {
    request->bytes = (char*)allocator->alloc(allocator->user, len, alignof(char));

    if (request->bytes == 0) {
      allocator->free(allocator->user, request, sizeof(inox_dgram_send_request), alignof(inox_dgram_send_request));
      return INOX_ERR_OOM;
    }

    memcpy(request->bytes, bytes, len);
  }

  inox_status status = inox_libuv_loop_retain_request(socket->loop);

  if (status != INOX_OK) {
    if (request->bytes != 0) {
      allocator->free(allocator->user, request->bytes, len, alignof(char));
    }

    allocator->free(allocator->user, request, sizeof(inox_dgram_send_request), alignof(inox_dgram_send_request));
    return status;
  }

  uv_buf_t buffer = uv_buf_init(request->bytes, (unsigned int)len);
  request->request.data = request;

  if (uv_udp_send(&request->request, &socket->handle, &buffer, 1, addr, inox_dgram_send_cb) != 0) {
    inox_libuv_loop_release_request(socket->loop);

    if (request->bytes != 0) {
      allocator->free(allocator->user, request->bytes, len, alignof(char));
    }

    allocator->free(allocator->user, request, sizeof(inox_dgram_send_request), alignof(inox_dgram_send_request));
    return INOX_ERR_FIELD;
  }

  return INOX_OK;
}

static inox_status inox_dgram_sockaddr_to_address(const struct sockaddr* addr, inox_dgram_address* out) {
  if (addr == 0 || out == 0) {
    return INOX_ERR_TYPE;
  }

  memset(out, 0, sizeof(inox_dgram_address));

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
  inox_dgram_send_request* send = request == 0 ? 0 : (inox_dgram_send_request*)request->data;

  if (send == 0 || send->socket == 0) {
    return;
  }

  inox_dgram_socket* socket = send->socket;

  inox_status send_status = status == 0 ? INOX_OK : INOX_ERR_FIELD;

  if (status != 0 && send->callback == 0) {
    inox_libuv_loop_report_status(socket->loop, INOX_ERR_FIELD);
  }

  if (send->callback != 0) {
    inox_status callback_status = send->callback(send->user, send_status);

    if (callback_status != INOX_OK) {
      inox_libuv_loop_report_status(socket->loop, callback_status);
    }
  }

  inox_libuv_loop_release_request(socket->loop);

  if (send->bytes != 0) {
    socket->allocator->free(socket->allocator->user, send->bytes, send->len, alignof(char));
  }

  socket->allocator->free(socket->allocator->user, send, sizeof(inox_dgram_send_request), alignof(inox_dgram_send_request));
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

inox_status inox_dgram_socket_new(
  inox_loop* loop,
  inox_dgram_recv_fn recv,
  void* user,
  inox_dgram_socket** out
) {
  (void)loop;
  (void)recv;
  (void)user;

  if (out == 0) {
    return INOX_ERR_TYPE;
  }

  *out = 0;
  return INOX_ERR_UNSUPPORTED;
}

inox_status inox_dgram_bind(inox_dgram_socket* socket, const char* host, int port) {
  (void)socket;
  (void)host;
  (void)port;
  return INOX_ERR_UNSUPPORTED;
}

inox_status inox_dgram_bind_flags(inox_dgram_socket* socket, const char* host, int port, unsigned int flags) {
  (void)socket;
  (void)host;
  (void)port;
  (void)flags;
  return INOX_ERR_UNSUPPORTED;
}

inox_status inox_dgram_socket_on_message(inox_dgram_socket* socket, inox_dgram_recv_fn recv, void* user) {
  (void)socket;
  (void)recv;
  (void)user;
  return INOX_ERR_UNSUPPORTED;
}

inox_status inox_dgram_socket_on_close(inox_dgram_socket* socket, inox_dgram_close_fn close, void* user) {
  (void)socket;
  (void)close;
  (void)user;
  return INOX_ERR_UNSUPPORTED;
}

inox_status inox_dgram_socket_connect(inox_dgram_socket* socket, const char* host, int port) {
  (void)socket;
  (void)host;
  (void)port;
  return INOX_ERR_UNSUPPORTED;
}

inox_status inox_dgram_socket_disconnect(inox_dgram_socket* socket) {
  (void)socket;
  return INOX_ERR_UNSUPPORTED;
}

inox_status inox_dgram_recv_start(inox_dgram_socket* socket) {
  (void)socket;
  return INOX_ERR_UNSUPPORTED;
}

inox_status inox_dgram_recv_stop(inox_dgram_socket* socket) {
  (void)socket;
  return INOX_ERR_UNSUPPORTED;
}

inox_status inox_dgram_send(inox_dgram_socket* socket, const char* bytes, size_t len, const char* host, int port) {
  (void)socket;
  (void)bytes;
  (void)len;
  (void)host;
  (void)port;
  return INOX_ERR_UNSUPPORTED;
}

inox_status inox_dgram_send_with_callback(
  inox_dgram_socket* socket,
  const char* bytes,
  size_t len,
  const char* host,
  int port,
  inox_dgram_send_fn callback,
  void* user
) {
  (void)socket;
  (void)bytes;
  (void)len;
  (void)host;
  (void)port;
  (void)callback;
  (void)user;
  return INOX_ERR_UNSUPPORTED;
}

inox_status inox_dgram_send_connected(inox_dgram_socket* socket, const char* bytes, size_t len) {
  (void)socket;
  (void)bytes;
  (void)len;
  return INOX_ERR_UNSUPPORTED;
}

inox_status inox_dgram_send_connected_with_callback(
  inox_dgram_socket* socket,
  const char* bytes,
  size_t len,
  inox_dgram_send_fn callback,
  void* user
) {
  (void)socket;
  (void)bytes;
  (void)len;
  (void)callback;
  (void)user;
  return INOX_ERR_UNSUPPORTED;
}

inox_status inox_dgram_socket_address(inox_dgram_socket* socket, inox_dgram_address* out) {
  (void)socket;

  if (out == 0) {
    return INOX_ERR_TYPE;
  }

  memset(out, 0, sizeof(inox_dgram_address));
  return INOX_ERR_UNSUPPORTED;
}

inox_status inox_dgram_socket_remote_address(inox_dgram_socket* socket, inox_dgram_address* out) {
  (void)socket;

  if (out == 0) {
    return INOX_ERR_TYPE;
  }

  memset(out, 0, sizeof(inox_dgram_address));
  return INOX_ERR_UNSUPPORTED;
}

inox_status inox_dgram_local_port(inox_dgram_socket* socket, int* out_port) {
  (void)socket;

  if (out_port == 0) {
    return INOX_ERR_TYPE;
  }

  *out_port = 0;
  return INOX_ERR_UNSUPPORTED;
}

inox_status inox_dgram_set_broadcast(inox_dgram_socket* socket, int enabled) {
  (void)socket;
  (void)enabled;
  return INOX_ERR_UNSUPPORTED;
}

inox_status inox_dgram_set_ttl(inox_dgram_socket* socket, int ttl) {
  (void)socket;
  (void)ttl;
  return INOX_ERR_UNSUPPORTED;
}

inox_status inox_dgram_get_send_buffer_size(inox_dgram_socket* socket, int* out_size) {
  (void)socket;

  if (out_size == 0) {
    return INOX_ERR_TYPE;
  }

  *out_size = 0;
  return INOX_ERR_UNSUPPORTED;
}

inox_status inox_dgram_set_send_buffer_size(inox_dgram_socket* socket, int size) {
  (void)socket;
  (void)size;
  return INOX_ERR_UNSUPPORTED;
}

inox_status inox_dgram_get_recv_buffer_size(inox_dgram_socket* socket, int* out_size) {
  (void)socket;

  if (out_size == 0) {
    return INOX_ERR_TYPE;
  }

  *out_size = 0;
  return INOX_ERR_UNSUPPORTED;
}

inox_status inox_dgram_set_recv_buffer_size(inox_dgram_socket* socket, int size) {
  (void)socket;
  (void)size;
  return INOX_ERR_UNSUPPORTED;
}

inox_status inox_dgram_ref(inox_dgram_socket* socket) {
  (void)socket;
  return INOX_ERR_UNSUPPORTED;
}

inox_status inox_dgram_unref(inox_dgram_socket* socket) {
  (void)socket;
  return INOX_ERR_UNSUPPORTED;
}

void inox_dgram_close(inox_dgram_socket* socket) {
  (void)socket;
}

#endif
