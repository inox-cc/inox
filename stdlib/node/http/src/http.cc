#include "inox/http.h"

#include <string.h>

HttpRequest::HttpRequest(const inox_http_request* request) : request_(request) {}

bool HttpRequest::methodEquals(inox::StringView method) const {
  return request_ != 0 &&
         request_->method_len == method.len &&
         memcmp(request_->method, method.bytes, method.len) == 0;
}

bool HttpRequest::urlEquals(inox::StringView url) const {
  return request_ != 0 &&
         request_->url_len == url.len &&
         memcmp(request_->url, url.bytes, url.len) == 0;
}

const inox_http_request* HttpRequest::raw() const {
  return request_;
}

HttpResponse::HttpResponse(inox_http_response* response) : response_(response) {}

#ifdef INOX_LOOP_BACKEND_LIBUV
#include "inox/binary.h"
#include "inox/fs.h"
#include "inox/net.h"

#include <stdio.h>
#include <stdlib.h>

#define INOX_HTTP_MAX_HEADERS 32
#define INOX_HTTP_MAX_RESPONSE_HEADERS 16
#define INOX_HTTP_MAX_HEADER_NAME 64
#define INOX_HTTP_MAX_HEADER_VALUE 256
#define INOX_HTTP_MAX_RESPONSE_BODY 65536

typedef struct inox_http_response_header {
  char name[INOX_HTTP_MAX_HEADER_NAME];
  size_t name_len;
  char value[INOX_HTTP_MAX_HEADER_VALUE];
  size_t value_len;
} inox_http_response_header;

typedef struct inox_http_connection {
  inox_http_server* server;
  inox_net_socket* socket;
  char buffer[4096];
  size_t len;
  int responded;
} inox_http_connection;

struct inox_http_server {
  inox_loop* loop;
  inox_allocator* allocator;
  inox_http_handler_fn handler;
  void* user;
  inox_net_server* net_server;
};

struct inox_http_response {
  inox_http_connection* connection;
  int status;
  inox_http_response_header headers[INOX_HTTP_MAX_RESPONSE_HEADERS];
  size_t header_count;
  char body[INOX_HTTP_MAX_RESPONSE_BODY];
  size_t body_len;
  int sent;
};

static inox_status inox_http_on_connection(void* user, inox_net_server* server, inox_net_socket* socket);
static inox_status inox_http_on_data(void* user, inox_net_socket* socket, const char* bytes, size_t len);
static void inox_http_on_close(void* user, inox_net_socket* socket);
static inox_status inox_http_try_handle(inox_http_connection* connection);
static inox_status inox_http_response_init(inox_http_response* response, inox_http_connection* connection);
static int inox_http_header_name_equals(const char* left, size_t left_len, const char* right, size_t right_len);
static int inox_http_has_response_header(inox_http_response* response, const char* name, size_t len);
static const char* inox_http_local_file_content_type(const char* path, size_t path_len, size_t* out_len);
static int inox_http_local_file_path_is_safe(const char* path, size_t len);
static inox_status inox_http_parse_headers(
  const char* start,
  const char* header_end,
  inox_http_header* headers,
  size_t* header_count,
  size_t* content_length
);
static const char* inox_http_find_header_end(const char* bytes, size_t len);
static const char* inox_http_status_text(int status);

inox_status inox_http_server_new(
  inox_loop* loop,
  inox_http_handler_fn handler,
  void* user,
  inox_http_server** out
) {
  if (loop == 0 || loop->allocator == 0 || out == 0) {
    return INOX_ERR_TYPE;
  }

  *out = 0;
  inox_allocator* allocator = loop->allocator;
  inox_http_server* server =
    (inox_http_server*)allocator->alloc(allocator->user, sizeof(inox_http_server), alignof(inox_http_server));

  if (server == 0) {
    return INOX_ERR_OOM;
  }

  memset(server, 0, sizeof(inox_http_server));
  server->loop = loop;
  server->allocator = allocator;
  server->handler = handler;
  server->user = user;

  inox_status status = inox_net_server_new(loop, inox_http_on_connection, server, &server->net_server);

  if (status != INOX_OK) {
    allocator->free(allocator->user, server, sizeof(inox_http_server), alignof(inox_http_server));
    return status;
  }

  *out = server;
  return INOX_OK;
}

inox_status inox_http_server_listen(inox_http_server* server, const char* host, int port, int backlog) {
  if (server == 0) {
    return INOX_ERR_TYPE;
  }

  return inox_net_server_listen(server->net_server, host, port, backlog);
}

inox_status inox_http_server_local_port(inox_http_server* server, int* out_port) {
  if (server == 0) {
    return INOX_ERR_TYPE;
  }

  return inox_net_server_local_port(server->net_server, out_port);
}

inox_status inox_http_server_on_request(inox_http_server* server, inox_http_handler_fn handler, void* user) {
  if (server == 0 || handler == 0) {
    return INOX_ERR_TYPE;
  }

  server->handler = handler;
  server->user = user;
  return INOX_OK;
}

void inox_http_server_close(inox_http_server* server) {
  if (server == 0) {
    return;
  }

  inox_net_server_close(server->net_server);
}

inox_status HttpResponse::setStatus(int status) const {
  inox_http_response* response = response_;

  if (response == 0 || response->connection == 0 || response->sent) {
    return INOX_ERR_TYPE;
  }

  response->status = status;
  return INOX_OK;
}

inox_status HttpResponse::setHeader(inox::StringView name, inox::StringView value) const {
  inox_http_response* response = response_;

  if (
    response == 0 ||
    response->connection == 0 ||
    response->sent ||
    name.len == 0 ||
    name.len >= INOX_HTTP_MAX_HEADER_NAME ||
    value.len >= INOX_HTTP_MAX_HEADER_VALUE
  ) {
    return INOX_ERR_TYPE;
  }

  inox_http_response_header* header = 0;

  for (size_t index = 0; index < response->header_count; index += 1) {
    if (inox_http_header_name_equals(response->headers[index].name, response->headers[index].name_len, name.bytes, name.len)) {
      header = &response->headers[index];
      break;
    }
  }

  if (header == 0) {
    if (response->header_count >= INOX_HTTP_MAX_RESPONSE_HEADERS) {
      return INOX_ERR_FIELD;
    }

    header = &response->headers[response->header_count];
    response->header_count += 1;
  }

  memcpy(header->name, name.bytes, name.len);
  header->name[name.len] = '\0';
  header->name_len = name.len;
  memcpy(header->value, value.bytes, value.len);
  header->value[value.len] = '\0';
  header->value_len = value.len;

  return INOX_OK;
}

inox_status HttpResponse::writeHead(int status, const inox_http_header* headers, size_t header_count) const {
  inox_status result = setStatus(status);

  if (result != INOX_OK) {
    return result;
  }

  if (headers == 0 && header_count != 0) {
    return INOX_ERR_TYPE;
  }

  for (size_t index = 0; index < header_count; index += 1) {
    result = setHeader(
      inox::StringView(headers[index].name, headers[index].name_len),
      inox::StringView(headers[index].value, headers[index].value_len)
    );

    if (result != INOX_OK) {
      return result;
    }
  }

  return INOX_OK;
}

inox_status HttpResponse::write(inox::StringView bytes) const {
  inox_http_response* response = response_;

  if (response == 0 || response->connection == 0 || response->sent) {
    return INOX_ERR_TYPE;
  }

  if (bytes.len > sizeof(response->body) - response->body_len) {
    return INOX_ERR_FIELD;
  }

  if (bytes.len != 0) {
    memcpy(response->body + response->body_len, bytes.bytes, bytes.len);
    response->body_len += bytes.len;
  }

  return INOX_OK;
}

inox_status HttpResponse::end(inox::StringView bytes) const {
  inox_http_response* response = response_;

  if (response == 0 || response->connection == 0) {
    return INOX_ERR_TYPE;
  }

  if (response->sent || response->connection->responded) {
    return INOX_ERR_FIELD;
  }

  inox_status append_status = write(bytes);

  if (append_status != INOX_OK) {
    return append_status;
  }

  inox_http_connection* connection = response->connection;
  connection->responded = 1;
  response->sent = 1;

  char header[2048];
  int header_len = snprintf(
    header,
    sizeof(header),
    "HTTP/1.1 %d %s\r\n",
    response->status,
    inox_http_status_text(response->status)
  );

  if (header_len < 0 || (size_t)header_len >= sizeof(header)) {
    return INOX_ERR_FIELD;
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
      return INOX_ERR_FIELD;
    }

    header_size += (size_t)header_len;
  }

  if (!inox_http_has_response_header(response, "Content-Length", 14)) {
    header_len = snprintf(header + header_size, sizeof(header) - header_size, "Content-Length: %zu\r\n", response->body_len);

    if (header_len < 0 || (size_t)header_len >= sizeof(header) - header_size) {
      return INOX_ERR_FIELD;
    }

    header_size += (size_t)header_len;
  }

  if (!inox_http_has_response_header(response, "Connection", 10)) {
    header_len = snprintf(header + header_size, sizeof(header) - header_size, "Connection: close\r\n");

    if (header_len < 0 || (size_t)header_len >= sizeof(header) - header_size) {
      return INOX_ERR_FIELD;
    }

    header_size += (size_t)header_len;
  }

  if (header_size + 2 > sizeof(header)) {
    return INOX_ERR_FIELD;
  }

  header[header_size] = '\r';
  header[header_size + 1] = '\n';
  header_size += 2;

  size_t total_len = header_size + response->body_len;
  char* response_bytes =
    (char*)connection->server->allocator->alloc(connection->server->allocator->user, total_len, alignof(char));

  if (response_bytes == 0) {
    return INOX_ERR_OOM;
  }

  memcpy(response_bytes, header, header_size);

  if (response->body_len != 0) {
    memcpy(response_bytes + header_size, response->body, response->body_len);
  }

  inox_status write_status = inox_net_socket_write_and_close(connection->socket, response_bytes, total_len);
  connection->server->allocator->free(connection->server->allocator->user, response_bytes, total_len, alignof(char));

  return write_status;
}

inox_status HttpResponse::text(int status, inox::StringView body) const {
  inox_status result = writeHead(
    status,
    (const inox_http_header[]){
      { "Content-Type", 12, "text/plain; charset=utf-8", 25 }
    },
    1
  );

  if (result != INOX_OK) {
    return result;
  }

  return end(body);
}

int HttpResponse::sendFsFile(const HttpRequest& request, inox::StringView url_prefix, inox::StringView root) const {
  inox_http_response* response = response_;
  const inox_http_request* raw_request = request.raw();

  if (
    response == 0 ||
    response->connection == 0 ||
    raw_request == 0 ||
    url_prefix.len == 0 ||
    root.len == 0
  ) {
    return 0;
  }

  if (!request.methodEquals("GET")) {
    return 0;
  }

  if (raw_request->url_len < url_prefix.len || memcmp(raw_request->url, url_prefix.bytes, url_prefix.len) != 0) {
    return 0;
  }

  const char* relative_path = raw_request->url + url_prefix.len;
  size_t relative_path_len = raw_request->url_len - url_prefix.len;

  for (size_t index = 0; index < relative_path_len; index += 1) {
    if (relative_path[index] == '?' || relative_path[index] == '#') {
      relative_path_len = index;
      break;
    }
  }

  if (relative_path_len == 0) {
    relative_path = "index.html";
    relative_path_len = 10;
  }

  if (!inox_http_local_file_path_is_safe(relative_path, relative_path_len)) {
    return 0;
  }

  char path[4096];
  size_t path_len = root.len;

  if (path_len >= sizeof(path)) {
    return 0;
  }

  memcpy(path, root.bytes, root.len);

  if (path_len > 0 && path[path_len - 1] != '/') {
    if (path_len + 1 >= sizeof(path)) {
      return 0;
    }

    path[path_len] = '/';
    path_len += 1;
  }

  if (relative_path_len >= sizeof(path) - path_len) {
    return 0;
  }

  memcpy(path + path_len, relative_path, relative_path_len);
  path_len += relative_path_len;
  path[path_len] = '\0';

  inox_value file = inox_undefined_value();
  inox_status read_status =
    inox_fs_read_file_bytes_sync(response->connection->server->allocator, path, path_len, &file);

  if (read_status != INOX_OK) {
    return 0;
  }

  if (file.tag != INOX_TAG_BYTES) {
    inox_release(file);

    return text(500, "internal server error") == INOX_OK ? 1 : 0;
  }

  inox_bytes* bytes = (inox_bytes*)file.as.ref;

  if (bytes->len > INOX_HTTP_MAX_RESPONSE_BODY) {
    inox_release(file);

    return text(413, "payload too large") == INOX_OK ? 1 : 0;
  }

  size_t content_type_len = 0;
  const char* content_type = inox_http_local_file_content_type(path, path_len, &content_type_len);
  inox_status result = writeHead(
    200,
    (const inox_http_header[]){
      { "Content-Type", 12, content_type, content_type_len }
    },
    1
  );

  if (result == INOX_OK) {
    result = end(inox::StringView((const char*)bytes->bytes, bytes->len));
  }

  inox_release(file);

  return result == INOX_OK ? 1 : 0;
}

static inox_status inox_http_on_connection(void* user, inox_net_server* server, inox_net_socket* socket) {
  (void)server;
  inox_http_server* http_server = (inox_http_server*)user;
  inox_http_connection* connection = (inox_http_connection*)http_server->allocator->alloc(
    http_server->allocator->user,
    sizeof(inox_http_connection),
    alignof(inox_http_connection)
  );

  if (connection == 0) {
    inox_net_socket_close(socket);
    return INOX_ERR_OOM;
  }

  memset(connection, 0, sizeof(inox_http_connection));
  connection->server = http_server;
  connection->socket = socket;
  inox_net_socket_set_callbacks(socket, inox_http_on_data, inox_http_on_close, connection);

  return inox_net_socket_read_start(socket);
}

static inox_status inox_http_on_data(void* user, inox_net_socket* socket, const char* bytes, size_t len) {
  (void)socket;
  inox_http_connection* connection = (inox_http_connection*)user;

  if (connection->len + len > sizeof(connection->buffer)) {
    inox_http_response response;
    inox_http_response_init(&response, connection);
    return HttpResponse(&response).text(413, "payload too large");
  }

  memcpy(connection->buffer + connection->len, bytes, len);
  connection->len += len;

  return inox_http_try_handle(connection);
}

static void inox_http_on_close(void* user, inox_net_socket* socket) {
  (void)socket;
  inox_http_connection* connection = (inox_http_connection*)user;

  if (connection == 0 || connection->server == 0 || connection->server->allocator == 0) {
    return;
  }

  connection->server->allocator->free(
    connection->server->allocator->user,
    connection,
    sizeof(inox_http_connection),
    alignof(inox_http_connection)
  );
}

static inox_status inox_http_try_handle(inox_http_connection* connection) {
  const char* header_end = inox_http_find_header_end(connection->buffer, connection->len);

  if (header_end == 0) {
    return INOX_OK;
  }

  const char* line_end = strstr(connection->buffer, "\r\n");

  if (line_end == 0 || line_end > header_end) {
    inox_http_response response;
    inox_http_response_init(&response, connection);
    return HttpResponse(&response).text(400, "bad request");
  }

  const char* method_end = (const char*)memchr(connection->buffer, ' ', (size_t)(line_end - connection->buffer));

  if (method_end == 0) {
    inox_http_response response;
    inox_http_response_init(&response, connection);
    return HttpResponse(&response).text(400, "bad request");
  }

  const char* url_start = method_end + 1;
  const char* url_end = (const char*)memchr(url_start, ' ', (size_t)(line_end - url_start));

  if (url_end == 0) {
    inox_http_response response;
    inox_http_response_init(&response, connection);
    return HttpResponse(&response).text(400, "bad request");
  }

  inox_http_header headers[INOX_HTTP_MAX_HEADERS];
  size_t header_count = 0;
  size_t content_length = 0;
  inox_status parse_status = inox_http_parse_headers(line_end + 2, header_end, headers, &header_count, &content_length);

  if (parse_status != INOX_OK) {
    inox_http_response response;
    inox_http_response_init(&response, connection);
    return HttpResponse(&response).text(400, "bad request");
  }

  size_t header_bytes = (size_t)(header_end - connection->buffer);

  if (content_length > sizeof(connection->buffer) - header_bytes) {
    inox_http_response response;
    inox_http_response_init(&response, connection);
    return HttpResponse(&response).text(413, "payload too large");
  }

  if (connection->len < header_bytes + content_length) {
    return INOX_OK;
  }

  inox_http_request request = {
    connection->buffer,
    (size_t)(method_end - connection->buffer),
    url_start,
    (size_t)(url_end - url_start),
    headers,
    header_count,
    header_end,
    content_length
  };
  inox_http_response response;
  inox_http_response_init(&response, connection);
  if (connection->server->handler == 0) {
    return HttpResponse(&response).text(404, "not found");
  }

  inox_status status = connection->server->handler(connection->server->user, &request, &response);

  if (status != INOX_OK) {
    return status;
  }

  if (!connection->responded) {
    return HttpResponse(&response).text(204, "");
  }

  return INOX_OK;
}

static inox_status inox_http_response_init(inox_http_response* response, inox_http_connection* connection) {
  if (response == 0 || connection == 0) {
    return INOX_ERR_TYPE;
  }

  memset(response, 0, sizeof(inox_http_response));
  response->connection = connection;
  response->status = 200;

  return INOX_OK;
}

static int inox_http_header_name_equals(const char* left, size_t left_len, const char* right, size_t right_len) {
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

static int inox_http_has_response_header(inox_http_response* response, const char* name, size_t len) {
  if (response == 0 || name == 0) {
    return 0;
  }

  for (size_t index = 0; index < response->header_count; index += 1) {
    if (inox_http_header_name_equals(response->headers[index].name, response->headers[index].name_len, name, len)) {
      return 1;
    }
  }

  return 0;
}

static inox_status inox_http_parse_headers(
  const char* start,
  const char* header_end,
  inox_http_header* headers,
  size_t* header_count,
  size_t* content_length
) {
  if (start == 0 || header_end == 0 || headers == 0 || header_count == 0 || content_length == 0) {
    return INOX_ERR_TYPE;
  }

  *header_count = 0;
  *content_length = 0;
  const char* cursor = start;

  while (cursor < header_end - 2) {
    const char* raw_line_end = strstr(cursor, "\r\n");

    if (raw_line_end == 0 || raw_line_end > header_end) {
      return INOX_ERR_FIELD;
    }

    if (raw_line_end == cursor) {
      break;
    }

    const char* line_end = raw_line_end;
    const char* separator = (const char*)memchr(cursor, ':', (size_t)(line_end - cursor));

    if (separator == 0) {
      return INOX_ERR_FIELD;
    }

    const char* value = separator + 1;

    while (value < line_end && (*value == ' ' || *value == '\t')) {
      value += 1;
    }

    while (line_end > value && (line_end[-1] == ' ' || line_end[-1] == '\t')) {
      line_end -= 1;
    }

    if (*header_count >= INOX_HTTP_MAX_HEADERS) {
      return INOX_ERR_FIELD;
    }

    headers[*header_count] = (inox_http_header){
      cursor,
      (size_t)(separator - cursor),
      value,
      (size_t)(line_end - value)
    };

    if (inox_http_header_name_equals(cursor, (size_t)(separator - cursor), "Content-Length", 14)) {
      size_t parsed = 0;

      for (const char* digit = value; digit < line_end; digit += 1) {
        if (*digit < '0' || *digit > '9') {
          return INOX_ERR_FIELD;
        }

        parsed = parsed * 10 + (size_t)(*digit - '0');
      }

      *content_length = parsed;
    }

    *header_count += 1;
    cursor = raw_line_end + 2;
  }

  return INOX_OK;
}

static const char* inox_http_find_header_end(const char* bytes, size_t len) {
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

static const char* inox_http_local_file_content_type(const char* path, size_t path_len, size_t* out_len) {
  if (path_len >= 5 && memcmp(path + path_len - 5, ".html", 5) == 0) {
    *out_len = 24;
    return "text/html; charset=utf-8";
  }

  if (path_len >= 4 && memcmp(path + path_len - 4, ".css", 4) == 0) {
    *out_len = 23;
    return "text/css; charset=utf-8";
  }

  if (path_len >= 3 && memcmp(path + path_len - 3, ".js", 3) == 0) {
    *out_len = 37;
    return "application/javascript; charset=utf-8";
  }

  if (path_len >= 5 && memcmp(path + path_len - 5, ".json", 5) == 0) {
    *out_len = 16;
    return "application/json";
  }

  if (path_len >= 4 && memcmp(path + path_len - 4, ".txt", 4) == 0) {
    *out_len = 25;
    return "text/plain; charset=utf-8";
  }

  *out_len = 24;
  return "application/octet-stream";
}

static int inox_http_local_file_path_is_safe(const char* path, size_t len) {
  if (path == 0 || len == 0 || path[0] == '/' || path[0] == '\\') {
    return 0;
  }

  size_t segment_start = 0;

  for (size_t index = 0; index <= len; index += 1) {
    if (index < len && path[index] != '/' && path[index] != '\\' && path[index] != '\0') {
      continue;
    }

    if (index < len && path[index] == '\0') {
      return 0;
    }

    size_t segment_len = index - segment_start;

    if (segment_len == 0) {
      return 0;
    }

    if (segment_len == 1 && path[segment_start] == '.') {
      return 0;
    }

    if (segment_len == 2 && path[segment_start] == '.' && path[segment_start + 1] == '.') {
      return 0;
    }

    segment_start = index + 1;
  }

  return 1;
}

static const char* inox_http_status_text(int status) {
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

struct inox_http_server {
  int unused;
};

struct inox_http_response {
  int unused;
};

inox_status inox_http_server_new(
  inox_loop* loop,
  inox_http_handler_fn handler,
  void* user,
  inox_http_server** out
) {
  (void)loop;
  (void)handler;
  (void)user;

  if (out == 0) {
    return INOX_ERR_TYPE;
  }

  *out = 0;
  return INOX_ERR_UNSUPPORTED;
}

inox_status inox_http_server_listen(inox_http_server* server, const char* host, int port, int backlog) {
  (void)server;
  (void)host;
  (void)port;
  (void)backlog;
  return INOX_ERR_UNSUPPORTED;
}

inox_status inox_http_server_local_port(inox_http_server* server, int* out_port) {
  (void)server;

  if (out_port == 0) {
    return INOX_ERR_TYPE;
  }

  *out_port = 0;
  return INOX_ERR_UNSUPPORTED;
}

inox_status inox_http_server_on_request(inox_http_server* server, inox_http_handler_fn handler, void* user) {
  (void)server;
  (void)handler;
  (void)user;
  return INOX_ERR_UNSUPPORTED;
}

void inox_http_server_close(inox_http_server* server) {
  (void)server;
}

inox_status HttpResponse::setStatus(int status) const {
  (void)response_;
  (void)status;
  return INOX_ERR_UNSUPPORTED;
}

inox_status HttpResponse::setHeader(inox::StringView name, inox::StringView value) const {
  (void)response_;
  (void)name;
  (void)value;
  return INOX_ERR_UNSUPPORTED;
}

inox_status HttpResponse::writeHead(int status, const inox_http_header* headers, size_t header_count) const {
  (void)response_;
  (void)status;
  (void)headers;
  (void)header_count;
  return INOX_ERR_UNSUPPORTED;
}

inox_status HttpResponse::write(inox::StringView bytes) const {
  (void)response_;
  (void)bytes;
  return INOX_ERR_UNSUPPORTED;
}

inox_status HttpResponse::end(inox::StringView bytes) const {
  (void)response_;
  (void)bytes;
  return INOX_ERR_UNSUPPORTED;
}

inox_status HttpResponse::text(int status, inox::StringView body) const {
  (void)response_;
  (void)status;
  (void)body;
  return INOX_ERR_UNSUPPORTED;
}

int HttpResponse::sendFsFile(const HttpRequest& request, inox::StringView url_prefix, inox::StringView root) const {
  (void)response_;
  (void)request;
  (void)url_prefix;
  (void)root;
  return 0;
}

#endif
