#include "ccjs/http.h"

#include <string.h>

int ccjs_http_request_method_equals(const ccjs_http_request* request, const char* method, size_t len) {
  return request != 0 &&
         method != 0 &&
         request->method_len == len &&
         memcmp(request->method, method, len) == 0;
}

int ccjs_http_request_url_equals(const ccjs_http_request* request, const char* url, size_t len) {
  return request != 0 &&
         url != 0 &&
         request->url_len == len &&
         memcmp(request->url, url, len) == 0;
}

#ifdef CCJS_LOOP_BACKEND_LIBUV
#include "ccjs/net.h"

#include <stdio.h>
#include <stdlib.h>

#define CCJS_HTTP_MAX_HEADERS 32
#define CCJS_HTTP_MAX_RESPONSE_HEADERS 16
#define CCJS_HTTP_MAX_HEADER_NAME 64
#define CCJS_HTTP_MAX_HEADER_VALUE 256
#define CCJS_HTTP_MAX_RESPONSE_BODY 65536

typedef struct ccjs_http_response_header {
  char name[CCJS_HTTP_MAX_HEADER_NAME];
  size_t name_len;
  char value[CCJS_HTTP_MAX_HEADER_VALUE];
  size_t value_len;
} ccjs_http_response_header;

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
  int status;
  ccjs_http_response_header headers[CCJS_HTTP_MAX_RESPONSE_HEADERS];
  size_t header_count;
  char body[CCJS_HTTP_MAX_RESPONSE_BODY];
  size_t body_len;
  int sent;
};

static ccjs_status ccjs_http_on_connection(void* user, ccjs_net_server* server, ccjs_net_socket* socket);
static ccjs_status ccjs_http_on_data(void* user, ccjs_net_socket* socket, const char* bytes, size_t len);
static void ccjs_http_on_close(void* user, ccjs_net_socket* socket);
static ccjs_status ccjs_http_try_handle(ccjs_http_connection* connection);
static ccjs_status ccjs_http_response_init(ccjs_http_response* response, ccjs_http_connection* connection);
static int ccjs_http_header_name_equals(const char* left, size_t left_len, const char* right, size_t right_len);
static int ccjs_http_has_response_header(ccjs_http_response* response, const char* name, size_t len);
static ccjs_status ccjs_http_parse_headers(
  const char* start,
  const char* header_end,
  ccjs_http_header* headers,
  size_t* header_count,
  size_t* content_length
);
static const char* ccjs_http_find_header_end(const char* bytes, size_t len);
static const char* ccjs_http_status_text(int status);

ccjs_status ccjs_http_server_new(
  ccjs_loop* loop,
  ccjs_http_handler_fn handler,
  void* user,
  ccjs_http_server** out
) {
  if (loop == 0 || loop->allocator == 0 || out == 0) {
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

ccjs_status ccjs_http_server_on_request(ccjs_http_server* server, ccjs_http_handler_fn handler, void* user) {
  if (server == 0 || handler == 0) {
    return CCJS_ERR_TYPE;
  }

  server->handler = handler;
  server->user = user;
  return CCJS_OK;
}

void ccjs_http_server_close(ccjs_http_server* server) {
  if (server == 0) {
    return;
  }

  ccjs_net_server_close(server->net_server);
}

ccjs_status ccjs_http_response_set_status(ccjs_http_response* response, int status) {
  if (response == 0 || response->connection == 0 || response->sent) {
    return CCJS_ERR_TYPE;
  }

  response->status = status;
  return CCJS_OK;
}

ccjs_status ccjs_http_response_set_header(
  ccjs_http_response* response,
  const char* name,
  size_t name_len,
  const char* value,
  size_t value_len
) {
  if (
    response == 0 ||
    response->connection == 0 ||
    response->sent ||
    name == 0 ||
    value == 0 ||
    name_len == 0 ||
    name_len >= CCJS_HTTP_MAX_HEADER_NAME ||
    value_len >= CCJS_HTTP_MAX_HEADER_VALUE
  ) {
    return CCJS_ERR_TYPE;
  }

  ccjs_http_response_header* header = 0;

  for (size_t index = 0; index < response->header_count; index += 1) {
    if (ccjs_http_header_name_equals(response->headers[index].name, response->headers[index].name_len, name, name_len)) {
      header = &response->headers[index];
      break;
    }
  }

  if (header == 0) {
    if (response->header_count >= CCJS_HTTP_MAX_RESPONSE_HEADERS) {
      return CCJS_ERR_FIELD;
    }

    header = &response->headers[response->header_count];
    response->header_count += 1;
  }

  memcpy(header->name, name, name_len);
  header->name[name_len] = '\0';
  header->name_len = name_len;
  memcpy(header->value, value, value_len);
  header->value[value_len] = '\0';
  header->value_len = value_len;

  return CCJS_OK;
}

ccjs_status ccjs_http_response_write_head(
  ccjs_http_response* response,
  int status,
  const ccjs_http_header* headers,
  size_t header_count
) {
  ccjs_status result = ccjs_http_response_set_status(response, status);

  if (result != CCJS_OK) {
    return result;
  }

  if (headers == 0 && header_count != 0) {
    return CCJS_ERR_TYPE;
  }

  for (size_t index = 0; index < header_count; index += 1) {
    result = ccjs_http_response_set_header(
      response,
      headers[index].name,
      headers[index].name_len,
      headers[index].value,
      headers[index].value_len
    );

    if (result != CCJS_OK) {
      return result;
    }
  }

  return CCJS_OK;
}

ccjs_status ccjs_http_response_write(ccjs_http_response* response, const char* bytes, size_t len) {
  if (response == 0 || response->connection == 0 || response->sent || (bytes == 0 && len != 0)) {
    return CCJS_ERR_TYPE;
  }

  if (len > sizeof(response->body) - response->body_len) {
    return CCJS_ERR_FIELD;
  }

  if (len != 0) {
    memcpy(response->body + response->body_len, bytes, len);
    response->body_len += len;
  }

  return CCJS_OK;
}

ccjs_status ccjs_http_response_end(ccjs_http_response* response, const char* bytes, size_t len) {
  if (response == 0 || response->connection == 0 || (bytes == 0 && len != 0)) {
    return CCJS_ERR_TYPE;
  }

  if (response->sent || response->connection->responded) {
    return CCJS_ERR_FIELD;
  }

  ccjs_status append_status = ccjs_http_response_write(response, bytes, len);

  if (append_status != CCJS_OK) {
    return append_status;
  }

  ccjs_http_connection* connection = response->connection;
  connection->responded = 1;
  response->sent = 1;

  char header[2048];
  int header_len = snprintf(
    header,
    sizeof(header),
    "HTTP/1.1 %d %s\r\n",
    response->status,
    ccjs_http_status_text(response->status)
  );

  if (header_len < 0 || (size_t)header_len >= sizeof(header)) {
    return CCJS_ERR_FIELD;
  }

  size_t header_size = (size_t)header_len;

  for (size_t index = 0; index < response->header_count; index += 1) {
    header_len = snprintf(
      header + header_size,
      sizeof(header) - header_size,
      "%.*s: %.*s\r\n",
      (int)response->headers[index].name_len,
      response->headers[index].name,
      (int)response->headers[index].value_len,
      response->headers[index].value
    );

    if (header_len < 0 || (size_t)header_len >= sizeof(header) - header_size) {
      return CCJS_ERR_FIELD;
    }

    header_size += (size_t)header_len;
  }

  if (!ccjs_http_has_response_header(response, "Content-Length", 14)) {
    header_len = snprintf(header + header_size, sizeof(header) - header_size, "Content-Length: %zu\r\n", response->body_len);

    if (header_len < 0 || (size_t)header_len >= sizeof(header) - header_size) {
      return CCJS_ERR_FIELD;
    }

    header_size += (size_t)header_len;
  }

  if (!ccjs_http_has_response_header(response, "Connection", 10)) {
    header_len = snprintf(header + header_size, sizeof(header) - header_size, "Connection: close\r\n");

    if (header_len < 0 || (size_t)header_len >= sizeof(header) - header_size) {
      return CCJS_ERR_FIELD;
    }

    header_size += (size_t)header_len;
  }

  if (header_size + 2 > sizeof(header)) {
    return CCJS_ERR_FIELD;
  }

  header[header_size] = '\r';
  header[header_size + 1] = '\n';
  header_size += 2;

  size_t total_len = header_size + response->body_len;
  char* response_bytes =
    connection->server->allocator->alloc(connection->server->allocator->user, total_len, _Alignof(char));

  if (response_bytes == 0) {
    return CCJS_ERR_OOM;
  }

  memcpy(response_bytes, header, header_size);

  if (response->body_len != 0) {
    memcpy(response_bytes + header_size, response->body, response->body_len);
  }

  ccjs_status write_status = ccjs_net_socket_write_and_close(connection->socket, response_bytes, total_len);
  connection->server->allocator->free(connection->server->allocator->user, response_bytes, total_len, _Alignof(char));

  return write_status;
}

ccjs_status ccjs_http_response_text(ccjs_http_response* response, int status, const char* body, size_t len) {
  ccjs_status result = ccjs_http_response_write_head(
    response,
    status,
    (const ccjs_http_header[]){
      { "Content-Type", 12, "text/plain; charset=utf-8", 25 }
    },
    1
  );

  if (result != CCJS_OK) {
    return result;
  }

  return ccjs_http_response_end(response, body, len);
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
    ccjs_http_response response;
    ccjs_http_response_init(&response, connection);
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
    ccjs_http_response response;
    ccjs_http_response_init(&response, connection);
    return ccjs_http_response_text(&response, 400, "bad request", 11);
  }

  const char* method_end = memchr(connection->buffer, ' ', (size_t)(line_end - connection->buffer));

  if (method_end == 0) {
    ccjs_http_response response;
    ccjs_http_response_init(&response, connection);
    return ccjs_http_response_text(&response, 400, "bad request", 11);
  }

  const char* url_start = method_end + 1;
  const char* url_end = memchr(url_start, ' ', (size_t)(line_end - url_start));

  if (url_end == 0) {
    ccjs_http_response response;
    ccjs_http_response_init(&response, connection);
    return ccjs_http_response_text(&response, 400, "bad request", 11);
  }

  ccjs_http_header headers[CCJS_HTTP_MAX_HEADERS];
  size_t header_count = 0;
  size_t content_length = 0;
  ccjs_status parse_status = ccjs_http_parse_headers(line_end + 2, header_end, headers, &header_count, &content_length);

  if (parse_status != CCJS_OK) {
    ccjs_http_response response;
    ccjs_http_response_init(&response, connection);
    return ccjs_http_response_text(&response, 400, "bad request", 11);
  }

  size_t header_bytes = (size_t)(header_end - connection->buffer);

  if (content_length > sizeof(connection->buffer) - header_bytes) {
    ccjs_http_response response;
    ccjs_http_response_init(&response, connection);
    return ccjs_http_response_text(&response, 413, "payload too large", 17);
  }

  if (connection->len < header_bytes + content_length) {
    return CCJS_OK;
  }

  ccjs_http_request request = {
    connection->buffer,
    (size_t)(method_end - connection->buffer),
    url_start,
    (size_t)(url_end - url_start),
    headers,
    header_count,
    header_end,
    content_length
  };
  ccjs_http_response response;
  ccjs_http_response_init(&response, connection);
  if (connection->server->handler == 0) {
    return ccjs_http_response_text(&response, 404, "not found", 9);
  }

  ccjs_status status = connection->server->handler(connection->server->user, &request, &response);

  if (status != CCJS_OK) {
    return status;
  }

  if (!connection->responded) {
    return ccjs_http_response_text(&response, 204, "", 0);
  }

  return CCJS_OK;
}

static ccjs_status ccjs_http_response_init(ccjs_http_response* response, ccjs_http_connection* connection) {
  if (response == 0 || connection == 0) {
    return CCJS_ERR_TYPE;
  }

  memset(response, 0, sizeof(ccjs_http_response));
  response->connection = connection;
  response->status = 200;

  return CCJS_OK;
}

static int ccjs_http_header_name_equals(const char* left, size_t left_len, const char* right, size_t right_len) {
  if (left == 0 || right == 0 || left_len != right_len) {
    return 0;
  }

  for (size_t index = 0; index < left_len; index += 1) {
    char left_char = left[index];
    char right_char = right[index];

    if (left_char >= 'A' && left_char <= 'Z') {
      left_char = (char)(left_char - 'A' + 'a');
    }

    if (right_char >= 'A' && right_char <= 'Z') {
      right_char = (char)(right_char - 'A' + 'a');
    }

    if (left_char != right_char) {
      return 0;
    }
  }

  return 1;
}

static int ccjs_http_has_response_header(ccjs_http_response* response, const char* name, size_t len) {
  if (response == 0 || name == 0) {
    return 0;
  }

  for (size_t index = 0; index < response->header_count; index += 1) {
    if (ccjs_http_header_name_equals(response->headers[index].name, response->headers[index].name_len, name, len)) {
      return 1;
    }
  }

  return 0;
}

static ccjs_status ccjs_http_parse_headers(
  const char* start,
  const char* header_end,
  ccjs_http_header* headers,
  size_t* header_count,
  size_t* content_length
) {
  if (start == 0 || header_end == 0 || headers == 0 || header_count == 0 || content_length == 0) {
    return CCJS_ERR_TYPE;
  }

  *header_count = 0;
  *content_length = 0;
  const char* cursor = start;

  while (cursor < header_end - 2) {
    const char* raw_line_end = strstr(cursor, "\r\n");

    if (raw_line_end == 0 || raw_line_end > header_end) {
      return CCJS_ERR_FIELD;
    }

    if (raw_line_end == cursor) {
      break;
    }

    const char* line_end = raw_line_end;
    const char* separator = memchr(cursor, ':', (size_t)(line_end - cursor));

    if (separator == 0) {
      return CCJS_ERR_FIELD;
    }

    const char* value = separator + 1;

    while (value < line_end && (*value == ' ' || *value == '\t')) {
      value += 1;
    }

    while (line_end > value && (line_end[-1] == ' ' || line_end[-1] == '\t')) {
      line_end -= 1;
    }

    if (*header_count >= CCJS_HTTP_MAX_HEADERS) {
      return CCJS_ERR_FIELD;
    }

    headers[*header_count] = (ccjs_http_header){
      cursor,
      (size_t)(separator - cursor),
      value,
      (size_t)(line_end - value)
    };

    if (ccjs_http_header_name_equals(cursor, (size_t)(separator - cursor), "Content-Length", 14)) {
      size_t parsed = 0;

      for (const char* digit = value; digit < line_end; digit += 1) {
        if (*digit < '0' || *digit > '9') {
          return CCJS_ERR_FIELD;
        }

        parsed = parsed * 10 + (size_t)(*digit - '0');
      }

      *content_length = parsed;
    }

    *header_count += 1;
    cursor = raw_line_end + 2;
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
    case 201:
      return "Created";
    case 204:
      return "No Content";
    case 400:
      return "Bad Request";
    case 404:
      return "Not Found";
    case 413:
      return "Payload Too Large";
    case 500:
      return "Internal Server Error";
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

ccjs_status ccjs_http_server_on_request(ccjs_http_server* server, ccjs_http_handler_fn handler, void* user) {
  (void)server;
  (void)handler;
  (void)user;
  return CCJS_ERR_UNSUPPORTED;
}

void ccjs_http_server_close(ccjs_http_server* server) {
  (void)server;
}

ccjs_status ccjs_http_response_set_status(ccjs_http_response* response, int status) {
  (void)response;
  (void)status;
  return CCJS_ERR_UNSUPPORTED;
}

ccjs_status ccjs_http_response_set_header(
  ccjs_http_response* response,
  const char* name,
  size_t name_len,
  const char* value,
  size_t value_len
) {
  (void)response;
  (void)name;
  (void)name_len;
  (void)value;
  (void)value_len;
  return CCJS_ERR_UNSUPPORTED;
}

ccjs_status ccjs_http_response_write_head(
  ccjs_http_response* response,
  int status,
  const ccjs_http_header* headers,
  size_t header_count
) {
  (void)response;
  (void)status;
  (void)headers;
  (void)header_count;
  return CCJS_ERR_UNSUPPORTED;
}

ccjs_status ccjs_http_response_write(ccjs_http_response* response, const char* bytes, size_t len) {
  (void)response;
  (void)bytes;
  (void)len;
  return CCJS_ERR_UNSUPPORTED;
}

ccjs_status ccjs_http_response_end(ccjs_http_response* response, const char* bytes, size_t len) {
  (void)response;
  (void)bytes;
  (void)len;
  return CCJS_ERR_UNSUPPORTED;
}

ccjs_status ccjs_http_response_text(ccjs_http_response* response, int status, const char* body, size_t len) {
  (void)response;
  (void)status;
  (void)body;
  (void)len;
  return CCJS_ERR_UNSUPPORTED;
}

#endif
