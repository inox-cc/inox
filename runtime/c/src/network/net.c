#include "ccjs/net.h"

#ifdef CCJS_LOOP_BACKEND_LIBUV
#include "../async/loop-libuv-internal.h"

#include <stdlib.h>
#include <string.h>

typedef struct ccjs_net_write_request {
  uv_write_t request;
  ccjs_net_socket* socket;
  char* bytes;
  size_t len;
} ccjs_net_write_request;

typedef struct ccjs_net_connect_request {
  uv_connect_t request;
  ccjs_net_socket* socket;
} ccjs_net_connect_request;

struct ccjs_net_server {
  ccjs_loop* loop;
  ccjs_allocator* allocator;
  ccjs_net_connection_fn connection;
  void* user;
  uv_tcp_t handle;
  int closing;
  int retained;
};

struct ccjs_net_socket {
  ccjs_loop* loop;
  ccjs_allocator* allocator;
  ccjs_net_data_fn data;
  ccjs_net_close_fn close;
  void* user;
  uv_tcp_t handle;
  int closing;
  int retained;
};

static ccjs_status ccjs_net_ip4_addr(const char* host, int port, struct sockaddr_in* out);
static ccjs_status ccjs_net_socket_init(ccjs_loop* loop, ccjs_net_socket** out);
static void ccjs_net_connection_cb(uv_stream_t* server_handle, int status);
static void ccjs_net_connect_cb(uv_connect_t* request, int status);
static void ccjs_net_alloc_cb(uv_handle_t* handle, size_t suggested_size, uv_buf_t* buf);
static void ccjs_net_read_cb(uv_stream_t* stream, ssize_t nread, const uv_buf_t* buf);
static void ccjs_net_write_cb(uv_write_t* request, int status);
static void ccjs_net_server_close_cb(uv_handle_t* handle);
static void ccjs_net_socket_close_cb(uv_handle_t* handle);

ccjs_status ccjs_net_server_new(
  ccjs_loop* loop,
  ccjs_net_connection_fn connection,
  void* user,
  ccjs_net_server** out
) {
  if (loop == 0 || loop->allocator == 0 || connection == 0 || out == 0) {
    return CCJS_ERR_TYPE;
  }

  *out = 0;
  uv_loop_t* uv_loop = ccjs_libuv_loop_handle(loop);

  if (uv_loop == 0) {
    return CCJS_ERR_TYPE;
  }

  ccjs_allocator* allocator = loop->allocator;
  ccjs_net_server* server = allocator->alloc(allocator->user, sizeof(ccjs_net_server), _Alignof(ccjs_net_server));

  if (server == 0) {
    return CCJS_ERR_OOM;
  }

  memset(server, 0, sizeof(ccjs_net_server));
  server->loop = loop;
  server->allocator = allocator;
  server->connection = connection;
  server->user = user;

  if (uv_tcp_init(uv_loop, &server->handle) != 0) {
    allocator->free(allocator->user, server, sizeof(ccjs_net_server), _Alignof(ccjs_net_server));
    return CCJS_ERR_FIELD;
  }

  if (ccjs_libuv_loop_retain_request(loop) != CCJS_OK) {
    uv_close((uv_handle_t*)&server->handle, 0);
    uv_run(uv_loop, UV_RUN_NOWAIT);
    allocator->free(allocator->user, server, sizeof(ccjs_net_server), _Alignof(ccjs_net_server));
    return CCJS_ERR_TYPE;
  }

  server->retained = 1;
  server->handle.data = server;
  *out = server;

  return CCJS_OK;
}

ccjs_status ccjs_net_server_listen(ccjs_net_server* server, const char* host, int port, int backlog) {
  if (server == 0 || server->closing) {
    return CCJS_ERR_TYPE;
  }

  struct sockaddr_in addr;
  ccjs_status status = ccjs_net_ip4_addr(host == 0 ? "0.0.0.0" : host, port, &addr);

  if (status != CCJS_OK) {
    return status;
  }

  if (uv_tcp_bind(&server->handle, (const struct sockaddr*)&addr, 0) != 0) {
    return CCJS_ERR_FIELD;
  }

  return uv_listen((uv_stream_t*)&server->handle, backlog <= 0 ? 128 : backlog, ccjs_net_connection_cb) == 0
           ? CCJS_OK
           : CCJS_ERR_FIELD;
}

ccjs_status ccjs_net_server_local_port(ccjs_net_server* server, int* out_port) {
  if (server == 0 || out_port == 0) {
    return CCJS_ERR_TYPE;
  }

  struct sockaddr_storage addr;
  int len = sizeof(addr);

  if (uv_tcp_getsockname(&server->handle, (struct sockaddr*)&addr, &len) != 0) {
    return CCJS_ERR_FIELD;
  }

  if (((struct sockaddr*)&addr)->sa_family != AF_INET) {
    return CCJS_ERR_UNSUPPORTED;
  }

  *out_port = ntohs(((struct sockaddr_in*)&addr)->sin_port);

  return CCJS_OK;
}

void ccjs_net_server_close(ccjs_net_server* server) {
  if (server == 0 || server->closing) {
    return;
  }

  server->closing = 1;
  uv_close((uv_handle_t*)&server->handle, ccjs_net_server_close_cb);
}

ccjs_status ccjs_net_connect(
  ccjs_loop* loop,
  const char* host,
  int port,
  ccjs_net_connect_fn connect,
  ccjs_net_data_fn data,
  ccjs_net_close_fn close,
  void* user,
  ccjs_net_socket** out
) {
  if (loop == 0 || host == 0 || connect == 0 || out == 0) {
    return CCJS_ERR_TYPE;
  }

  *out = 0;
  ccjs_net_socket* socket = 0;
  ccjs_status status = ccjs_net_socket_init(loop, &socket);

  if (status != CCJS_OK) {
    return status;
  }

  socket->data = data;
  socket->close = close;
  socket->user = user;

  ccjs_allocator* allocator = loop->allocator;
  ccjs_net_connect_request* request =
    allocator->alloc(allocator->user, sizeof(ccjs_net_connect_request), _Alignof(ccjs_net_connect_request));

  if (request == 0) {
    ccjs_net_socket_close(socket);
    return CCJS_ERR_OOM;
  }

  memset(request, 0, sizeof(ccjs_net_connect_request));
  request->socket = socket;
  request->request.data = request;

  struct sockaddr_in addr;
  status = ccjs_net_ip4_addr(host, port, &addr);

  if (status != CCJS_OK) {
    allocator->free(allocator->user, request, sizeof(ccjs_net_connect_request), _Alignof(ccjs_net_connect_request));
    ccjs_net_socket_close(socket);
    return status;
  }

  status = ccjs_libuv_loop_retain_request(loop);

  if (status != CCJS_OK) {
    allocator->free(allocator->user, request, sizeof(ccjs_net_connect_request), _Alignof(ccjs_net_connect_request));
    ccjs_net_socket_close(socket);
    return status;
  }

  socket->handle.data = socket;
  socket->user = user;
  *out = socket;

  if (uv_tcp_connect(&request->request, &socket->handle, (const struct sockaddr*)&addr, ccjs_net_connect_cb) != 0) {
    ccjs_libuv_loop_release_request(loop);
    allocator->free(allocator->user, request, sizeof(ccjs_net_connect_request), _Alignof(ccjs_net_connect_request));
    ccjs_net_socket_close(socket);
    *out = 0;
    return CCJS_ERR_FIELD;
  }

  request->request.data = request;
  request->request.handle->data = connect;

  return CCJS_OK;
}

void ccjs_net_socket_set_callbacks(
  ccjs_net_socket* socket,
  ccjs_net_data_fn data,
  ccjs_net_close_fn close,
  void* user
) {
  if (socket == 0) {
    return;
  }

  socket->data = data;
  socket->close = close;
  socket->user = user;
}

ccjs_status ccjs_net_socket_read_start(ccjs_net_socket* socket) {
  if (socket == 0 || socket->closing || socket->data == 0) {
    return CCJS_ERR_TYPE;
  }

  return uv_read_start((uv_stream_t*)&socket->handle, ccjs_net_alloc_cb, ccjs_net_read_cb) == 0 ? CCJS_OK : CCJS_ERR_FIELD;
}

ccjs_status ccjs_net_socket_read_stop(ccjs_net_socket* socket) {
  if (socket == 0) {
    return CCJS_ERR_TYPE;
  }

  return uv_read_stop((uv_stream_t*)&socket->handle) == 0 ? CCJS_OK : CCJS_ERR_FIELD;
}

ccjs_status ccjs_net_socket_write(ccjs_net_socket* socket, const char* bytes, size_t len) {
  if (socket == 0 || socket->closing || (bytes == 0 && len != 0)) {
    return CCJS_ERR_TYPE;
  }

  ccjs_allocator* allocator = socket->allocator;
  ccjs_net_write_request* request =
    allocator->alloc(allocator->user, sizeof(ccjs_net_write_request), _Alignof(ccjs_net_write_request));

  if (request == 0) {
    return CCJS_ERR_OOM;
  }

  memset(request, 0, sizeof(ccjs_net_write_request));
  request->socket = socket;
  request->len = len;

  if (len != 0) {
    request->bytes = allocator->alloc(allocator->user, len, _Alignof(char));

    if (request->bytes == 0) {
      allocator->free(allocator->user, request, sizeof(ccjs_net_write_request), _Alignof(ccjs_net_write_request));
      return CCJS_ERR_OOM;
    }

    memcpy(request->bytes, bytes, len);
  }

  ccjs_status status = ccjs_libuv_loop_retain_request(socket->loop);

  if (status != CCJS_OK) {
    if (request->bytes != 0) {
      allocator->free(allocator->user, request->bytes, len, _Alignof(char));
    }

    allocator->free(allocator->user, request, sizeof(ccjs_net_write_request), _Alignof(ccjs_net_write_request));
    return status;
  }

  uv_buf_t buffer = uv_buf_init(request->bytes == 0 ? "" : request->bytes, (unsigned int)len);
  request->request.data = request;

  if (uv_write(&request->request, (uv_stream_t*)&socket->handle, &buffer, 1, ccjs_net_write_cb) != 0) {
    ccjs_libuv_loop_release_request(socket->loop);

    if (request->bytes != 0) {
      allocator->free(allocator->user, request->bytes, len, _Alignof(char));
    }

    allocator->free(allocator->user, request, sizeof(ccjs_net_write_request), _Alignof(ccjs_net_write_request));
    return CCJS_ERR_FIELD;
  }

  return CCJS_OK;
}

void ccjs_net_socket_close(ccjs_net_socket* socket) {
  if (socket == 0 || socket->closing) {
    return;
  }

  socket->closing = 1;
  uv_read_stop((uv_stream_t*)&socket->handle);
  uv_close((uv_handle_t*)&socket->handle, ccjs_net_socket_close_cb);
}

static ccjs_status ccjs_net_ip4_addr(const char* host, int port, struct sockaddr_in* out) {
  if (host == 0 || out == 0 || port < 0 || port > 65535) {
    return CCJS_ERR_TYPE;
  }

  return uv_ip4_addr(host, port, out) == 0 ? CCJS_OK : CCJS_ERR_UNSUPPORTED;
}

static ccjs_status ccjs_net_socket_init(ccjs_loop* loop, ccjs_net_socket** out) {
  if (loop == 0 || loop->allocator == 0 || out == 0) {
    return CCJS_ERR_TYPE;
  }

  *out = 0;
  uv_loop_t* uv_loop = ccjs_libuv_loop_handle(loop);

  if (uv_loop == 0) {
    return CCJS_ERR_TYPE;
  }

  ccjs_allocator* allocator = loop->allocator;
  ccjs_net_socket* socket = allocator->alloc(allocator->user, sizeof(ccjs_net_socket), _Alignof(ccjs_net_socket));

  if (socket == 0) {
    return CCJS_ERR_OOM;
  }

  memset(socket, 0, sizeof(ccjs_net_socket));
  socket->loop = loop;
  socket->allocator = allocator;

  if (uv_tcp_init(uv_loop, &socket->handle) != 0) {
    allocator->free(allocator->user, socket, sizeof(ccjs_net_socket), _Alignof(ccjs_net_socket));
    return CCJS_ERR_FIELD;
  }

  if (ccjs_libuv_loop_retain_request(loop) != CCJS_OK) {
    uv_close((uv_handle_t*)&socket->handle, 0);
    uv_run(uv_loop, UV_RUN_NOWAIT);
    allocator->free(allocator->user, socket, sizeof(ccjs_net_socket), _Alignof(ccjs_net_socket));
    return CCJS_ERR_TYPE;
  }

  socket->retained = 1;
  socket->handle.data = socket;
  *out = socket;

  return CCJS_OK;
}

static void ccjs_net_connection_cb(uv_stream_t* server_handle, int status) {
  ccjs_net_server* server = server_handle == 0 ? 0 : (ccjs_net_server*)server_handle->data;

  if (server == 0) {
    return;
  }

  if (status != 0) {
    ccjs_libuv_loop_report_status(server->loop, CCJS_ERR_FIELD);
    return;
  }

  ccjs_net_socket* socket = 0;
  ccjs_status ccjs_status_value = ccjs_net_socket_init(server->loop, &socket);

  if (ccjs_status_value != CCJS_OK) {
    ccjs_libuv_loop_report_status(server->loop, ccjs_status_value);
    return;
  }

  if (uv_accept(server_handle, (uv_stream_t*)&socket->handle) != 0) {
    ccjs_net_socket_close(socket);
    ccjs_libuv_loop_report_status(server->loop, CCJS_ERR_FIELD);
    return;
  }

  ccjs_status_value = server->connection(server->user, server, socket);

  if (ccjs_status_value != CCJS_OK) {
    ccjs_libuv_loop_report_status(server->loop, ccjs_status_value);
  }
}

static void ccjs_net_connect_cb(uv_connect_t* request, int status) {
  ccjs_net_connect_request* connect_request = request == 0 ? 0 : (ccjs_net_connect_request*)request->data;

  if (connect_request == 0 || connect_request->socket == 0) {
    return;
  }

  ccjs_net_socket* socket = connect_request->socket;
  ccjs_net_connect_fn connect = (ccjs_net_connect_fn)request->handle->data;
  ccjs_status connect_status = status == 0 ? CCJS_OK : CCJS_ERR_FIELD;

  ccjs_libuv_loop_release_request(socket->loop);

  if (connect != 0) {
    ccjs_status callback_status = connect(socket->user, socket, connect_status);

    if (callback_status != CCJS_OK) {
      ccjs_libuv_loop_report_status(socket->loop, callback_status);
    }
  }

  socket->handle.data = socket;
  socket->allocator->free(
    socket->allocator->user,
    connect_request,
    sizeof(ccjs_net_connect_request),
    _Alignof(ccjs_net_connect_request)
  );
}

static void ccjs_net_alloc_cb(uv_handle_t* handle, size_t suggested_size, uv_buf_t* buf) {
  ccjs_net_socket* socket = handle == 0 ? 0 : (ccjs_net_socket*)handle->data;
  size_t len = suggested_size == 0 ? 65536 : suggested_size;

  if (socket == 0 || socket->allocator == 0) {
    *buf = uv_buf_init(0, 0);
    return;
  }

  char* bytes = socket->allocator->alloc(socket->allocator->user, len, _Alignof(char));

  *buf = uv_buf_init(bytes, bytes == 0 ? 0 : (unsigned int)len);
}

static void ccjs_net_read_cb(uv_stream_t* stream, ssize_t nread, const uv_buf_t* buf) {
  ccjs_net_socket* socket = stream == 0 ? 0 : (ccjs_net_socket*)stream->data;

  if (socket == 0) {
    return;
  }

  if (nread < 0) {
    ccjs_net_socket_close(socket);
  } else if (nread > 0 && socket->data != 0) {
    ccjs_status status = socket->data(socket->user, socket, buf->base, (size_t)nread);

    if (status != CCJS_OK) {
      ccjs_libuv_loop_report_status(socket->loop, status);
    }
  }

  if (buf != 0 && buf->base != 0) {
    socket->allocator->free(socket->allocator->user, buf->base, buf->len, _Alignof(char));
  }
}

static void ccjs_net_write_cb(uv_write_t* request, int status) {
  ccjs_net_write_request* write = request == 0 ? 0 : (ccjs_net_write_request*)request->data;

  if (write == 0 || write->socket == 0) {
    return;
  }

  ccjs_net_socket* socket = write->socket;

  if (status != 0) {
    ccjs_libuv_loop_report_status(socket->loop, CCJS_ERR_FIELD);
  }

  ccjs_libuv_loop_release_request(socket->loop);

  if (write->bytes != 0) {
    socket->allocator->free(socket->allocator->user, write->bytes, write->len, _Alignof(char));
  }

  socket->allocator->free(socket->allocator->user, write, sizeof(ccjs_net_write_request), _Alignof(ccjs_net_write_request));
}

static void ccjs_net_server_close_cb(uv_handle_t* handle) {
  ccjs_net_server* server = handle == 0 ? 0 : (ccjs_net_server*)handle->data;

  if (server == 0) {
    return;
  }

  if (server->retained) {
    ccjs_libuv_loop_release_request(server->loop);
  }

  server->allocator->free(server->allocator->user, server, sizeof(ccjs_net_server), _Alignof(ccjs_net_server));
}

static void ccjs_net_socket_close_cb(uv_handle_t* handle) {
  ccjs_net_socket* socket = handle == 0 ? 0 : (ccjs_net_socket*)handle->data;

  if (socket == 0) {
    return;
  }

  if (socket->close != 0) {
    socket->close(socket->user, socket);
  }

  if (socket->retained) {
    ccjs_libuv_loop_release_request(socket->loop);
  }

  socket->allocator->free(socket->allocator->user, socket, sizeof(ccjs_net_socket), _Alignof(ccjs_net_socket));
}

#else

struct ccjs_net_server {
  int unused;
};

struct ccjs_net_socket {
  int unused;
};

ccjs_status ccjs_net_server_new(
  ccjs_loop* loop,
  ccjs_net_connection_fn connection,
  void* user,
  ccjs_net_server** out
) {
  (void)loop;
  (void)connection;
  (void)user;

  if (out == 0) {
    return CCJS_ERR_TYPE;
  }

  *out = 0;
  return CCJS_ERR_UNSUPPORTED;
}

ccjs_status ccjs_net_server_listen(ccjs_net_server* server, const char* host, int port, int backlog) {
  (void)server;
  (void)host;
  (void)port;
  (void)backlog;
  return CCJS_ERR_UNSUPPORTED;
}

ccjs_status ccjs_net_server_local_port(ccjs_net_server* server, int* out_port) {
  (void)server;

  if (out_port == 0) {
    return CCJS_ERR_TYPE;
  }

  *out_port = 0;
  return CCJS_ERR_UNSUPPORTED;
}

void ccjs_net_server_close(ccjs_net_server* server) {
  (void)server;
}

ccjs_status ccjs_net_connect(
  ccjs_loop* loop,
  const char* host,
  int port,
  ccjs_net_connect_fn connect,
  ccjs_net_data_fn data,
  ccjs_net_close_fn close,
  void* user,
  ccjs_net_socket** out
) {
  (void)loop;
  (void)host;
  (void)port;
  (void)connect;
  (void)data;
  (void)close;
  (void)user;

  if (out == 0) {
    return CCJS_ERR_TYPE;
  }

  *out = 0;
  return CCJS_ERR_UNSUPPORTED;
}

void ccjs_net_socket_set_callbacks(
  ccjs_net_socket* socket,
  ccjs_net_data_fn data,
  ccjs_net_close_fn close,
  void* user
) {
  (void)socket;
  (void)data;
  (void)close;
  (void)user;
}

ccjs_status ccjs_net_socket_read_start(ccjs_net_socket* socket) {
  (void)socket;
  return CCJS_ERR_UNSUPPORTED;
}

ccjs_status ccjs_net_socket_read_stop(ccjs_net_socket* socket) {
  (void)socket;
  return CCJS_ERR_UNSUPPORTED;
}

ccjs_status ccjs_net_socket_write(ccjs_net_socket* socket, const char* bytes, size_t len) {
  (void)socket;
  (void)bytes;
  (void)len;
  return CCJS_ERR_UNSUPPORTED;
}

void ccjs_net_socket_close(ccjs_net_socket* socket) {
  (void)socket;
}

#endif
