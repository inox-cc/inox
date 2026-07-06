#ifndef INOX_HTTP_H
#define INOX_HTTP_H

#include <stddef.h>
#include "inox/loop.h"

typedef struct inox_http_server inox_http_server;
typedef struct inox_http_response inox_http_response;

typedef struct inox_http_header {
  const char* name;
  size_t name_len;
  const char* value;
  size_t value_len;
} inox_http_header;

typedef struct inox_http_request {
  const char* method;
  size_t method_len;
  const char* url;
  size_t url_len;
  const inox_http_header* headers;
  size_t header_count;
  const char* body;
  size_t body_len;
} inox_http_request;

typedef inox_status (*inox_http_handler_fn)(
  void* user,
  const inox_http_request* request,
  inox_http_response* response
);

inox_status inox_http_server_new(
  inox_loop* loop,
  inox_http_handler_fn handler,
  void* user,
  inox_http_server** out
);
inox_status inox_http_server_listen(inox_http_server* server, const char* host, int port, int backlog);
inox_status inox_http_server_local_port(inox_http_server* server, int* out_port);
inox_status inox_http_server_on_request(inox_http_server* server, inox_http_handler_fn handler, void* user);
void inox_http_server_close(inox_http_server* server);
int inox_http_request_method_equals(const inox_http_request* request, const char* method, size_t len);
int inox_http_request_url_equals(const inox_http_request* request, const char* url, size_t len);
inox_status inox_http_response_set_status(inox_http_response* response, int status);
inox_status inox_http_response_set_header(
  inox_http_response* response,
  const char* name,
  size_t name_len,
  const char* value,
  size_t value_len
);
inox_status inox_http_response_write_head(
  inox_http_response* response,
  int status,
  const inox_http_header* headers,
  size_t header_count
);
inox_status inox_http_response_write(inox_http_response* response, const char* bytes, size_t len);
inox_status inox_http_response_end(inox_http_response* response, const char* bytes, size_t len);
inox_status inox_http_response_text(inox_http_response* response, int status, const char* body, size_t len);
int inox_http_response_send_fs_file(
  inox_http_response* response,
  const inox_http_request* request,
  const char* url_prefix,
  size_t url_prefix_len,
  const char* root,
  size_t root_len
);

#endif
