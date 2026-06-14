#include "ccjs/http.h"

#ifdef CCJS_LOOP_BACKEND_LIBUV
#include "ccjs/net.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

typedef struct ccjs_http_connection {
  ccjs_http_server* server;
  ccjs_net_socket* socket;
  char buffer[4096];
  size_t len;
  int responded;
} ccjs_http_connection;

struct ccjs_http_server {
  ccjs_loop* loop;
  ccjs_allocator* allocator;
  ccjs_http_handler_fn handler;
  void* user;
  ccjs_net_server* net_server;
};

struct ccjs_http_response {
  ccjs_http_connection* connection;
};

static ccjs_status ccjs_http_on_connection(void* user, ccjs_net_server* server, ccjs_net_socket* socket);
static ccjs_status ccjs_http_on_data(void* user, ccjs_net_socket* socket, const char* bytes, size_t len);
static void ccjs_http_on_close(void* user, ccjs_net_socket* socket);
static ccjs_status ccjs_http_try_handle(ccjs_http_connection* connection);
static const char* ccjs_http_find_header_end(const char* bytes, size_t len);
static const char* ccjs_http_status_text(int status);

ccjs_status ccjs_http_server_new(
  ccjs_loop* loop,
  ccjs_http_handler_fn handler,
  void* user,
  ccjs_http_server** out
) {
  if (loop == 0 || loop->allocator == 0 || handler == 0 || out == 0) {
    return CCJS_ERR_TYPE;
  }

  *out = 0;
  ccjs_allocator* allocator = loop->allocator;
  ccjs_http_server* server =
    allocator->alloc(allocator->user, sizeof(ccjs_http_server), _Alignof(ccjs_http_server));

  if (server == 0) {
    return CCJS_ERR_OOM;
  }

  memset(server, 0, sizeof(ccjs_http_server));
  server->loop = loop;
  server->allocator = allocator;
  server->handler = handler;
  server->user = user;

  ccjs_status status = ccjs_net_server_new(loop, ccjs_http_on_connection, server, &server->net_server);

  if (status != CCJS_OK) {
    allocator->free(allocator->user, server, sizeof(ccjs_http_server), _Alignof(ccjs_http_server));
    return status;
  }

  *out = server;
  return CCJS_OK;
}

ccjs_status ccjs_http_server_listen(ccjs_http_server* server, const char* host, int port, int backlog) {
  if (server == 0) {
    return CCJS_ERR_TYPE;
  }

  return ccjs_net_server_listen(server->net_server, host, port, backlog);
}

ccjs_status ccjs_http_server_local_port(ccjs_http_server* server, int* out_port) {
  if (server == 0) {
    return CCJS_ERR_TYPE;
  }

  return ccjs_net_server_local_port(server->net_server, out_port);
}

void ccjs_http_server_close(ccjs_http_server* server) {
  if (server == 0) {
    return;
  }

  ccjs_net_server_close(server->net_server);
}

ccjs_status ccjs_http_response_text(ccjs_http_response* response, int status, const char* body, size_t len) {
  if (response == 0 || response->connection == 0 || (body == 0 && len != 0)) {
    return CCJS_ERR_TYPE;
  }

  ccjs_http_connection* connection = response->connection;

  if (connection->responded) {
    return CCJS_ERR_FIELD;
  }

  connection->responded = 1;

  char header[256];
  int header_len = snprintf(
    header,
    sizeof(header),
    "HTTP/1.1 %d %s\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Length: %zu\r\nConnection: close\r\n\r\n",
    status,
    ccjs_http_status_text(status),
    len
  );

  if (header_len < 0 || (size_t)header_len >= sizeof(header)) {
    return CCJS_ERR_FIELD;
  }

  size_t total_len = (size_t)header_len + len;
  char* bytes = connection->server->allocator->alloc(connection->server->allocator->user, total_len, _Alignof(char));

  if (bytes == 0) {
    return CCJS_ERR_OOM;
  }

  memcpy(bytes, header, (size_t)header_len);

  if (len != 0) {
    memcpy(bytes + header_len, body, len);
  }

  ccjs_status write_status = ccjs_net_socket_write_and_close(connection->socket, bytes, total_len);
  connection->server->allocator->free(connection->server->allocator->user, bytes, total_len, _Alignof(char));

  return write_status;
}

static ccjs_status ccjs_http_on_connection(void* user, ccjs_net_server* server, ccjs_net_socket* socket) {
  (void)server;
  ccjs_http_server* http_server = (ccjs_http_server*)user;
  ccjs_http_connection* connection = http_server->allocator->alloc(
    http_server->allocator->user,
    sizeof(ccjs_http_connection),
    _Alignof(ccjs_http_connection)
  );

  if (connection == 0) {
    ccjs_net_socket_close(socket);
    return CCJS_ERR_OOM;
  }

  memset(connection, 0, sizeof(ccjs_http_connection));
  connection->server = http_server;
  connection->socket = socket;
  ccjs_net_socket_set_callbacks(socket, ccjs_http_on_data, ccjs_http_on_close, connection);

  return ccjs_net_socket_read_start(socket);
}

static ccjs_status ccjs_http_on_data(void* user, ccjs_net_socket* socket, const char* bytes, size_t len) {
  (void)socket;
  ccjs_http_connection* connection = (ccjs_http_connection*)user;

  if (connection->len + len > sizeof(connection->buffer)) {
    ccjs_http_response response = { connection };
    return ccjs_http_response_text(&response, 413, "payload too large", 17);
  }

  memcpy(connection->buffer + connection->len, bytes, len);
  connection->len += len;

  return ccjs_http_try_handle(connection);
}

static void ccjs_http_on_close(void* user, ccjs_net_socket* socket) {
  (void)socket;
  ccjs_http_connection* connection = (ccjs_http_connection*)user;

  if (connection == 0 || connection->server == 0 || connection->server->allocator == 0) {
    return;
  }

  connection->server->allocator->free(
    connection->server->allocator->user,
    connection,
    sizeof(ccjs_http_connection),
    _Alignof(ccjs_http_connection)
  );
}

static ccjs_status ccjs_http_try_handle(ccjs_http_connection* connection) {
  const char* header_end = ccjs_http_find_header_end(connection->buffer, connection->len);

  if (header_end == 0) {
    return CCJS_OK;
  }

  const char* line_end = strstr(connection->buffer, "\r\n");

  if (line_end == 0 || line_end > header_end) {
    ccjs_http_response response = { connection };
    return ccjs_http_response_text(&response, 400, "bad request", 11);
  }

  const char* method_end = memchr(connection->buffer, ' ', (size_t)(line_end - connection->buffer));

  if (method_end == 0) {
    ccjs_http_response response = { connection };
    return ccjs_http_response_text(&response, 400, "bad request", 11);
  }

  const char* url_start = method_end + 1;
  const char* url_end = memchr(url_start, ' ', (size_t)(line_end - url_start));

  if (url_end == 0) {
    ccjs_http_response response = { connection };
    return ccjs_http_response_text(&response, 400, "bad request", 11);
  }

  ccjs_http_request request = {
    connection->buffer,
    (size_t)(method_end - connection->buffer),
    url_start,
    (size_t)(url_end - url_start)
  };
  ccjs_http_response response = { connection };
  ccjs_status status = connection->server->handler(connection->server->user, &request, &response);

  if (status != CCJS_OK) {
    return status;
  }

  if (!connection->responded) {
    return ccjs_http_response_text(&response, 204, "", 0);
  }

  return CCJS_OK;
}

static const char* ccjs_http_find_header_end(const char* bytes, size_t len) {
  if (bytes == 0 || len < 4) {
    return 0;
  }

  for (size_t index = 0; index + 3 < len; index += 1) {
    if (bytes[index] == '\r' && bytes[index + 1] == '\n' && bytes[index + 2] == '\r' && bytes[index + 3] == '\n') {
      return bytes + index + 4;
    }
  }

  return 0;
}

static const char* ccjs_http_status_text(int status) {
  switch (status) {
    case 200:
      return "OK";
    case 204:
      return "No Content";
    case 400:
      return "Bad Request";
    case 404:
      return "Not Found";
    case 413:
      return "Payload Too Large";
    default:
      return "OK";
  }
}

#else

struct ccjs_http_server {
  int unused;
};

struct ccjs_http_response {
  int unused;
};

ccjs_status ccjs_http_server_new(
  ccjs_loop* loop,
  ccjs_http_handler_fn handler,
  void* user,
  ccjs_http_server** out
) {
  (void)loop;
  (void)handler;
  (void)user;

  if (out == 0) {
    return CCJS_ERR_TYPE;
  }

  *out = 0;
  return CCJS_ERR_UNSUPPORTED;
}

ccjs_status ccjs_http_server_listen(ccjs_http_server* server, const char* host, int port, int backlog) {
  (void)server;
  (void)host;
  (void)port;
  (void)backlog;
  return CCJS_ERR_UNSUPPORTED;
}

ccjs_status ccjs_http_server_local_port(ccjs_http_server* server, int* out_port) {
  (void)server;

  if (out_port == 0) {
    return CCJS_ERR_TYPE;
  }

  *out_port = 0;
  return CCJS_ERR_UNSUPPORTED;
}

void ccjs_http_server_close(ccjs_http_server* server) {
  (void)server;
}

ccjs_status ccjs_http_response_text(ccjs_http_response* response, int status, const char* body, size_t len) {
  (void)response;
  (void)status;
  (void)body;
  (void)len;
  return CCJS_ERR_UNSUPPORTED;
}

#endif
