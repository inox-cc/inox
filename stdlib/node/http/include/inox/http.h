#ifndef INOX_HTTP_H
#define INOX_HTTP_H

#include <optional>

#include "inox/array.h"
#include "inox/binary.h"
#include "inox/callback.h"
#include "inox/net.h"
#include "inox/string.h"
#include "inox/string_view.h"
#include "inox/value.h"

class HttpListenOptions {
public:
  HttpListenOptions();
  explicit HttpListenOptions(const inox::Value& value);

private:
  bool valid_;
  std::optional<double> port_;
  std::optional<inox::String> host_;
  std::optional<double> backlog_;

  friend class HttpServer;
};

class HttpRequestOptions {
public:
  HttpRequestOptions();
  explicit HttpRequestOptions(const inox::Value& value);
  const inox::Value& headers() const;
  const std::optional<inox::String>& host() const;
  const std::optional<inox::String>& hostname() const;
  const std::optional<inox::String>& method() const;
  const std::optional<inox::String>& path() const;
  const std::optional<double>& port() const;
  bool valid() const;

private:
  bool valid_;
  std::optional<inox::String> host_;
  std::optional<inox::String> hostname_;
  std::optional<inox::String> method_;
  std::optional<inox::String> path_;
  std::optional<double> port_;
  inox::Value headers_;

  friend class HttpModule;
};

class HttpHeaders {
public:
  HttpHeaders();
  explicit HttpHeaders(const inox::Value& value);

private:
  inox::Value value_;

  friend class HttpResponse;
};

class HttpServer : public inox::Value {
public:
  HttpServer();
  explicit HttpServer(const inox::Value& value);
  explicit HttpServer(inox::Value&& value);

  using inox::Value::operator=;

  NetAddress address() const;
  HttpServer& close();
  HttpServer& close(inox::Callback callback);
  HttpServer& listen();
  HttpServer& listen(inox::Callback callback);
  HttpServer& listen(double port);
  HttpServer& listen(double port, inox::Callback callback);
  HttpServer& listen(double port, inox::StringView host);
  HttpServer& listen(double port, inox::StringView host, inox::Callback callback);
  HttpServer& listen(double port, inox::StringView host, double backlog, inox::Callback callback);
  HttpServer& listen(const HttpListenOptions& options);
  HttpServer& listen(const HttpListenOptions& options, inox::Callback callback);
  HttpServer& on(inox::StringView event_name, inox::Callback listener);
};

class HttpRequest : public inox::Value {
public:
  HttpRequest();
  explicit HttpRequest(const inox::Value& value);
  explicit HttpRequest(inox::Value&& value);

  using inox::Value::operator=;

  inox::Value headers() const;
  inox::String httpVersion() const;
  inox::String method() const;
  HttpRequest& on(inox::StringView event_name, inox::Callback listener);
  HttpRequest& setEncoding(inox::StringView encoding);
  NetSocket socket() const;
  inox::Value statusCode() const;
  inox::Value statusMessage() const;
  inox::String url() const;
};

class HttpClientRequest : public inox::Value {
public:
  HttpClientRequest();
  explicit HttpClientRequest(const inox::Value& value);
  explicit HttpClientRequest(inox::Value&& value);

  using inox::Value::operator=;

  HttpClientRequest& destroy();
  HttpClientRequest& end();
  HttpClientRequest& end(inox::StringView body);
  HttpClientRequest& end(const Uint8Array& body);
  inox::Value getHeader(inox::StringView name) const;
  Array getHeaderNames() const;
  bool hasHeader(inox::StringView name) const;
  bool headersSent() const;
  HttpClientRequest& on(inox::StringView event_name, inox::Callback listener);
  void removeHeader(inox::StringView name);
  HttpClientRequest& setHeader(inox::StringView name, inox::StringView value);
  bool writableEnded() const;
  bool write(inox::StringView body);
  bool write(const Uint8Array& body);
};

class HttpResponse : public inox::Value {
public:
  HttpResponse();
  explicit HttpResponse(const inox::Value& value);
  explicit HttpResponse(inox::Value&& value);

  using inox::Value::operator=;

  void end();
  void end(inox::StringView body);
  void end(const Uint8Array& body);
  inox::Value getHeader(inox::StringView name) const;
  Array getHeaderNames() const;
  bool hasHeader(inox::StringView name) const;
  bool headersSent() const;
  void removeHeader(inox::StringView name);
  HttpResponse& setHeader(inox::StringView name, inox::StringView value);
  void setStatusCode(double value);
  double statusCode() const;
  bool writableEnded() const;
  bool write(inox::StringView body);
  bool write(const Uint8Array& body);
  HttpResponse& writeHead(double status_code);
  HttpResponse& writeHead(double status_code, const HttpHeaders& headers);
};

class HttpModule {
public:
  HttpServer createServer() const;
  HttpServer createServer(inox::Callback listener) const;
  HttpClientRequest get(inox::StringView url) const;
  HttpClientRequest get(inox::StringView url, inox::Callback listener) const;
  HttpClientRequest get(inox::StringView url, const HttpRequestOptions& options) const;
  HttpClientRequest get(inox::StringView url, const HttpRequestOptions& options, inox::Callback listener) const;
  HttpClientRequest get(const HttpRequestOptions& options) const;
  HttpClientRequest get(const HttpRequestOptions& options, inox::Callback listener) const;
  HttpClientRequest request(inox::StringView url) const;
  HttpClientRequest request(inox::StringView url, inox::Callback listener) const;
  HttpClientRequest request(inox::StringView url, const HttpRequestOptions& options) const;
  HttpClientRequest request(inox::StringView url, const HttpRequestOptions& options, inox::Callback listener) const;
  HttpClientRequest request(const HttpRequestOptions& options) const;
  HttpClientRequest request(const HttpRequestOptions& options, inox::Callback listener) const;
};

extern const HttpModule http;

#endif
