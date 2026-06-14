#include "ccjs/dgram.h"

#ifdef CCJS_LOOP_BACKEND_LIBUV
#include "../async/loop-libuv-internal.h"

#include <stdlib.h>
#include <string.h>

typedef struct ccjs_dgram_send_request {
  uv_udp_send_t request;
  ccjs_dgram_socket* socket;
  char* bytes;
  size_t len;
} ccjs_dgram_send_request;

struct ccjs_dgram_socket {
  ccjs_loop* loop;
  ccjs_allocator* allocator;
  ccjs_dgram_recv_fn recv;
  void* user;
  uv_udp_t handle;
  int closing;
  int retained;
};

static ccjs_status ccjs_dgram_ip4_addr(const char* host, int port, struct sockaddr_in* out);
static void ccjs_dgram_alloc_cb(uv_handle_t* handle, size_t suggested_size, uv_buf_t* buf);
static void ccjs_dgram_recv_cb(uv_udp_t* handle, ssize_t nread, const uv_buf_t* buf, const struct sockaddr* addr, unsigned flags);
static void ccjs_dgram_send_cb(uv_udp_send_t* request, int status);
static void ccjs_dgram_close_cb(uv_handle_t* handle);

ccjs_status ccjs_dgram_socket_new(
  ccjs_loop* loop,
  ccjs_dgram_recv_fn recv,
  void* user,
  ccjs_dgram_socket** out
) {
  if (loop == 0 || loop->allocator == 0 || out == 0) {
    return CCJS_ERR_TYPE;
  }

  *out = 0;

  uv_loop_t* uv_loop = ccjs_libuv_loop_handle(loop);

  if (uv_loop == 0) {
    return CCJS_ERR_TYPE;
  }

  ccjs_allocator* allocator = loop->allocator;
  ccjs_dgram_socket* socket =
    allocator->alloc(allocator->user, sizeof(ccjs_dgram_socket), _Alignof(ccjs_dgram_socket));

  if (socket == 0) {
    return CCJS_ERR_OOM;
  }

  memset(socket, 0, sizeof(ccjs_dgram_socket));
  socket->loop = loop;
  socket->allocator = allocator;
  socket->recv = recv;
  socket->user = user;

  if (uv_udp_init(uv_loop, &socket->handle) != 0) {
    allocator->free(allocator->user, socket, sizeof(ccjs_dgram_socket), _Alignof(ccjs_dgram_socket));
    return CCJS_ERR_FIELD;
  }

  if (ccjs_libuv_loop_retain_request(loop) != CCJS_OK) {
    uv_close((uv_handle_t*)&socket->handle, 0);
    uv_run(uv_loop, UV_RUN_NOWAIT);
    allocator->free(allocator->user, socket, sizeof(ccjs_dgram_socket), _Alignof(ccjs_dgram_socket));
    return CCJS_ERR_TYPE;
  }

  socket->retained = 1;
  socket->handle.data = socket;
  *out = socket;

  return CCJS_OK;
}

ccjs_status ccjs_dgram_bind(ccjs_dgram_socket* socket, const char* host, int port) {
  if (socket == 0 || socket->closing) {
    return CCJS_ERR_TYPE;
  }

  struct sockaddr_in addr;
  ccjs_status status = ccjs_dgram_ip4_addr(host == 0 ? "0.0.0.0" : host, port, &addr);

  if (status != CCJS_OK) {
    return status;
  }

  return uv_udp_bind(&socket->handle, (const struct sockaddr*)&addr, 0) == 0 ? CCJS_OK : CCJS_ERR_FIELD;
}

ccjs_status ccjs_dgram_recv_start(ccjs_dgram_socket* socket) {
  if (socket == 0 || socket->closing || socket->recv == 0) {
    return CCJS_ERR_TYPE;
  }

  return uv_udp_recv_start(&socket->handle, ccjs_dgram_alloc_cb, ccjs_dgram_recv_cb) == 0 ? CCJS_OK : CCJS_ERR_FIELD;
}

ccjs_status ccjs_dgram_recv_stop(ccjs_dgram_socket* socket) {
  if (socket == 0) {
    return CCJS_ERR_TYPE;
  }

  return uv_udp_recv_stop(&socket->handle) == 0 ? CCJS_OK : CCJS_ERR_FIELD;
}

ccjs_status ccjs_dgram_send(ccjs_dgram_socket* socket, const char* bytes, size_t len, const char* host, int port) {
  if (socket == 0 || socket->closing || (bytes == 0 && len != 0) || host == 0) {
    return CCJS_ERR_TYPE;
  }

  ccjs_allocator* allocator = socket->allocator;
  ccjs_dgram_send_request* request =
    allocator->alloc(allocator->user, sizeof(ccjs_dgram_send_request), _Alignof(ccjs_dgram_send_request));

  if (request == 0) {
    return CCJS_ERR_OOM;
  }

  memset(request, 0, sizeof(ccjs_dgram_send_request));
  request->socket = socket;
  request->len = len;

  if (len != 0) {
    request->bytes = allocator->alloc(allocator->user, len, _Alignof(char));

    if (request->bytes == 0) {
      allocator->free(allocator->user, request, sizeof(ccjs_dgram_send_request), _Alignof(ccjs_dgram_send_request));
      return CCJS_ERR_OOM;
    }

    memcpy(request->bytes, bytes, len);
  }

  struct sockaddr_in addr;
  ccjs_status status = ccjs_dgram_ip4_addr(host, port, &addr);

  if (status != CCJS_OK) {
    if (request->bytes != 0) {
      allocator->free(allocator->user, request->bytes, len, _Alignof(char));
    }

    allocator->free(allocator->user, request, sizeof(ccjs_dgram_send_request), _Alignof(ccjs_dgram_send_request));
    return status;
  }

  status = ccjs_libuv_loop_retain_request(socket->loop);

  if (status != CCJS_OK) {
    if (request->bytes != 0) {
      allocator->free(allocator->user, request->bytes, len, _Alignof(char));
    }

    allocator->free(allocator->user, request, sizeof(ccjs_dgram_send_request), _Alignof(ccjs_dgram_send_request));
    return status;
  }

  uv_buf_t buffer = uv_buf_init(request->bytes == 0 ? "" : request->bytes, (unsigned int)len);
  request->request.data = request;

  if (uv_udp_send(&request->request, &socket->handle, &buffer, 1, (const struct sockaddr*)&addr, ccjs_dgram_send_cb) != 0) {
    ccjs_libuv_loop_release_request(socket->loop);

    if (request->bytes != 0) {
      allocator->free(allocator->user, request->bytes, len, _Alignof(char));
    }

    allocator->free(allocator->user, request, sizeof(ccjs_dgram_send_request), _Alignof(ccjs_dgram_send_request));
    return CCJS_ERR_FIELD;
  }

  return CCJS_OK;
}

ccjs_status ccjs_dgram_local_port(ccjs_dgram_socket* socket, int* out_port) {
  if (socket == 0 || out_port == 0) {
    return CCJS_ERR_TYPE;
  }

  struct sockaddr_storage addr;
  int len = sizeof(addr);

  if (uv_udp_getsockname(&socket->handle, (struct sockaddr*)&addr, &len) != 0) {
    return CCJS_ERR_FIELD;
  }

  if (((struct sockaddr*)&addr)->sa_family != AF_INET) {
    return CCJS_ERR_UNSUPPORTED;
  }

  *out_port = ntohs(((struct sockaddr_in*)&addr)->sin_port);

  return CCJS_OK;
}

void ccjs_dgram_close(ccjs_dgram_socket* socket) {
  if (socket == 0 || socket->closing) {
    return;
  }

  socket->closing = 1;
  uv_udp_recv_stop(&socket->handle);
  uv_close((uv_handle_t*)&socket->handle, ccjs_dgram_close_cb);
}

static ccjs_status ccjs_dgram_ip4_addr(const char* host, int port, struct sockaddr_in* out) {
  if (host == 0 || out == 0 || port < 0 || port > 65535) {
    return CCJS_ERR_TYPE;
  }

  return uv_ip4_addr(host, port, out) == 0 ? CCJS_OK : CCJS_ERR_UNSUPPORTED;
}

static void ccjs_dgram_alloc_cb(uv_handle_t* handle, size_t suggested_size, uv_buf_t* buf) {
  ccjs_dgram_socket* socket = handle == 0 ? 0 : (ccjs_dgram_socket*)handle->data;
  size_t len = suggested_size == 0 ? 65536 : suggested_size;

  if (socket == 0 || socket->allocator == 0) {
    *buf = uv_buf_init(0, 0);
    return;
  }

  char* bytes = socket->allocator->alloc(socket->allocator->user, len, _Alignof(char));

  *buf = uv_buf_init(bytes, bytes == 0 ? 0 : (unsigned int)len);
}

static void ccjs_dgram_recv_cb(
  uv_udp_t* handle,
  ssize_t nread,
  const uv_buf_t* buf,
  const struct sockaddr* addr,
  unsigned flags
) {
  (void)flags;
  ccjs_dgram_socket* socket = handle == 0 ? 0 : (ccjs_dgram_socket*)handle->data;

  if (socket == 0) {
    return;
  }

  if (nread < 0) {
    ccjs_libuv_loop_report_status(socket->loop, CCJS_ERR_FIELD);
  } else if (nread > 0 && socket->recv != 0) {
    char host[INET6_ADDRSTRLEN] = { 0 };
    int port = 0;

    if (addr != 0 && addr->sa_family == AF_INET) {
      const struct sockaddr_in* ip4 = (const struct sockaddr_in*)addr;
      uv_ip4_name(ip4, host, sizeof(host));
      port = ntohs(ip4->sin_port);
    }

    ccjs_status status = socket->recv(socket->user, socket, buf->base, (size_t)nread, host, port);

    if (status != CCJS_OK) {
      ccjs_libuv_loop_report_status(socket->loop, status);
    }
  }

  if (buf != 0 && buf->base != 0) {
    socket->allocator->free(socket->allocator->user, buf->base, buf->len, _Alignof(char));
  }
}

static void ccjs_dgram_send_cb(uv_udp_send_t* request, int status) {
  ccjs_dgram_send_request* send = request == 0 ? 0 : (ccjs_dgram_send_request*)request->data;

  if (send == 0 || send->socket == 0) {
    return;
  }

  ccjs_dgram_socket* socket = send->socket;

  if (status != 0) {
    ccjs_libuv_loop_report_status(socket->loop, CCJS_ERR_FIELD);
  }

  ccjs_libuv_loop_release_request(socket->loop);

  if (send->bytes != 0) {
    socket->allocator->free(socket->allocator->user, send->bytes, send->len, _Alignof(char));
  }

  socket->allocator->free(socket->allocator->user, send, sizeof(ccjs_dgram_send_request), _Alignof(ccjs_dgram_send_request));
}

static void ccjs_dgram_close_cb(uv_handle_t* handle) {
  ccjs_dgram_socket* socket = handle == 0 ? 0 : (ccjs_dgram_socket*)handle->data;

  if (socket == 0) {
    return;
  }

  if (socket->retained) {
    ccjs_libuv_loop_release_request(socket->loop);
  }

  socket->allocator->free(socket->allocator->user, socket, sizeof(ccjs_dgram_socket), _Alignof(ccjs_dgram_socket));
}

#else

struct ccjs_dgram_socket {
  int unused;
};

ccjs_status ccjs_dgram_socket_new(
  ccjs_loop* loop,
  ccjs_dgram_recv_fn recv,
  void* user,
  ccjs_dgram_socket** out
) {
  (void)loop;
  (void)recv;
  (void)user;

  if (out == 0) {
    return CCJS_ERR_TYPE;
  }

  *out = 0;
  return CCJS_ERR_UNSUPPORTED;
}

ccjs_status ccjs_dgram_bind(ccjs_dgram_socket* socket, const char* host, int port) {
  (void)socket;
  (void)host;
  (void)port;
  return CCJS_ERR_UNSUPPORTED;
}

ccjs_status ccjs_dgram_recv_start(ccjs_dgram_socket* socket) {
  (void)socket;
  return CCJS_ERR_UNSUPPORTED;
}

ccjs_status ccjs_dgram_recv_stop(ccjs_dgram_socket* socket) {
  (void)socket;
  return CCJS_ERR_UNSUPPORTED;
}

ccjs_status ccjs_dgram_send(ccjs_dgram_socket* socket, const char* bytes, size_t len, const char* host, int port) {
  (void)socket;
  (void)bytes;
  (void)len;
  (void)host;
  (void)port;
  return CCJS_ERR_UNSUPPORTED;
}

ccjs_status ccjs_dgram_local_port(ccjs_dgram_socket* socket, int* out_port) {
  (void)socket;

  if (out_port == 0) {
    return CCJS_ERR_TYPE;
  }

  *out_port = 0;
  return CCJS_ERR_UNSUPPORTED;
}

void ccjs_dgram_close(ccjs_dgram_socket* socket) {
  (void)socket;
}

#endif
