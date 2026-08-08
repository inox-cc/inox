#ifndef INOX_HTTPS_H
#define INOX_HTTPS_H

#include <optional>
#include <string>

#include "inox/http.h"
#include "inox/string.h"
#include "inox/string_view.h"
#include "inox/value.h"

class HttpsRequestOptions {
public:
  HttpsRequestOptions();
  explicit HttpsRequestOptions(const inox::Value& value);

  const HttpRequestOptions& requestOptions() const;
  bool verifyPeer() const;
  const std::optional<inox::String>& serverName() const;
  bool valid() const;

private:
  HttpRequestOptions request_options_;
  bool verify_peer_;
  std::optional<inox::String> server_name_;
  bool valid_;
};

class HttpsServerOptions {
public:
  HttpsServerOptions();
  explicit HttpsServerOptions(const inox::Value& value);

  inox::StringView certificate() const;
  inox::StringView privateKey() const;
  bool valid() const;

private:
  std::string certificate_;
  std::string private_key_;
  bool valid_;
};

class HttpsModule {
public:
  HttpServer createServer(const HttpsServerOptions& options) const;
  HttpServer createServer(
    const HttpsServerOptions& options,
    inox::Callback listener
  ) const;
  HttpClientRequest get(inox::StringView url) const;
  HttpClientRequest get(inox::StringView url, inox::Callback listener) const;
  HttpClientRequest get(inox::StringView url, const HttpsRequestOptions& options) const;
  HttpClientRequest get(
    inox::StringView url,
    const HttpsRequestOptions& options,
    inox::Callback listener
  ) const;
  HttpClientRequest get(const HttpsRequestOptions& options) const;
  HttpClientRequest get(const HttpsRequestOptions& options, inox::Callback listener) const;
  HttpClientRequest request(inox::StringView url) const;
  HttpClientRequest request(inox::StringView url, inox::Callback listener) const;
  HttpClientRequest request(inox::StringView url, const HttpsRequestOptions& options) const;
  HttpClientRequest request(
    inox::StringView url,
    const HttpsRequestOptions& options,
    inox::Callback listener
  ) const;
  HttpClientRequest request(const HttpsRequestOptions& options) const;
  HttpClientRequest request(const HttpsRequestOptions& options, inox::Callback listener) const;
};

extern const HttpsModule https;

#endif
