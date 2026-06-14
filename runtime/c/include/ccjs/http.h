#ifndef CCJS_HTTP_H
#define CCJS_HTTP_H

#include <stddef.h>
#include "ccjs/loop.h"

typedef struct ccjs_http_server ccjs_http_server;
typedef struct ccjs_http_response ccjs_http_response;

typedef struct ccjs_http_header {
  const char* name;
  size_t name_len;
  const char* value;
  size_t value_len;
} ccjs_http_header;

typedef struct ccjs_http_request {
  const char* method;
  size_t method_len;
  const char* url;
  size_t url_len;
  const ccjs_http_header* headers;
  size_t header_count;
  const char* body;
  size_t body_len;
} ccjs_http_request;

typedef ccjs_status (*ccjs_http_handler_fn)(
  void* user,
  const ccjs_http_request* request,
  ccjs_http_response* response
);

ccjs_status ccjs_http_server_new(
  ccjs_loop* loop,
  ccjs_http_handler_fn handler,
  void* user,
  ccjs_http_server** out
);
ccjs_status ccjs_http_server_listen(ccjs_http_server* server, const char* host, int port, int backlog);
ccjs_status ccjs_http_server_local_port(ccjs_http_server* server, int* out_port);
void ccjs_http_server_close(ccjs_http_server* server);
int ccjs_http_request_method_equals(const ccjs_http_request* request, const char* method, size_t len);
int ccjs_http_request_url_equals(const ccjs_http_request* request, const char* url, size_t len);
ccjs_status ccjs_http_response_set_status(ccjs_http_response* response, int status);
ccjs_status ccjs_http_response_set_header(
  ccjs_http_response* response,
  const char* name,
  size_t name_len,
  const char* value,
  size_t value_len
);
ccjs_status ccjs_http_response_write_head(
  ccjs_http_response* response,
  int status,
  const ccjs_http_header* headers,
  size_t header_count
);
ccjs_status ccjs_http_response_write(ccjs_http_response* response, const char* bytes, size_t len);
ccjs_status ccjs_http_response_end(ccjs_http_response* response, const char* bytes, size_t len);
ccjs_status ccjs_http_response_text(ccjs_http_response* response, int status, const char* body, size_t len);

#endif
