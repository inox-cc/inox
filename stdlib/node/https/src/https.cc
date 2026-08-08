#include "inox/https.h"

#include <utility>

#include "inox/loop.h"
#include "inox/object.h"

namespace {

void throwHttpsError(const char* message) {
  inox::throw_value(inox::String(message));
}

bool readOptionalBoolean(const inox::Value& options, const char* name, bool& out) {
  inox::Value value = inox::get(options.raw(), name);

  if (inox::thrown()) {
    return false;
  }

  if (value.tag == INOX_TAG_UNDEFINED) {
    return true;
  }

  if (value.tag != INOX_TAG_BOOL) {
    throwHttpsError("TypeError: node:https boolean option is invalid");
    return false;
  }

  out = value.as.boolean;
  return true;
}

bool readOptionalString(
  const inox::Value& options,
  const char* name,
  std::optional<inox::String>& out
) {
  inox::Value value = inox::get(options.raw(), name);

  if (inox::thrown()) {
    return false;
  }

  if (value.tag == INOX_TAG_UNDEFINED) {
    return true;
  }

  if (value.tag != INOX_TAG_STRING || value.raw().as.ref == nullptr) {
    throwHttpsError("TypeError: node:https string option is invalid");
    return false;
  }

  out = inox::String(value);
  return !inox::thrown();
}

HttpClientTransportOptions transport(const HttpsRequestOptions& options) {
  return HttpClientTransportOptions::tls(options.verifyPeer(), options.serverName());
}

HttpClientRequest createHttpsClientRequest(
  inox::StringView url,
  const HttpsRequestOptions* options,
  inox::Callback listener,
  bool end_immediately
) {
  if (options != nullptr && !options->valid()) {
    throwHttpsError("TypeError: node:https request options are invalid");
    return HttpClientRequest();
  }

  const HttpClientTransportOptions transport_options = options == nullptr
    ? HttpClientTransportOptions::tls()
    : transport(*options);

  if (options == nullptr) {
    return createHttpClientRequest(url, std::move(listener), end_immediately, transport_options);
  }

  return createHttpClientRequest(url, options->requestOptions(), std::move(listener), end_immediately, transport_options);
}

} // namespace

HttpsRequestOptions::HttpsRequestOptions()
  : request_options_(), verify_peer_(true), server_name_(), valid_(true) {}

HttpsRequestOptions::HttpsRequestOptions(const inox::Value& value)
  : request_options_(value), verify_peer_(true), server_name_(), valid_(false) {
  if (!request_options_.valid() ||
      !readOptionalBoolean(value, "rejectUnauthorized", verify_peer_) ||
      !readOptionalString(value, "servername", server_name_)) {
    return;
  }

  valid_ = true;
}

const HttpRequestOptions& HttpsRequestOptions::requestOptions() const {
  return request_options_;
}

bool HttpsRequestOptions::verifyPeer() const {
  return verify_peer_;
}

const std::optional<inox::String>& HttpsRequestOptions::serverName() const {
  return server_name_;
}

bool HttpsRequestOptions::valid() const {
  return valid_;
}

HttpClientRequest HttpsModule::get(inox::StringView url) const {
  return createHttpsClientRequest(url, nullptr, inox::Callback(), true);
}

HttpClientRequest HttpsModule::get(inox::StringView url, inox::Callback listener) const {
  return createHttpsClientRequest(url, nullptr, std::move(listener), true);
}

HttpClientRequest HttpsModule::get(inox::StringView url, const HttpsRequestOptions& options) const {
  return createHttpsClientRequest(url, &options, inox::Callback(), true);
}

HttpClientRequest HttpsModule::get(
  inox::StringView url,
  const HttpsRequestOptions& options,
  inox::Callback listener
) const {
  return createHttpsClientRequest(url, &options, std::move(listener), true);
}

HttpClientRequest HttpsModule::get(const HttpsRequestOptions& options) const {
  return createHttpsClientRequest(inox::StringView(), &options, inox::Callback(), true);
}

HttpClientRequest HttpsModule::get(const HttpsRequestOptions& options, inox::Callback listener) const {
  return createHttpsClientRequest(inox::StringView(), &options, std::move(listener), true);
}

HttpClientRequest HttpsModule::request(inox::StringView url) const {
  return createHttpsClientRequest(url, nullptr, inox::Callback(), false);
}

HttpClientRequest HttpsModule::request(inox::StringView url, inox::Callback listener) const {
  return createHttpsClientRequest(url, nullptr, std::move(listener), false);
}

HttpClientRequest HttpsModule::request(
  inox::StringView url,
  const HttpsRequestOptions& options
) const {
  return createHttpsClientRequest(url, &options, inox::Callback(), false);
}

HttpClientRequest HttpsModule::request(
  inox::StringView url,
  const HttpsRequestOptions& options,
  inox::Callback listener
) const {
  return createHttpsClientRequest(url, &options, std::move(listener), false);
}

HttpClientRequest HttpsModule::request(const HttpsRequestOptions& options) const {
  return createHttpsClientRequest(inox::StringView(), &options, inox::Callback(), false);
}

HttpClientRequest HttpsModule::request(
  const HttpsRequestOptions& options,
  inox::Callback listener
) const {
  return createHttpsClientRequest(inox::StringView(), &options, std::move(listener), false);
}

const HttpsModule https;
