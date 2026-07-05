#include "inox/fetch.h"

#include <utility>

namespace inox {

FetchResponse::FetchResponse() : value_() {}

FetchResponse::FetchResponse(Value value) : value_(std::move(value)) {}

bool FetchResponse::valid() const {
  inox_value value = value_.raw();

  return value.tag == INOX_TAG_OBJECT && value.as.ref != nullptr;
}

inox_number FetchResponse::status() const {
  Value value;

  if (!number_field("status", 6, value)) {
    return 0;
  }

  return value.as.number;
}

bool FetchResponse::ok() const {
  Value value;

  return bool_field("ok", 2, value) && value.as.boolean;
}

bool FetchResponse::redirected() const {
  Value value;

  return bool_field("redirected", 10, value) && value.as.boolean;
}

Promise FetchResponse::text(inox_loop* loop) const {
  inox_promise* promise = nullptr;

  if (!valid()) {
    return Promise();
  }

  if (inox_fetch_response_text(loop, value_, &promise) != INOX_OK) {
    return Promise();
  }

  return adopt(promise);
}

Promise FetchResponse::text() const {
  return text(loop());
}

inox_value FetchResponse::raw() const {
  return value_.raw();
}

FetchResponse::operator inox_value() const {
  return value_.raw();
}

bool FetchResponse::field(const char* name, size_t len, Value& out) const {
  return valid() && inox_object_get(value_, name, len, out.out()) == INOX_OK;
}

bool FetchResponse::number_field(const char* name, size_t len, Value& out) const {
  return field(name, len, out) && out.tag == INOX_TAG_NUMBER;
}

bool FetchResponse::bool_field(const char* name, size_t len, Value& out) const {
  return field(name, len, out) && out.tag == INOX_TAG_BOOL;
}

Promise fetch(inox_loop* loop, StringView url) {
  inox_promise* promise = nullptr;

  if (inox_fetch(loop, url, &promise) != INOX_OK) {
    return Promise();
  }

  return adopt(promise);
}

Promise fetch(StringView url) {
  return fetch(loop(), url);
}

Promise fetch(const char* url) {
  return fetch(StringView(url));
}

Promise fetch(inox_loop* loop, StringView url, const inox_fetch_init* init) {
  inox_promise* promise = nullptr;

  if (inox_fetch_with_init(loop, url, init, &promise) != INOX_OK) {
    return Promise();
  }

  return adopt(promise);
}

Promise fetch(StringView url, const inox_fetch_init* init) {
  return fetch(loop(), url, init);
}

Promise fetch(const char* url, const inox_fetch_init* init) {
  return fetch(StringView(url), init);
}

} // namespace inox
