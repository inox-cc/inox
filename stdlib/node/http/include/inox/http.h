#ifndef INOX_HTTP_H
#define INOX_HTTP_H

#include <stddef.h>

#include "inox/string_view.h"

struct inox_http_server;
struct inox_http_response;

struct HttpHeader {
  inox::StringView name;
  inox::StringView value;
};

struct HttpRequestData {
  inox::StringView method;
  inox::StringView url;
  const HttpHeader* headers;
  size_t header_count;
  inox::StringView body;
};

#ifdef __cplusplus

class HttpRequest;
class HttpResponse;

typedef void (*HttpHandlerFn)(void* user, HttpRequest request, HttpResponse response);

class HttpServer {
private:
  inox_http_server* server_;

public:
  HttpServer();
  explicit HttpServer(inox_http_server* server);

  inox_http_server* raw() const;
  void create(HttpHandlerFn handler, void* user);
  void listen(inox::StringView host, int port, int backlog) const;
  int localPort() const;
  void onRequest(HttpHandlerFn handler, void* user) const;
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

  void setStatus(int status) const;
  void setHeader(inox::StringView name, inox::StringView value) const;
  void writeHead(int status, const HttpHeader* headers, size_t header_count) const;
  void write(inox::StringView bytes) const;
  void end(inox::StringView bytes) const;
  void text(int status, inox::StringView body) const;
  int sendFsFile(const HttpRequest& request, inox::StringView url_prefix, inox::StringView root) const;
};

#endif

#endif
