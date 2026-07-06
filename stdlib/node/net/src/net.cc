#include "inox/net.h"

NetServer::NetServer(inox_net_server* server) : server_(server) {}

NetSocket::NetSocket(inox_net_socket* socket) : socket_(socket) {}

#ifdef INOX_LOOP_BACKEND_LIBUV
#include "loop-libuv-internal.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

typedef struct inox_net_write_request {
  uv_write_t request;
  inox_net_socket* socket;
  char* bytes;
  size_t len;
  int close_after;
  inox_net_socket_write_fn callback;
  void* user;
} inox_net_write_request;

typedef struct inox_net_connect_request {
  uv_connect_t request;
  inox_net_socket* socket;
  inox_net_connect_fn connect;
} inox_net_connect_request;

struct inox_net_server {
  inox_loop* loop;
  inox_allocator* allocator;
  inox_net_connection_fn connection;
  void* user;
  inox_net_server_fn listening;
  void* listening_user;
  inox_net_server_fn close;
  void* close_user;
  inox_net_server_error_fn error;
  void* error_user;
  uv_tcp_t handle;
  int closing;
  int retained;
};

struct inox_net_socket {
  inox_loop* loop;
  inox_allocator* allocator;
  inox_net_data_fn data;
  void* data_user;
  inox_net_close_fn close;
  void* close_user;
  inox_net_socket_fn connect_event;
  void* connect_user;
  inox_net_socket_fn ready;
  void* ready_user;
  inox_net_socket_fn end;
  void* end_user;
  inox_net_socket_fn close_event;
  void* close_event_user;
  inox_net_socket_error_fn error;
  void* error_user;
  inox_net_socket_fn drain;
  void* drain_user;
  void* user;
  uv_tcp_t handle;
  size_t bytes_read;
  size_t bytes_written;
  int closing;
  int retained;
  int utf8_encoding;
};

static inox_status inox_net_ip4_addr(const char* host, int port, struct sockaddr_in* out);
static inox_status inox_net_resolve_ip4_addr(inox_loop* loop, const char* host, int port, struct sockaddr_in* out);
static inox_status inox_net_sockaddr_to_address(const struct sockaddr* addr, inox_net_address* out);
static inox_status inox_net_socket_init(inox_loop* loop, inox_net_socket** out);
static inox_status inox_net_socket_write_internal(
  inox_net_socket* socket,
  const char* bytes,
  size_t len,
  int close_after,
  inox_net_socket_write_fn callback,
  void* user
);
static void inox_net_server_report_status(inox_net_server* server, inox_status status);
static void inox_net_socket_report_status(inox_net_socket* socket, inox_status status);
static void inox_net_connection_cb(uv_stream_t* server_handle, int status);
static void inox_net_connect_cb(uv_connect_t* request, int status);
static void inox_net_alloc_cb(uv_handle_t* handle, size_t suggested_size, uv_buf_t* buf);
static void inox_net_read_cb(uv_stream_t* stream, ssize_t nread, const uv_buf_t* buf);
static void inox_net_write_cb(uv_write_t* request, int status);
static void inox_net_server_close_cb(uv_handle_t* handle);
static void inox_net_socket_close_cb(uv_handle_t* handle);

inox_status NetServer::create(
  inox_loop* loop,
  inox_net_connection_fn connection,
  void* user,
  inox_net_server** out
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
  inox_net_server* server = (inox_net_server*)allocator->alloc(allocator->user, sizeof(inox_net_server), alignof(inox_net_server));

  if (server == 0) {
    return INOX_ERR_OOM;
  }

  memset(server, 0, sizeof(inox_net_server));
  server->loop = loop;
  server->allocator = allocator;
  server->connection = connection;
  server->user = user;

  if (uv_tcp_init(uv_loop, &server->handle) != 0) {
    allocator->free(allocator->user, server, sizeof(inox_net_server), alignof(inox_net_server));
    return INOX_ERR_FIELD;
  }

  if (inox_libuv_loop_retain_request(loop) != INOX_OK) {
    uv_close((uv_handle_t*)&server->handle, 0);
    uv_run(uv_loop, UV_RUN_NOWAIT);
    allocator->free(allocator->user, server, sizeof(inox_net_server), alignof(inox_net_server));
    return INOX_ERR_TYPE;
  }

  server->retained = 1;
  server->handle.data = server;
  *out = server;

  return INOX_OK;
}

inox_status NetServer::onConnection(inox_net_connection_fn connection, void* user) const {
  inox_net_server* server = server_;

  if (server == 0 || server->closing) {
    return INOX_ERR_TYPE;
  }

  server->connection = connection;
  server->user = user;

  return INOX_OK;
}

inox_status NetServer::onListening(inox_net_server_fn listening, void* user) const {
  inox_net_server* server = server_;

  if (server == 0 || server->closing) {
    return INOX_ERR_TYPE;
  }

  server->listening = listening;
  server->listening_user = user;

  return INOX_OK;
}

inox_status NetServer::onClose(inox_net_server_fn close, void* user) const {
  inox_net_server* server = server_;

  if (server == 0 || server->closing) {
    return INOX_ERR_TYPE;
  }

  server->close = close;
  server->close_user = user;

  return INOX_OK;
}

inox_status NetServer::onError(inox_net_server_error_fn error, void* user) const {
  inox_net_server* server = server_;

  if (server == 0 || server->closing) {
    return INOX_ERR_TYPE;
  }

  server->error = error;
  server->error_user = user;

  return INOX_OK;
}

inox_status NetServer::listen(const char* host, int port, int backlog) const {
  inox_net_server* server = server_;

  if (server == 0 || server->closing) {
    return INOX_ERR_TYPE;
  }

  struct sockaddr_in addr;
  inox_status status = inox_net_ip4_addr(host == 0 ? "0.0.0.0" : host, port, &addr);

  if (status != INOX_OK) {
    return status;
  }

  if (uv_tcp_bind(&server->handle, (const struct sockaddr*)&addr, 0) != 0) {
    return INOX_ERR_FIELD;
  }

  if (uv_listen((uv_stream_t*)&server->handle, backlog <= 0 ? 128 : backlog, inox_net_connection_cb) != 0) {
    return INOX_ERR_FIELD;
  }

  if (server->listening != 0) {
    inox_status callback_status = server->listening(server->listening_user, server);

    if (callback_status != INOX_OK) {
      inox_net_server_report_status(server, callback_status);
      return callback_status;
    }
  }

  return INOX_OK;
}

inox_status NetServer::address(inox_net_address* out) const {
  inox_net_server* server = server_;

  if (server == 0 || out == 0) {
    return INOX_ERR_TYPE;
  }

  struct sockaddr_storage addr;
  int len = sizeof(addr);

  if (uv_tcp_getsockname(&server->handle, (struct sockaddr*)&addr, &len) != 0) {
    return INOX_ERR_FIELD;
  }

  return inox_net_sockaddr_to_address((const struct sockaddr*)&addr, out);
}

inox_status NetServer::localPort(int* out_port) const {
  inox_net_server* server = server_;

  if (server == 0 || out_port == 0) {
    return INOX_ERR_TYPE;
  }

  inox_net_address address;
  inox_status status = this->address(&address);

  if (status != INOX_OK) {
    return status;
  }

  *out_port = address.port;

  return INOX_OK;
}

void NetServer::close() const {
  inox_net_server* server = server_;

  if (server == 0 || server->closing) {
    return;
  }

  server->closing = 1;
  uv_close((uv_handle_t*)&server->handle, inox_net_server_close_cb);
}

inox_status NetSocket::connect(
  inox_loop* loop,
  const char* host,
  int port,
  inox_net_connect_fn connect,
  inox_net_data_fn data,
  inox_net_close_fn close,
  void* user,
  inox_net_socket** out
) {
  if (loop == 0 || host == 0 || out == 0) {
    return INOX_ERR_TYPE;
  }

  *out = 0;
  inox_net_socket* socket = 0;
  inox_status status = inox_net_socket_init(loop, &socket);

  if (status != INOX_OK) {
    return status;
  }

  inox_allocator* allocator = loop->allocator;
  inox_net_connect_request* request =
    (inox_net_connect_request*)allocator->alloc(allocator->user, sizeof(inox_net_connect_request), alignof(inox_net_connect_request));

  if (request == 0) {
    NetSocket(socket).close();
    return INOX_ERR_OOM;
  }

  memset(request, 0, sizeof(inox_net_connect_request));
  request->socket = socket;
  request->connect = connect;
  request->request.data = request;

  struct sockaddr_in addr;
  status = inox_net_resolve_ip4_addr(loop, host, port, &addr);

  if (status != INOX_OK) {
    allocator->free(allocator->user, request, sizeof(inox_net_connect_request), alignof(inox_net_connect_request));
    NetSocket(socket).close();
    return status;
  }

  status = inox_libuv_loop_retain_request(loop);

  if (status != INOX_OK) {
    allocator->free(allocator->user, request, sizeof(inox_net_connect_request), alignof(inox_net_connect_request));
    NetSocket(socket).close();
    return status;
  }

  socket->handle.data = socket;

  if (uv_tcp_connect(&request->request, &socket->handle, (const struct sockaddr*)&addr, inox_net_connect_cb) != 0) {
    inox_libuv_loop_release_request(loop);
    allocator->free(allocator->user, request, sizeof(inox_net_connect_request), alignof(inox_net_connect_request));
    NetSocket(socket).close();
    return INOX_ERR_FIELD;
  }

  socket->data = data;
  socket->data_user = user;
  socket->close = close;
  socket->close_user = user;
  socket->user = user;
  *out = socket;

  return INOX_OK;
}

void NetSocket::setCallbacks(inox_net_data_fn data, inox_net_close_fn close, void* user) const {
  inox_net_socket* socket = socket_;

  if (socket == 0) {
    return;
  }

  socket->data = data;
  socket->data_user = user;
  socket->close = close;
  socket->close_user = user;
  socket->user = user;
}

inox_status NetSocket::onConnect(inox_net_socket_fn connect, void* user) const {
  inox_net_socket* socket = socket_;

  if (socket == 0 || socket->closing) {
    return INOX_ERR_TYPE;
  }

  socket->connect_event = connect;
  socket->connect_user = user;

  return INOX_OK;
}

inox_status NetSocket::onReady(inox_net_socket_fn ready, void* user) const {
  inox_net_socket* socket = socket_;

  if (socket == 0 || socket->closing) {
    return INOX_ERR_TYPE;
  }

  socket->ready = ready;
  socket->ready_user = user;

  return INOX_OK;
}

inox_status NetSocket::onData(inox_net_data_fn data, void* user) const {
  inox_net_socket* socket = socket_;

  if (socket == 0 || socket->closing) {
    return INOX_ERR_TYPE;
  }

  socket->data = data;
  socket->data_user = user;

  return INOX_OK;
}

inox_status NetSocket::onEnd(inox_net_socket_fn end, void* user) const {
  inox_net_socket* socket = socket_;

  if (socket == 0 || socket->closing) {
    return INOX_ERR_TYPE;
  }

  socket->end = end;
  socket->end_user = user;

  return INOX_OK;
}

inox_status NetSocket::onClose(inox_net_socket_fn close, void* user) const {
  inox_net_socket* socket = socket_;

  if (socket == 0 || socket->closing) {
    return INOX_ERR_TYPE;
  }

  socket->close_event = close;
  socket->close_event_user = user;

  return INOX_OK;
}

inox_status NetSocket::onError(inox_net_socket_error_fn error, void* user) const {
  inox_net_socket* socket = socket_;

  if (socket == 0 || socket->closing) {
    return INOX_ERR_TYPE;
  }

  socket->error = error;
  socket->error_user = user;

  return INOX_OK;
}

inox_status NetSocket::onDrain(inox_net_socket_fn drain, void* user) const {
  inox_net_socket* socket = socket_;

  if (socket == 0 || socket->closing) {
    return INOX_ERR_TYPE;
  }

  socket->drain = drain;
  socket->drain_user = user;

  return INOX_OK;
}

inox_status NetSocket::readStart() const {
  inox_net_socket* socket = socket_;

  if (socket == 0 || socket->closing || (socket->data == 0 && socket->end == 0)) {
    return INOX_ERR_TYPE;
  }

  return uv_read_start((uv_stream_t*)&socket->handle, inox_net_alloc_cb, inox_net_read_cb) == 0 ? INOX_OK : INOX_ERR_FIELD;
}

inox_status NetSocket::readStop() const {
  inox_net_socket* socket = socket_;

  if (socket == 0) {
    return INOX_ERR_TYPE;
  }

  return uv_read_stop((uv_stream_t*)&socket->handle) == 0 ? INOX_OK : INOX_ERR_FIELD;
}

inox_status NetSocket::setEncoding(inox::StringView encoding) const {
  inox_net_socket* socket = socket_;

  if (socket == 0 || socket->closing) {
    return INOX_ERR_TYPE;
  }

  if (encoding.len == 0) {
    socket->utf8_encoding = 0;
    return INOX_OK;
  }

  if (
    (encoding.len == 4 && memcmp(encoding.bytes, "utf8", 4) == 0) ||
    (encoding.len == 5 && memcmp(encoding.bytes, "utf-8", 5) == 0)
  ) {
    socket->utf8_encoding = 1;
    return INOX_OK;
  }

  return INOX_ERR_UNSUPPORTED;
}

inox_status NetSocket::address(inox_net_address* out) const {
  inox_net_socket* socket = socket_;

  if (socket == 0 || out == 0) {
    return INOX_ERR_TYPE;
  }

  struct sockaddr_storage addr;
  int len = sizeof(addr);

  if (uv_tcp_getsockname(&socket->handle, (struct sockaddr*)&addr, &len) != 0) {
    return INOX_ERR_FIELD;
  }

  return inox_net_sockaddr_to_address((const struct sockaddr*)&addr, out);
}

inox_status NetSocket::remoteAddress(inox_net_address* out) const {
  inox_net_socket* socket = socket_;

  if (socket == 0 || out == 0) {
    return INOX_ERR_TYPE;
  }

  struct sockaddr_storage addr;
  int len = sizeof(addr);

  if (uv_tcp_getpeername(&socket->handle, (struct sockaddr*)&addr, &len) != 0) {
    return INOX_ERR_FIELD;
  }

  return inox_net_sockaddr_to_address((const struct sockaddr*)&addr, out);
}

inox_status NetSocket::bytesRead(size_t* out_bytes) const {
  inox_net_socket* socket = socket_;

  if (socket == 0 || out_bytes == 0) {
    return INOX_ERR_TYPE;
  }

  *out_bytes = socket->bytes_read;

  return INOX_OK;
}

inox_status NetSocket::bytesWritten(size_t* out_bytes) const {
  inox_net_socket* socket = socket_;

  if (socket == 0 || out_bytes == 0) {
    return INOX_ERR_TYPE;
  }

  *out_bytes = socket->bytes_written;

  return INOX_OK;
}

inox_status NetSocket::setNoDelay(bool enabled) const {
  inox_net_socket* socket = socket_;

  if (socket == 0 || socket->closing) {
    return INOX_ERR_TYPE;
  }

  return uv_tcp_nodelay(&socket->handle, enabled ? 1 : 0) == 0 ? INOX_OK : INOX_ERR_FIELD;
}

inox_status NetSocket::setKeepAlive(bool enabled, unsigned int initial_delay) const {
  inox_net_socket* socket = socket_;

  if (socket == 0 || socket->closing) {
    return INOX_ERR_TYPE;
  }

  return uv_tcp_keepalive(&socket->handle, enabled ? 1 : 0, initial_delay) == 0 ? INOX_OK : INOX_ERR_FIELD;
}

inox_status NetSocket::ref() const {
  inox_net_socket* socket = socket_;

  if (socket == 0) {
    return INOX_ERR_TYPE;
  }

  uv_ref((uv_handle_t*)&socket->handle);

  return INOX_OK;
}

inox_status NetSocket::unref() const {
  inox_net_socket* socket = socket_;

  if (socket == 0) {
    return INOX_ERR_TYPE;
  }

  uv_unref((uv_handle_t*)&socket->handle);

  return INOX_OK;
}

inox_status NetSocket::write(inox::StringView bytes) const {
  return inox_net_socket_write_internal(socket_, bytes.bytes, bytes.len, 0, 0, 0);
}

inox_status NetSocket::writeAndClose(inox::StringView bytes) const {
  return inox_net_socket_write_internal(socket_, bytes.bytes, bytes.len, 1, 0, 0);
}

inox_status NetSocket::write(inox::StringView bytes, inox_net_socket_write_fn callback, void* user) const {
  return inox_net_socket_write_internal(socket_, bytes.bytes, bytes.len, 0, callback, user);
}

inox_status NetSocket::end(inox::StringView bytes) const {
  return inox_net_socket_write_internal(socket_, bytes.bytes, bytes.len, 1, 0, 0);
}

inox_status NetSocket::end(inox::StringView bytes, inox_net_socket_write_fn callback, void* user) const {
  return inox_net_socket_write_internal(socket_, bytes.bytes, bytes.len, 1, callback, user);
}

static inox_status inox_net_socket_write_internal(
  inox_net_socket* socket,
  const char* bytes,
  size_t len,
  int close_after,
  inox_net_socket_write_fn callback,
  void* user
) {
  if (socket == 0 || socket->closing || (bytes == 0 && len != 0)) {
    return INOX_ERR_TYPE;
  }

  inox_allocator* allocator = socket->allocator;
  inox_net_write_request* request =
    (inox_net_write_request*)allocator->alloc(allocator->user, sizeof(inox_net_write_request), alignof(inox_net_write_request));

  if (request == 0) {
    return INOX_ERR_OOM;
  }

  memset(request, 0, sizeof(inox_net_write_request));
  request->socket = socket;
  request->len = len;
  request->close_after = close_after;
  request->callback = callback;
  request->user = user;

  if (len != 0) {
    request->bytes = (char*)allocator->alloc(allocator->user, len, alignof(char));

    if (request->bytes == 0) {
      allocator->free(allocator->user, request, sizeof(inox_net_write_request), alignof(inox_net_write_request));
      return INOX_ERR_OOM;
    }

    memcpy(request->bytes, bytes, len);
  }

  inox_status status = inox_libuv_loop_retain_request(socket->loop);

  if (status != INOX_OK) {
    if (request->bytes != 0) {
      allocator->free(allocator->user, request->bytes, len, alignof(char));
    }

    allocator->free(allocator->user, request, sizeof(inox_net_write_request), alignof(inox_net_write_request));
    return status;
  }

  uv_buf_t buffer = uv_buf_init(request->bytes, (unsigned int)len);
  request->request.data = request;

  if (uv_write(&request->request, (uv_stream_t*)&socket->handle, &buffer, 1, inox_net_write_cb) != 0) {
    inox_libuv_loop_release_request(socket->loop);

    if (request->bytes != 0) {
      allocator->free(allocator->user, request->bytes, len, alignof(char));
    }

    allocator->free(allocator->user, request, sizeof(inox_net_write_request), alignof(inox_net_write_request));
    return INOX_ERR_FIELD;
  }

  return INOX_OK;
}

void NetSocket::close() const {
  inox_net_socket* socket = socket_;

  if (socket == 0 || socket->closing) {
    return;
  }

  socket->closing = 1;
  uv_read_stop((uv_stream_t*)&socket->handle);
  uv_close((uv_handle_t*)&socket->handle, inox_net_socket_close_cb);
}

inox_status NetSocket::destroy() const {
  inox_net_socket* socket = socket_;

  if (socket == 0) {
    return INOX_ERR_TYPE;
  }

  close();

  return INOX_OK;
}

static inox_status inox_net_ip4_addr(const char* host, int port, struct sockaddr_in* out) {
  if (host == 0 || out == 0 || port < 0 || port > 65535) {
    return INOX_ERR_TYPE;
  }

  return uv_ip4_addr(host, port, out) == 0 ? INOX_OK : INOX_ERR_UNSUPPORTED;
}

static inox_status inox_net_resolve_ip4_addr(inox_loop* loop, const char* host, int port, struct sockaddr_in* out) {
  inox_status status = inox_net_ip4_addr(host, port, out);

  if (status == INOX_OK) {
    return INOX_OK;
  }

  uv_loop_t* uv_loop = inox_libuv_loop_handle(loop);

  if (uv_loop == 0 || host == 0 || out == 0 || port < 0 || port > 65535) {
    return status;
  }

  char service[16];
  int written = snprintf(service, sizeof(service), "%d", port);

  if (written <= 0 || (size_t)written >= sizeof(service)) {
    return INOX_ERR_UNSUPPORTED;
  }

  struct addrinfo hints;
  memset(&hints, 0, sizeof(hints));
  hints.ai_family = AF_INET;
  hints.ai_socktype = SOCK_STREAM;
  hints.ai_protocol = IPPROTO_TCP;

  uv_getaddrinfo_t resolver;
  memset(&resolver, 0, sizeof(resolver));

  if (uv_getaddrinfo(uv_loop, &resolver, 0, host, service, &hints) != 0) {
    return status;
  }

  inox_status resolve_status = INOX_ERR_UNSUPPORTED;

  for (struct addrinfo* item = resolver.addrinfo; item != 0; item = item->ai_next) {
    if (item->ai_family == AF_INET && item->ai_addr != 0 && item->ai_addrlen <= sizeof(struct sockaddr_in)) {
      memcpy(out, item->ai_addr, item->ai_addrlen);
      resolve_status = INOX_OK;
      break;
    }
  }

  uv_freeaddrinfo(resolver.addrinfo);
  return resolve_status;
}

static inox_status inox_net_sockaddr_to_address(const struct sockaddr* addr, inox_net_address* out) {
  if (addr == 0 || out == 0) {
    return INOX_ERR_TYPE;
  }

  memset(out, 0, sizeof(inox_net_address));

  if (addr->sa_family != AF_INET) {
    return INOX_ERR_UNSUPPORTED;
  }

  const struct sockaddr_in* ip4 = (const struct sockaddr_in*)addr;
  uv_ip4_name(ip4, out->address, sizeof(out->address));
  out->family = "IPv4";
  out->port = ntohs(ip4->sin_port);

  return INOX_OK;
}

static inox_status inox_net_socket_init(inox_loop* loop, inox_net_socket** out) {
  if (loop == 0 || loop->allocator == 0 || out == 0) {
    return INOX_ERR_TYPE;
  }

  *out = 0;
  uv_loop_t* uv_loop = inox_libuv_loop_handle(loop);

  if (uv_loop == 0) {
    return INOX_ERR_TYPE;
  }

  inox_allocator* allocator = loop->allocator;
  inox_net_socket* socket = (inox_net_socket*)allocator->alloc(allocator->user, sizeof(inox_net_socket), alignof(inox_net_socket));

  if (socket == 0) {
    return INOX_ERR_OOM;
  }

  memset(socket, 0, sizeof(inox_net_socket));
  socket->loop = loop;
  socket->allocator = allocator;

  if (uv_tcp_init(uv_loop, &socket->handle) != 0) {
    allocator->free(allocator->user, socket, sizeof(inox_net_socket), alignof(inox_net_socket));
    return INOX_ERR_FIELD;
  }

  if (inox_libuv_loop_retain_request(loop) != INOX_OK) {
    uv_close((uv_handle_t*)&socket->handle, 0);
    uv_run(uv_loop, UV_RUN_NOWAIT);
    allocator->free(allocator->user, socket, sizeof(inox_net_socket), alignof(inox_net_socket));
    return INOX_ERR_TYPE;
  }

  socket->retained = 1;
  socket->handle.data = socket;
  *out = socket;

  return INOX_OK;
}

static void inox_net_server_report_status(inox_net_server* server, inox_status status) {
  if (server == 0 || status == INOX_OK) {
    return;
  }

  if (server->error != 0) {
    inox_status callback_status = server->error(server->error_user, server, status);

    if (callback_status != INOX_OK) {
      inox_libuv_loop_report_status(server->loop, callback_status);
    }

    return;
  }

  inox_libuv_loop_report_status(server->loop, status);
}

static void inox_net_socket_report_status(inox_net_socket* socket, inox_status status) {
  if (socket == 0 || status == INOX_OK) {
    return;
  }

  if (socket->error != 0) {
    inox_status callback_status = socket->error(socket->error_user, socket, status);

    if (callback_status != INOX_OK) {
      inox_libuv_loop_report_status(socket->loop, callback_status);
    }

    return;
  }

  inox_libuv_loop_report_status(socket->loop, status);
}

static void inox_net_connection_cb(uv_stream_t* server_handle, int status) {
  inox_net_server* server = server_handle == 0 ? 0 : (inox_net_server*)server_handle->data;

  if (server == 0) {
    return;
  }

  if (status != 0) {
    inox_net_server_report_status(server, INOX_ERR_FIELD);
    return;
  }

  inox_net_socket* socket = 0;
  inox_status inox_status_value = inox_net_socket_init(server->loop, &socket);

  if (inox_status_value != INOX_OK) {
    inox_net_server_report_status(server, inox_status_value);
    return;
  }

  if (uv_accept(server_handle, (uv_stream_t*)&socket->handle) != 0) {
    NetSocket(socket).close();
    inox_net_server_report_status(server, INOX_ERR_FIELD);
    return;
  }

  if (server->connection == 0) {
    NetSocket(socket).close();
    return;
  }

  inox_status_value = server->connection(server->user, server, socket);

  if (inox_status_value != INOX_OK) {
    inox_net_server_report_status(server, inox_status_value);
  }
}

static void inox_net_connect_cb(uv_connect_t* request, int status) {
  inox_net_connect_request* connect_request = request == 0 ? 0 : (inox_net_connect_request*)request->data;

  if (connect_request == 0 || connect_request->socket == 0) {
    return;
  }

  inox_net_socket* socket = connect_request->socket;
  inox_net_connect_fn connect = connect_request->connect;
  inox_status connect_status = status == 0 ? INOX_OK : INOX_ERR_FIELD;

  inox_libuv_loop_release_request(socket->loop);

  if (connect != 0) {
    inox_status callback_status = connect(socket->user, socket, connect_status);

    if (callback_status != INOX_OK) {
      inox_net_socket_report_status(socket, callback_status);
    }
  }
  if (connect_status != INOX_OK) {
    inox_net_socket_report_status(socket, connect_status);
    NetSocket(socket).close();
  } else {
    if (socket->connect_event != 0) {
      inox_status callback_status = socket->connect_event(socket->connect_user, socket);

      if (callback_status != INOX_OK) {
        inox_net_socket_report_status(socket, callback_status);
      }
    }

    if (socket->ready != 0) {
      inox_status callback_status = socket->ready(socket->ready_user, socket);

      if (callback_status != INOX_OK) {
        inox_net_socket_report_status(socket, callback_status);
      }
    }
  }

  socket->allocator->free(
    socket->allocator->user,
    connect_request,
    sizeof(inox_net_connect_request),
    alignof(inox_net_connect_request)
  );
}

static void inox_net_alloc_cb(uv_handle_t* handle, size_t suggested_size, uv_buf_t* buf) {
  inox_net_socket* socket = handle == 0 ? 0 : (inox_net_socket*)handle->data;
  size_t len = suggested_size == 0 ? 65536 : suggested_size;

  if (socket == 0 || socket->allocator == 0) {
    *buf = uv_buf_init(0, 0);
    return;
  }

  char* bytes = (char*)socket->allocator->alloc(socket->allocator->user, len, alignof(char));

  *buf = uv_buf_init(bytes, bytes == 0 ? 0 : (unsigned int)len);
}

static void inox_net_read_cb(uv_stream_t* stream, ssize_t nread, const uv_buf_t* buf) {
  inox_net_socket* socket = stream == 0 ? 0 : (inox_net_socket*)stream->data;

  if (socket == 0) {
    return;
  }

  if (nread < 0) {
    if (nread == UV_EOF && socket->end != 0) {
      inox_status status = socket->end(socket->end_user, socket);

      if (status != INOX_OK) {
        inox_net_socket_report_status(socket, status);
      }
    } else if (nread != UV_EOF) {
      inox_net_socket_report_status(socket, INOX_ERR_FIELD);
    }

    NetSocket(socket).close();
  } else if (nread > 0 && socket->data != 0) {
    socket->bytes_read += (size_t)nread;
    inox_status status = socket->data(socket->data_user, socket, buf->base, (size_t)nread);

    if (status != INOX_OK) {
      inox_net_socket_report_status(socket, status);
    }
  }

  if (buf != 0 && buf->base != 0) {
    socket->allocator->free(socket->allocator->user, buf->base, buf->len, alignof(char));
  }
}

static void inox_net_write_cb(uv_write_t* request, int status) {
  inox_net_write_request* write = request == 0 ? 0 : (inox_net_write_request*)request->data;

  if (write == 0 || write->socket == 0) {
    return;
  }

  inox_net_socket* socket = write->socket;

  if (status != 0) {
    inox_net_socket_report_status(socket, INOX_ERR_FIELD);
  } else {
    socket->bytes_written += write->len;
  }

  inox_libuv_loop_release_request(socket->loop);

  if (write->callback != 0) {
    inox_status callback_status = write->callback(write->user, socket, status == 0 ? INOX_OK : INOX_ERR_FIELD);

    if (callback_status != INOX_OK) {
      inox_net_socket_report_status(socket, callback_status);
    }
  }

  if (status == 0 && socket->drain != 0) {
    inox_status callback_status = socket->drain(socket->drain_user, socket);

    if (callback_status != INOX_OK) {
      inox_net_socket_report_status(socket, callback_status);
    }
  }

  if (write->close_after) {
    NetSocket(socket).close();
  }

  if (write->bytes != 0) {
    socket->allocator->free(socket->allocator->user, write->bytes, write->len, alignof(char));
  }

  socket->allocator->free(socket->allocator->user, write, sizeof(inox_net_write_request), alignof(inox_net_write_request));
}

static void inox_net_server_close_cb(uv_handle_t* handle) {
  inox_net_server* server = handle == 0 ? 0 : (inox_net_server*)handle->data;

  if (server == 0) {
    return;
  }

  if (server->close != 0) {
    inox_status status = server->close(server->close_user, server);

    if (status != INOX_OK) {
      inox_net_server_report_status(server, status);
    }
  }

  if (server->retained) {
    inox_libuv_loop_release_request(server->loop);
  }

  server->allocator->free(server->allocator->user, server, sizeof(inox_net_server), alignof(inox_net_server));
}

static void inox_net_socket_close_cb(uv_handle_t* handle) {
  inox_net_socket* socket = handle == 0 ? 0 : (inox_net_socket*)handle->data;

  if (socket == 0) {
    return;
  }

  if (socket->close != 0) {
    socket->close(socket->close_user, socket);
  }

  if (socket->close_event != 0) {
    inox_status status = socket->close_event(socket->close_event_user, socket);

    if (status != INOX_OK) {
      inox_net_socket_report_status(socket, status);
    }
  }

  if (socket->retained) {
    inox_libuv_loop_release_request(socket->loop);
  }

  socket->allocator->free(socket->allocator->user, socket, sizeof(inox_net_socket), alignof(inox_net_socket));
}

#else

struct inox_net_server {
  int unused;
};

struct inox_net_socket {
  int unused;
};

inox_status NetServer::create(
  inox_loop* loop,
  inox_net_connection_fn connection,
  void* user,
  inox_net_server** out
) {
  (void)loop;
  (void)connection;
  (void)user;

  if (out == 0) {
    return INOX_ERR_TYPE;
  }

  *out = 0;
  return INOX_ERR_UNSUPPORTED;
}

inox_status NetServer::onConnection(inox_net_connection_fn connection, void* user) const {
  (void)server_;
  (void)connection;
  (void)user;
  return INOX_ERR_UNSUPPORTED;
}

inox_status NetServer::onListening(inox_net_server_fn listening, void* user) const {
  (void)server_;
  (void)listening;
  (void)user;
  return INOX_ERR_UNSUPPORTED;
}

inox_status NetServer::onClose(inox_net_server_fn close, void* user) const {
  (void)server_;
  (void)close;
  (void)user;
  return INOX_ERR_UNSUPPORTED;
}

inox_status NetServer::onError(inox_net_server_error_fn error, void* user) const {
  (void)server_;
  (void)error;
  (void)user;
  return INOX_ERR_UNSUPPORTED;
}

inox_status NetServer::listen(const char* host, int port, int backlog) const {
  (void)server_;
  (void)host;
  (void)port;
  (void)backlog;
  return INOX_ERR_UNSUPPORTED;
}

inox_status NetServer::address(inox_net_address* out) const {
  (void)server_;

  if (out == 0) {
    return INOX_ERR_TYPE;
  }

  out->address[0] = '\0';
  out->family = 0;
  out->port = 0;
  return INOX_ERR_UNSUPPORTED;
}

inox_status NetServer::localPort(int* out_port) const {
  (void)server_;

  if (out_port == 0) {
    return INOX_ERR_TYPE;
  }

  *out_port = 0;
  return INOX_ERR_UNSUPPORTED;
}

void NetServer::close() const {
  (void)server_;
}

inox_status NetSocket::connect(
  inox_loop* loop,
  const char* host,
  int port,
  inox_net_connect_fn connect,
  inox_net_data_fn data,
  inox_net_close_fn close,
  void* user,
  inox_net_socket** out
) {
  (void)loop;
  (void)host;
  (void)port;
  (void)connect;
  (void)data;
  (void)close;
  (void)user;

  if (out == 0) {
    return INOX_ERR_TYPE;
  }

  *out = 0;
  return INOX_ERR_UNSUPPORTED;
}

void NetSocket::setCallbacks(inox_net_data_fn data, inox_net_close_fn close, void* user) const {
  (void)socket_;
  (void)data;
  (void)close;
  (void)user;
}

inox_status NetSocket::onConnect(inox_net_socket_fn connect, void* user) const {
  (void)socket_;
  (void)connect;
  (void)user;
  return INOX_ERR_UNSUPPORTED;
}

inox_status NetSocket::onReady(inox_net_socket_fn ready, void* user) const {
  (void)socket_;
  (void)ready;
  (void)user;
  return INOX_ERR_UNSUPPORTED;
}

inox_status NetSocket::onData(inox_net_data_fn data, void* user) const {
  (void)socket_;
  (void)data;
  (void)user;
  return INOX_ERR_UNSUPPORTED;
}

inox_status NetSocket::onEnd(inox_net_socket_fn end, void* user) const {
  (void)socket_;
  (void)end;
  (void)user;
  return INOX_ERR_UNSUPPORTED;
}

inox_status NetSocket::onClose(inox_net_socket_fn close, void* user) const {
  (void)socket_;
  (void)close;
  (void)user;
  return INOX_ERR_UNSUPPORTED;
}

inox_status NetSocket::onError(inox_net_socket_error_fn error, void* user) const {
  (void)socket_;
  (void)error;
  (void)user;
  return INOX_ERR_UNSUPPORTED;
}

inox_status NetSocket::onDrain(inox_net_socket_fn drain, void* user) const {
  (void)socket_;
  (void)drain;
  (void)user;
  return INOX_ERR_UNSUPPORTED;
}

inox_status NetSocket::readStart() const {
  (void)socket_;
  return INOX_ERR_UNSUPPORTED;
}

inox_status NetSocket::readStop() const {
  (void)socket_;
  return INOX_ERR_UNSUPPORTED;
}

inox_status NetSocket::setEncoding(inox::StringView encoding) const {
  (void)socket_;
  (void)encoding;
  return INOX_ERR_UNSUPPORTED;
}

inox_status NetSocket::address(inox_net_address* out) const {
  (void)socket_;

  if (out == 0) {
    return INOX_ERR_TYPE;
  }

  out->address[0] = '\0';
  out->family = 0;
  out->port = 0;
  return INOX_ERR_UNSUPPORTED;
}

inox_status NetSocket::remoteAddress(inox_net_address* out) const {
  (void)socket_;

  if (out == 0) {
    return INOX_ERR_TYPE;
  }

  out->address[0] = '\0';
  out->family = 0;
  out->port = 0;
  return INOX_ERR_UNSUPPORTED;
}

inox_status NetSocket::bytesRead(size_t* out_bytes) const {
  (void)socket_;

  if (out_bytes == 0) {
    return INOX_ERR_TYPE;
  }

  *out_bytes = 0;
  return INOX_ERR_UNSUPPORTED;
}

inox_status NetSocket::bytesWritten(size_t* out_bytes) const {
  (void)socket_;

  if (out_bytes == 0) {
    return INOX_ERR_TYPE;
  }

  *out_bytes = 0;
  return INOX_ERR_UNSUPPORTED;
}

inox_status NetSocket::setNoDelay(bool enabled) const {
  (void)socket_;
  (void)enabled;
  return INOX_ERR_UNSUPPORTED;
}

inox_status NetSocket::setKeepAlive(bool enabled, unsigned int initial_delay) const {
  (void)socket_;
  (void)enabled;
  (void)initial_delay;
  return INOX_ERR_UNSUPPORTED;
}

inox_status NetSocket::ref() const {
  (void)socket_;
  return INOX_ERR_UNSUPPORTED;
}

inox_status NetSocket::unref() const {
  (void)socket_;
  return INOX_ERR_UNSUPPORTED;
}

inox_status NetSocket::write(inox::StringView bytes) const {
  (void)socket_;
  (void)bytes;
  return INOX_ERR_UNSUPPORTED;
}

inox_status NetSocket::write(inox::StringView bytes, inox_net_socket_write_fn callback, void* user) const {
  (void)socket_;
  (void)bytes;
  (void)callback;
  (void)user;
  return INOX_ERR_UNSUPPORTED;
}

inox_status NetSocket::end(inox::StringView bytes) const {
  (void)socket_;
  (void)bytes;
  return INOX_ERR_UNSUPPORTED;
}

inox_status NetSocket::end(inox::StringView bytes, inox_net_socket_write_fn callback, void* user) const {
  (void)socket_;
  (void)bytes;
  (void)callback;
  (void)user;
  return INOX_ERR_UNSUPPORTED;
}

inox_status NetSocket::writeAndClose(inox::StringView bytes) const {
  (void)socket_;
  (void)bytes;
  return INOX_ERR_UNSUPPORTED;
}

inox_status NetSocket::destroy() const {
  (void)socket_;
  return INOX_ERR_UNSUPPORTED;
}

void NetSocket::close() const {
  (void)socket_;
}

#endif
