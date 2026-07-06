#ifndef INOX_HTTP_H
#define INOX_HTTP_H

#include <stddef.h>
#include "inox/loop.h"

#ifdef __cplusplus
#include "inox/string_view.h"
#endif

struct inox_http_server;
struct inox_http_response;

struct HttpHeader {
  const char* name;
  size_t name_len;
  const char* value;
  size_t value_len;
};

struct HttpRequestData {
  const char* method;
  size_t method_len;
  const char* url;
  size_t url_len;
  const HttpHeader* headers;
  size_t header_count;
  const char* body;
  size_t body_len;
};

typedef inox_status (*HttpHandlerFn)(
  void* user,
  const HttpRequestData* request,
  inox_http_response* response
);

#ifdef __cplusplus

class HttpServer {
private:
  inox_http_server* server_;

public:
  HttpServer();
  explicit HttpServer(inox_http_server* server);

  inox_http_server* raw() const;
  inox_status create(inox_loop* loop, HttpHandlerFn handler, void* user);
  inox_status listen(const char* host, int port, int backlog) const;
  inox_status localPort(int* out_port) const;
  inox_status onRequest(HttpHandlerFn handler, void* user) const;
  void close() const;
};

class HttpRequest {
private:
  const HttpRequestData* request_;

public:
  explicit HttpRequest(const HttpRequestData* request);

  bool methodEquals(inox::StringView method) const;
  bool urlEquals(inox::StringView url) const;
  const HttpRequestData* raw() const;
};

class HttpResponse {
private:
  inox_http_response* response_;

public:
  explicit HttpResponse(inox_http_response* response);

  inox_status setStatus(int status) const;
  inox_status setHeader(inox::StringView name, inox::StringView value) const;
  inox_status writeHead(int status, const HttpHeader* headers, size_t header_count) const;
  inox_status write(inox::StringView bytes) const;
  inox_status end(inox::StringView bytes) const;
  inox_status text(int status, inox::StringView body) const;
  int sendFsFile(const HttpRequest& request, inox::StringView url_prefix, inox::StringView root) const;
};

#endif

#endif
