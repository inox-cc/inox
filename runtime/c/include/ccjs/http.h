#ifndef CCJS_HTTP_H
#define CCJS_HTTP_H

#include <stddef.h>
#include "ccjs/loop.h"

typedef struct ccjs_http_server ccjs_http_server;
typedef struct ccjs_http_response ccjs_http_response;

typedef struct ccjs_http_request {
  const char* method;
  size_t method_len;
  const char* url;
  size_t url_len;
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
ccjs_status ccjs_http_response_text(ccjs_http_response* response, int status, const char* body, size_t len);

#endif
