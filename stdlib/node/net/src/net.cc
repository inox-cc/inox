#include "inox/net.h"

#include <string.h>

#include "inox/string.h"

NetServer::NetServer() : server_(0) {}

NetServer::NetServer(inox_net_server* server) : server_(server) {}

inox_net_server* NetServer::raw() const {
  return server_;
}

NetSocket::NetSocket() : socket_(0) {}

NetSocket::NetSocket(inox_net_socket* socket) : socket_(socket) {}

inox_net_socket* NetSocket::raw() const {
  return socket_;
}

static void inox_net_throw_failed(const char* message) {
  inox::throw_value(inox::String(message == 0 ? "TypeError: net operation failed" : message));
}

static bool inox_net_copy_host(inox::StringView host, const char* fallback, char* out, size_t out_len) {
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

#include <stdio.h>
#include <stdlib.h>

struct NetWriteRequest {
  uv_write_t request;
  inox_net_socket* socket;
  char* bytes;
  size_t length;
  int close_after;
  NetSocketWriteFn callback;
  void* user;
};

struct NetConnectRequest {
  uv_connect_t request;
  inox_net_socket* socket;
  NetConnectFn connect;
};

struct inox_net_server {
  inox_loop* loop;
  inox_allocator* allocator;
  NetConnectionFn connection;
  void* user;
  NetServerFn listening;
  void* listening_user;
  NetServerFn close;
  void* close_user;
  NetServerErrorFn error;
  void* error_user;
  uv_tcp_t handle;
  int closing;
  int retained;
};

struct inox_net_socket {
  inox_loop* loop;
  inox_allocator* allocator;
  NetDataFn data;
  void* data_user;
  NetCloseFn close;
  void* close_user;
  NetSocketFn connect_event;
  void* connect_user;
  NetSocketFn ready;
  void* ready_user;
  NetSocketFn end;
  void* end_user;
  NetSocketFn close_event;
  void* close_event_user;
  NetSocketErrorFn error;
  void* error_user;
  NetSocketFn drain;
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
static inox_status inox_net_sockaddr_to_address(const struct sockaddr* addr, NetAddress* out);
static inox_status inox_net_socket_init(inox_loop* loop, inox_net_socket** out);
static void inox_net_server_report_status(inox_net_server* server, inox_status status);
static void inox_net_socket_report_status(inox_net_socket* socket, inox_status status);
static void inox_net_connection_cb(uv_stream_t* server_handle, int status);
static void inox_net_connect_cb(uv_connect_t* request, int status);
static void inox_net_alloc_cb(uv_handle_t* handle, size_t suggested_size, uv_buf_t* buf);
static void inox_net_read_cb(uv_stream_t* stream, ssize_t nread, const uv_buf_t* buf);
static void inox_net_write_cb(uv_write_t* request, int status);
static void inox_net_server_close_cb(uv_handle_t* handle);
static void inox_net_socket_close_cb(uv_handle_t* handle);

NetServer NetServer::create(
  inox_loop* loop,
  NetConnectionFn connection,
  void* user
) {
  if (loop == 0 || loop->allocator == 0) {
    inox_net_throw_failed("TypeError: NetServer.create failed");
    return NetServer();
  }

  uv_loop_t* uv_loop = inox_libuv_loop_handle(loop);

  if (uv_loop == 0) {
    inox_net_throw_failed("TypeError: NetServer.create failed");
    return NetServer();
  }

  inox_allocator* allocator = loop->allocator;
  inox_net_server* server = (inox_net_server*)allocator->alloc(allocator->user, sizeof(inox_net_server), alignof(inox_net_server));

  if (server == 0) {
    inox_net_throw_failed("TypeError: NetServer allocation failed");
    return NetServer();
  }

  memset(server, 0, sizeof(inox_net_server));
  server->loop = loop;
  server->allocator = allocator;
  server->connection = connection;
  server->user = user;

  if (uv_tcp_init(uv_loop, &server->handle) != 0) {
    allocator->free(allocator->user, server, sizeof(inox_net_server), alignof(inox_net_server));
    inox_net_throw_failed("TypeError: NetServer.create failed");
    return NetServer();
  }

  if (inox_libuv_loop_retain_request(loop) != INOX_OK) {
    uv_close((uv_handle_t*)&server->handle, 0);
    uv_run(uv_loop, UV_RUN_NOWAIT);
    allocator->free(allocator->user, server, sizeof(inox_net_server), alignof(inox_net_server));
    inox_net_throw_failed("TypeError: NetServer.create failed");
    return NetServer();
  }

  server->retained = 1;
  server->handle.data = server;

  return NetServer(server);
}

void NetServer::onConnection(NetConnectionFn connection, void* user) const {
  inox_net_server* server = server_;

  if (server == 0 || server->closing) {
    inox_net_throw_failed("TypeError: NetServer.onConnection failed");
    return;
  }

  server->connection = connection;
  server->user = user;

}

void NetServer::onListening(NetServerFn listening, void* user) const {
  inox_net_server* server = server_;

  if (server == 0 || server->closing) {
    inox_net_throw_failed("TypeError: NetServer.onListening failed");
    return;
  }

  server->listening = listening;
  server->listening_user = user;

}

void NetServer::onClose(NetServerFn close, void* user) const {
  inox_net_server* server = server_;

  if (server == 0 || server->closing) {
    inox_net_throw_failed("TypeError: NetServer.onClose failed");
    return;
  }

  server->close = close;
  server->close_user = user;

}

void NetServer::onError(NetServerErrorFn error, void* user) const {
  inox_net_server* server = server_;

  if (server == 0 || server->closing) {
    inox_net_throw_failed("TypeError: NetServer.onError failed");
    return;
  }

  server->error = error;
  server->error_user = user;

}

void NetServer::listen(inox::StringView host, int port, int backlog) const {
  inox_net_server* server = server_;

  if (server == 0 || server->closing) {
    inox_net_throw_failed("TypeError: NetServer.listen failed");
    return;
  }

  struct sockaddr_in addr;
  char host_buffer[256];

  if (!inox_net_copy_host(host, "0.0.0.0", host_buffer, sizeof(host_buffer))) {
    inox_net_throw_failed("TypeError: NetServer.listen failed");
    return;
  }

  inox_status status = inox_net_ip4_addr(host_buffer, port, &addr);

  if (status != INOX_OK) {
    inox_net_throw_failed("TypeError: NetServer.listen failed");
    return;
  }

  if (uv_tcp_bind(&server->handle, (const struct sockaddr*)&addr, 0) != 0) {
    inox_net_throw_failed("TypeError: NetServer.listen failed");
    return;
  }

  if (uv_listen((uv_stream_t*)&server->handle, backlog <= 0 ? 128 : backlog, inox_net_connection_cb) != 0) {
    inox_net_throw_failed("TypeError: NetServer.listen failed");
    return;
  }

  if (server->listening != 0) {
    inox_status callback_status = server->listening(server->listening_user, server);

    if (callback_status != INOX_OK) {
      inox_net_server_report_status(server, callback_status);
      inox_net_throw_failed("TypeError: NetServer.listen callback failed");
      return;
    }
  }
}

NetAddress NetServer::address() const {
  NetAddress out = {};
  inox_net_server* server = server_;

  if (server == 0) {
    inox_net_throw_failed("TypeError: NetServer.address failed");
    return out;
  }

  struct sockaddr_storage addr;
  int len = sizeof(addr);

  if (uv_tcp_getsockname(&server->handle, (struct sockaddr*)&addr, &len) != 0) {
    inox_net_throw_failed("TypeError: NetServer.address failed");
    return out;
  }

  if (inox_net_sockaddr_to_address((const struct sockaddr*)&addr, &out) != INOX_OK) {
    inox_net_throw_failed("TypeError: NetServer.address failed");
  }

  return out;
}

int NetServer::localPort() const {
  return address().port;
}

void NetServer::close() const {
  inox_net_server* server = server_;

  if (server == 0 || server->closing) {
    return;
  }

  server->closing = 1;
  uv_close((uv_handle_t*)&server->handle, inox_net_server_close_cb);
}

NetSocket NetSocket::connect(
  inox_loop* loop,
  inox::StringView host,
  int port,
  NetConnectFn connect,
  NetDataFn data,
  NetCloseFn close,
  void* user
) {
  if (loop == 0) {
    inox_net_throw_failed("TypeError: NetSocket.connect failed");
    return NetSocket();
  }

  char host_buffer[256];

  if (!inox_net_copy_host(host, 0, host_buffer, sizeof(host_buffer))) {
    inox_net_throw_failed("TypeError: NetSocket.connect failed");
    return NetSocket();
  }

  inox_net_socket* socket = 0;
  inox_status status = inox_net_socket_init(loop, &socket);

  if (status != INOX_OK) {
    inox_net_throw_failed("TypeError: NetSocket.connect failed");
    return NetSocket();
  }

  inox_allocator* allocator = loop->allocator;
  NetConnectRequest* request =
    (NetConnectRequest*)allocator->alloc(allocator->user, sizeof(NetConnectRequest), alignof(NetConnectRequest));

  if (request == 0) {
    NetSocket(socket).close();
    inox_net_throw_failed("TypeError: NetSocket connect allocation failed");
    return NetSocket();
  }

  memset(request, 0, sizeof(NetConnectRequest));
  request->socket = socket;
  request->connect = connect;
  request->request.data = request;

  struct sockaddr_in addr;
  status = inox_net_resolve_ip4_addr(loop, host_buffer, port, &addr);

  if (status != INOX_OK) {
    allocator->free(allocator->user, request, sizeof(NetConnectRequest), alignof(NetConnectRequest));
    NetSocket(socket).close();
    inox_net_throw_failed("TypeError: NetSocket.connect failed");
    return NetSocket();
  }

  status = inox_libuv_loop_retain_request(loop);

  if (status != INOX_OK) {
    allocator->free(allocator->user, request, sizeof(NetConnectRequest), alignof(NetConnectRequest));
    NetSocket(socket).close();
    inox_net_throw_failed("TypeError: NetSocket.connect failed");
    return NetSocket();
  }

  socket->handle.data = socket;

  if (uv_tcp_connect(&request->request, &socket->handle, (const struct sockaddr*)&addr, inox_net_connect_cb) != 0) {
    inox_libuv_loop_release_request(loop);
    allocator->free(allocator->user, request, sizeof(NetConnectRequest), alignof(NetConnectRequest));
    NetSocket(socket).close();
    inox_net_throw_failed("TypeError: NetSocket.connect failed");
    return NetSocket();
  }

  socket->data = data;
  socket->data_user = user;
  socket->close = close;
  socket->close_user = user;
  socket->user = user;

  return NetSocket(socket);
}

void NetSocket::setCallbacks(NetDataFn data, NetCloseFn close, void* user) const {
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

void NetSocket::onConnect(NetSocketFn connect, void* user) const {
  inox_net_socket* socket = socket_;

  if (socket == 0 || socket->closing) {
    inox_net_throw_failed("TypeError: NetSocket.onConnect failed");
    return;
  }

  socket->connect_event = connect;
  socket->connect_user = user;

}

void NetSocket::onReady(NetSocketFn ready, void* user) const {
  inox_net_socket* socket = socket_;

  if (socket == 0 || socket->closing) {
    inox_net_throw_failed("TypeError: NetSocket.onReady failed");
    return;
  }

  socket->ready = ready;
  socket->ready_user = user;

}

void NetSocket::onData(NetDataFn data, void* user) const {
  inox_net_socket* socket = socket_;

  if (socket == 0 || socket->closing) {
    inox_net_throw_failed("TypeError: NetSocket.onData failed");
    return;
  }

  socket->data = data;
  socket->data_user = user;

}

void NetSocket::onEnd(NetSocketFn end, void* user) const {
  inox_net_socket* socket = socket_;

  if (socket == 0 || socket->closing) {
    inox_net_throw_failed("TypeError: NetSocket.onEnd failed");
    return;
  }

  socket->end = end;
  socket->end_user = user;

}

void NetSocket::onClose(NetSocketFn close, void* user) const {
  inox_net_socket* socket = socket_;

  if (socket == 0 || socket->closing) {
    inox_net_throw_failed("TypeError: NetSocket.onClose failed");
    return;
  }

  socket->close_event = close;
  socket->close_event_user = user;

}

void NetSocket::onError(NetSocketErrorFn error, void* user) const {
  inox_net_socket* socket = socket_;

  if (socket == 0 || socket->closing) {
    inox_net_throw_failed("TypeError: NetSocket.onError failed");
    return;
  }

  socket->error = error;
  socket->error_user = user;

}

void NetSocket::onDrain(NetSocketFn drain, void* user) const {
  inox_net_socket* socket = socket_;

  if (socket == 0 || socket->closing) {
    inox_net_throw_failed("TypeError: NetSocket.onDrain failed");
    return;
  }

  socket->drain = drain;
  socket->drain_user = user;

}

void NetSocket::readStart() const {
  inox_net_socket* socket = socket_;

  if (socket == 0 || socket->closing || (socket->data == 0 && socket->end == 0)) {
    inox_net_throw_failed("TypeError: NetSocket.readStart failed");
    return;
  }

  if (uv_read_start((uv_stream_t*)&socket->handle, inox_net_alloc_cb, inox_net_read_cb) != 0) {
    inox_net_throw_failed("TypeError: NetSocket.readStart failed");
  }
}

void NetSocket::readStop() const {
  inox_net_socket* socket = socket_;

  if (socket == 0) {
    inox_net_throw_failed("TypeError: NetSocket.readStop failed");
    return;
  }

  if (uv_read_stop((uv_stream_t*)&socket->handle) != 0) {
    inox_net_throw_failed("TypeError: NetSocket.readStop failed");
  }
}

void NetSocket::setEncoding(inox::StringView encoding) const {
  inox_net_socket* socket = socket_;

  if (socket == 0 || socket->closing) {
    inox_net_throw_failed("TypeError: NetSocket.setEncoding failed");
    return;
  }

  if (encoding.len == 0) {
    socket->utf8_encoding = 0;
    return;
  }

  if (
    (encoding.len == 4 && memcmp(encoding.bytes, "utf8", 4) == 0) ||
    (encoding.len == 5 && memcmp(encoding.bytes, "utf-8", 5) == 0)
  ) {
    socket->utf8_encoding = 1;
    return;
  }

  inox_net_throw_failed("TypeError: NetSocket.setEncoding unsupported encoding");
}

NetAddress NetSocket::address() const {
  NetAddress out = {};
  inox_net_socket* socket = socket_;

  if (socket == 0) {
    inox_net_throw_failed("TypeError: NetSocket.address failed");
    return out;
  }

  struct sockaddr_storage addr;
  int len = sizeof(addr);

  if (uv_tcp_getsockname(&socket->handle, (struct sockaddr*)&addr, &len) != 0) {
    inox_net_throw_failed("TypeError: NetSocket.address failed");
    return out;
  }

  if (inox_net_sockaddr_to_address((const struct sockaddr*)&addr, &out) != INOX_OK) {
    inox_net_throw_failed("TypeError: NetSocket.address failed");
  }

  return out;
}

NetAddress NetSocket::remoteAddress() const {
  NetAddress out = {};
  inox_net_socket* socket = socket_;

  if (socket == 0) {
    inox_net_throw_failed("TypeError: NetSocket.remoteAddress failed");
    return out;
  }

  struct sockaddr_storage addr;
  int len = sizeof(addr);

  if (uv_tcp_getpeername(&socket->handle, (struct sockaddr*)&addr, &len) != 0) {
    inox_net_throw_failed("TypeError: NetSocket.remoteAddress failed");
    return out;
  }

  if (inox_net_sockaddr_to_address((const struct sockaddr*)&addr, &out) != INOX_OK) {
    inox_net_throw_failed("TypeError: NetSocket.remoteAddress failed");
  }

  return out;
}

size_t NetSocket::bytesRead() const {
  inox_net_socket* socket = socket_;

  if (socket == 0) {
    inox_net_throw_failed("TypeError: NetSocket.bytesRead failed");
    return 0;
  }

  return socket->bytes_read;
}

size_t NetSocket::bytesWritten() const {
  inox_net_socket* socket = socket_;

  if (socket == 0) {
    inox_net_throw_failed("TypeError: NetSocket.bytesWritten failed");
    return 0;
  }

  return socket->bytes_written;
}

void NetSocket::setNoDelay(bool enabled) const {
  inox_net_socket* socket = socket_;

  if (socket == 0 || socket->closing) {
    inox_net_throw_failed("TypeError: NetSocket.setNoDelay failed");
    return;
  }

  if (uv_tcp_nodelay(&socket->handle, enabled ? 1 : 0) != 0) {
    inox_net_throw_failed("TypeError: NetSocket.setNoDelay failed");
  }
}

void NetSocket::setKeepAlive(bool enabled, unsigned int initial_delay) const {
  inox_net_socket* socket = socket_;

  if (socket == 0 || socket->closing) {
    inox_net_throw_failed("TypeError: NetSocket.setKeepAlive failed");
    return;
  }

  if (uv_tcp_keepalive(&socket->handle, enabled ? 1 : 0, initial_delay) != 0) {
    inox_net_throw_failed("TypeError: NetSocket.setKeepAlive failed");
  }
}

void NetSocket::ref() const {
  inox_net_socket* socket = socket_;

  if (socket == 0) {
    inox_net_throw_failed("TypeError: NetSocket.ref failed");
    return;
  }

  uv_ref((uv_handle_t*)&socket->handle);
}

void NetSocket::unref() const {
  inox_net_socket* socket = socket_;

  if (socket == 0) {
    inox_net_throw_failed("TypeError: NetSocket.unref failed");
    return;
  }

  uv_unref((uv_handle_t*)&socket->handle);
}

void NetSocket::write(inox::StringView bytes, NetSocketWriteFn callback, void* user) const {
  inox_net_socket* socket = socket_;

  if (socket == 0 || socket->closing || (bytes.bytes == 0 && bytes.len != 0)) {
    inox_net_throw_failed("TypeError: NetSocket.write failed");
    return;
  }

  inox_allocator* allocator = socket->allocator;
  NetWriteRequest* request =
    (NetWriteRequest*)allocator->alloc(allocator->user, sizeof(NetWriteRequest), alignof(NetWriteRequest));

  if (request == 0) {
    inox_net_throw_failed("TypeError: NetSocket write allocation failed");
    return;
  }

  memset(request, 0, sizeof(NetWriteRequest));
  request->socket = socket;
  request->length = bytes.len;
  request->close_after = 0;
  request->callback = callback;
  request->user = user;

  if (bytes.len != 0) {
    request->bytes = (char*)allocator->alloc(allocator->user, bytes.len, alignof(char));

    if (request->bytes == 0) {
      allocator->free(allocator->user, request, sizeof(NetWriteRequest), alignof(NetWriteRequest));
      inox_net_throw_failed("TypeError: NetSocket write allocation failed");
      return;
    }

    memcpy(request->bytes, bytes.bytes, bytes.len);
  }

  inox_status status = inox_libuv_loop_retain_request(socket->loop);

  if (status != INOX_OK) {
    if (request->bytes != 0) {
      allocator->free(allocator->user, request->bytes, bytes.len, alignof(char));
    }

    allocator->free(allocator->user, request, sizeof(NetWriteRequest), alignof(NetWriteRequest));
    inox_net_throw_failed("TypeError: NetSocket.write failed");
    return;
  }

  uv_buf_t buffer = uv_buf_init(request->bytes, (unsigned int)bytes.len);
  request->request.data = request;

  if (uv_write(&request->request, (uv_stream_t*)&socket->handle, &buffer, 1, inox_net_write_cb) != 0) {
    inox_libuv_loop_release_request(socket->loop);

    if (request->bytes != 0) {
      allocator->free(allocator->user, request->bytes, bytes.len, alignof(char));
    }

    allocator->free(allocator->user, request, sizeof(NetWriteRequest), alignof(NetWriteRequest));
    inox_net_throw_failed("TypeError: NetSocket.write failed");
    return;
  }
}

void NetSocket::end(inox::StringView bytes, NetSocketWriteFn callback, void* user) const {
  inox_net_socket* socket = socket_;

  if (socket == 0 || socket->closing || (bytes.bytes == 0 && bytes.len != 0)) {
    inox_net_throw_failed("TypeError: NetSocket.end failed");
    return;
  }

  inox_allocator* allocator = socket->allocator;
  NetWriteRequest* request =
    (NetWriteRequest*)allocator->alloc(allocator->user, sizeof(NetWriteRequest), alignof(NetWriteRequest));

  if (request == 0) {
    inox_net_throw_failed("TypeError: NetSocket end allocation failed");
    return;
  }

  memset(request, 0, sizeof(NetWriteRequest));
  request->socket = socket;
  request->length = bytes.len;
  request->close_after = 1;
  request->callback = callback;
  request->user = user;

  if (bytes.len != 0) {
    request->bytes = (char*)allocator->alloc(allocator->user, bytes.len, alignof(char));

    if (request->bytes == 0) {
      allocator->free(allocator->user, request, sizeof(NetWriteRequest), alignof(NetWriteRequest));
      inox_net_throw_failed("TypeError: NetSocket end allocation failed");
      return;
    }

    memcpy(request->bytes, bytes.bytes, bytes.len);
  }

  inox_status status = inox_libuv_loop_retain_request(socket->loop);

  if (status != INOX_OK) {
    if (request->bytes != 0) {
      allocator->free(allocator->user, request->bytes, bytes.len, alignof(char));
    }

    allocator->free(allocator->user, request, sizeof(NetWriteRequest), alignof(NetWriteRequest));
    inox_net_throw_failed("TypeError: NetSocket.end failed");
    return;
  }

  uv_buf_t buffer = uv_buf_init(request->bytes, (unsigned int)bytes.len);
  request->request.data = request;

  if (uv_write(&request->request, (uv_stream_t*)&socket->handle, &buffer, 1, inox_net_write_cb) != 0) {
    inox_libuv_loop_release_request(socket->loop);

    if (request->bytes != 0) {
      allocator->free(allocator->user, request->bytes, bytes.len, alignof(char));
    }

    allocator->free(allocator->user, request, sizeof(NetWriteRequest), alignof(NetWriteRequest));
    inox_net_throw_failed("TypeError: NetSocket.end failed");
    return;
  }
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

void NetSocket::destroy() const {
  inox_net_socket* socket = socket_;

  if (socket == 0) {
    inox_net_throw_failed("TypeError: NetSocket.destroy failed");
    return;
  }

  close();
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

static inox_status inox_net_sockaddr_to_address(const struct sockaddr* addr, NetAddress* out) {
  if (addr == 0 || out == 0) {
    return INOX_ERR_TYPE;
  }

  memset(out->address, 0, sizeof(out->address));
  out->family = inox::StringView();
  out->port = 0;

  if (addr->sa_family != AF_INET) {
    return INOX_ERR_UNSUPPORTED;
  }

  const struct sockaddr_in* ip4 = (const struct sockaddr_in*)addr;
  uv_ip4_name(ip4, out->address, sizeof(out->address));
  out->family = inox::StringView("IPv4");
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
  NetConnectRequest* connect_request = request == 0 ? 0 : (NetConnectRequest*)request->data;

  if (connect_request == 0 || connect_request->socket == 0) {
    return;
  }

  inox_net_socket* socket = connect_request->socket;
  NetConnectFn connect = connect_request->connect;
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
    sizeof(NetConnectRequest),
    alignof(NetConnectRequest)
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
    socket->data(socket->data_user, NetSocket(socket), inox::StringView(buf->base, (size_t)nread));

    if (inox::thrown()) {
      inox_net_socket_report_status(socket, INOX_ERR_TYPE);
    }
  }

  if (buf != 0 && buf->base != 0) {
    socket->allocator->free(socket->allocator->user, buf->base, buf->len, alignof(char));
  }
}

static void inox_net_write_cb(uv_write_t* request, int status) {
  NetWriteRequest* write = request == 0 ? 0 : (NetWriteRequest*)request->data;

  if (write == 0 || write->socket == 0) {
    return;
  }

  inox_net_socket* socket = write->socket;

  if (status != 0) {
    inox_net_socket_report_status(socket, INOX_ERR_FIELD);
  } else {
    socket->bytes_written += write->length;
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
    socket->allocator->free(socket->allocator->user, write->bytes, write->length, alignof(char));
  }

  socket->allocator->free(socket->allocator->user, write, sizeof(NetWriteRequest), alignof(NetWriteRequest));
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

NetServer NetServer::create(
  inox_loop* loop,
  NetConnectionFn connection,
  void* user
) {
  (void)loop;
  (void)connection;
  (void)user;

  inox_net_throw_failed("TypeError: NetServer is unsupported without libuv");
  return NetServer();
}

void NetServer::onConnection(NetConnectionFn connection, void* user) const {
  (void)server_;
  (void)connection;
  (void)user;
  inox_net_throw_failed("TypeError: NetServer is unsupported without libuv");
}

void NetServer::onListening(NetServerFn listening, void* user) const {
  (void)server_;
  (void)listening;
  (void)user;
  inox_net_throw_failed("TypeError: NetServer is unsupported without libuv");
}

void NetServer::onClose(NetServerFn close, void* user) const {
  (void)server_;
  (void)close;
  (void)user;
  inox_net_throw_failed("TypeError: NetServer is unsupported without libuv");
}

void NetServer::onError(NetServerErrorFn error, void* user) const {
  (void)server_;
  (void)error;
  (void)user;
  inox_net_throw_failed("TypeError: NetServer is unsupported without libuv");
}

void NetServer::listen(inox::StringView host, int port, int backlog) const {
  (void)server_;
  (void)host;
  (void)port;
  (void)backlog;
  inox_net_throw_failed("TypeError: NetServer is unsupported without libuv");
}

NetAddress NetServer::address() const {
  (void)server_;
  NetAddress out = {};
  inox_net_throw_failed("TypeError: NetServer is unsupported without libuv");
  return out;
}

int NetServer::localPort() const {
  (void)server_;
  inox_net_throw_failed("TypeError: NetServer is unsupported without libuv");
  return 0;
}

void NetServer::close() const {
  (void)server_;
}

NetSocket NetSocket::connect(
  inox_loop* loop,
  inox::StringView host,
  int port,
  NetConnectFn connect,
  NetDataFn data,
  NetCloseFn close,
  void* user
) {
  (void)loop;
  (void)host;
  (void)port;
  (void)connect;
  (void)data;
  (void)close;
  (void)user;

  inox_net_throw_failed("TypeError: NetSocket is unsupported without libuv");
  return NetSocket();
}

void NetSocket::setCallbacks(NetDataFn data, NetCloseFn close, void* user) const {
  (void)socket_;
  (void)data;
  (void)close;
  (void)user;
}

void NetSocket::onConnect(NetSocketFn connect, void* user) const {
  (void)socket_;
  (void)connect;
  (void)user;
  inox_net_throw_failed("TypeError: NetSocket is unsupported without libuv");
}

void NetSocket::onReady(NetSocketFn ready, void* user) const {
  (void)socket_;
  (void)ready;
  (void)user;
  inox_net_throw_failed("TypeError: NetSocket is unsupported without libuv");
}

void NetSocket::onData(NetDataFn data, void* user) const {
  (void)socket_;
  (void)data;
  (void)user;
  inox_net_throw_failed("TypeError: NetSocket is unsupported without libuv");
}

void NetSocket::onEnd(NetSocketFn end, void* user) const {
  (void)socket_;
  (void)end;
  (void)user;
  inox_net_throw_failed("TypeError: NetSocket is unsupported without libuv");
}

void NetSocket::onClose(NetSocketFn close, void* user) const {
  (void)socket_;
  (void)close;
  (void)user;
  inox_net_throw_failed("TypeError: NetSocket is unsupported without libuv");
}

void NetSocket::onError(NetSocketErrorFn error, void* user) const {
  (void)socket_;
  (void)error;
  (void)user;
  inox_net_throw_failed("TypeError: NetSocket is unsupported without libuv");
}

void NetSocket::onDrain(NetSocketFn drain, void* user) const {
  (void)socket_;
  (void)drain;
  (void)user;
  inox_net_throw_failed("TypeError: NetSocket is unsupported without libuv");
}

void NetSocket::readStart() const {
  (void)socket_;
  inox_net_throw_failed("TypeError: NetSocket is unsupported without libuv");
}

void NetSocket::readStop() const {
  (void)socket_;
  inox_net_throw_failed("TypeError: NetSocket is unsupported without libuv");
}

void NetSocket::setEncoding(inox::StringView encoding) const {
  (void)socket_;
  (void)encoding;
  inox_net_throw_failed("TypeError: NetSocket is unsupported without libuv");
}

NetAddress NetSocket::address() const {
  (void)socket_;
  NetAddress out = {};
  inox_net_throw_failed("TypeError: NetSocket is unsupported without libuv");
  return out;
}

NetAddress NetSocket::remoteAddress() const {
  (void)socket_;
  NetAddress out = {};
  inox_net_throw_failed("TypeError: NetSocket is unsupported without libuv");
  return out;
}

size_t NetSocket::bytesRead() const {
  (void)socket_;
  inox_net_throw_failed("TypeError: NetSocket is unsupported without libuv");
  return 0;
}

size_t NetSocket::bytesWritten() const {
  (void)socket_;
  inox_net_throw_failed("TypeError: NetSocket is unsupported without libuv");
  return 0;
}

void NetSocket::setNoDelay(bool enabled) const {
  (void)socket_;
  (void)enabled;
  inox_net_throw_failed("TypeError: NetSocket is unsupported without libuv");
}

void NetSocket::setKeepAlive(bool enabled, unsigned int initial_delay) const {
  (void)socket_;
  (void)enabled;
  (void)initial_delay;
  inox_net_throw_failed("TypeError: NetSocket is unsupported without libuv");
}

void NetSocket::ref() const {
  (void)socket_;
  inox_net_throw_failed("TypeError: NetSocket is unsupported without libuv");
}

void NetSocket::unref() const {
  (void)socket_;
  inox_net_throw_failed("TypeError: NetSocket is unsupported without libuv");
}

void NetSocket::write(inox::StringView bytes, NetSocketWriteFn callback, void* user) const {
  (void)socket_;
  (void)bytes;
  (void)callback;
  (void)user;
  inox_net_throw_failed("TypeError: NetSocket is unsupported without libuv");
}

void NetSocket::end(inox::StringView bytes, NetSocketWriteFn callback, void* user) const {
  (void)socket_;
  (void)bytes;
  (void)callback;
  (void)user;
  inox_net_throw_failed("TypeError: NetSocket is unsupported without libuv");
}

void NetSocket::destroy() const {
  (void)socket_;
  inox_net_throw_failed("TypeError: NetSocket is unsupported without libuv");
}

void NetSocket::close() const {
  (void)socket_;
}

#endif
