#include "inox/fetch.h"

#include <cstring>
#include <utility>
#include <vector>

typedef struct fetch_header {
  const char* name;
  size_t name_len;
  const char* value;
  size_t value_len;
} fetch_header;

typedef struct fetch_init {
  const char* method;
  size_t method_len;
  const fetch_header* headers;
  size_t header_count;
  const char* body;
  size_t body_len;
  inox_value signal;
  const char* redirect;
  size_t redirect_len;
} fetch_init;

inox_status fetch_backend_with_init(
  inox_loop* loop,
  const char* url,
  size_t url_len,
  const fetch_init* init,
  inox_promise** out
);
inox_status fetch_backend_response_text(inox_loop* loop, inox_value response, inox_promise** out);
inox_status fetch_backend_headers_has(inox_value headers, const char* name, size_t name_len, int* out);
inox_status fetch_backend_headers_get(inox_allocator* allocator, inox_value headers, const char* name, size_t name_len, inox_value* out);
inox_status fetch_backend_abort_controller_new(inox_allocator* allocator, inox_value* out);
inox_status fetch_backend_abort_controller_signal(inox_value controller, inox_value* out);
inox_status fetch_backend_abort_controller_abort(inox_value controller);

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

  if (fetch_backend_response_text(loop, value_, &promise) != INOX_OK) {
    return Promise();
  }

  return adopt(promise);
}

Promise FetchResponse::text() const {
  inox_promise* promise = nullptr;

  if (!valid()) {
    return Promise();
  }

  if (fetch_backend_response_text(loop(), value_, &promise) != INOX_OK) {
    return Promise();
  }

  return adopt(promise);
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

  if (fetch_backend_with_init(loop, url.bytes, url.len, nullptr, &promise) != INOX_OK) {
    return Promise();
  }

  return adopt(promise);
}

Promise fetch(StringView url) {
  inox_promise* promise = nullptr;

  if (fetch_backend_with_init(loop(), url.bytes, url.len, nullptr, &promise) != INOX_OK) {
    return Promise();
  }

  return adopt(promise);
}

Promise fetch(const char* url) {
  const char* bytes = url == nullptr ? "" : url;
  inox_promise* promise = nullptr;

  if (fetch_backend_with_init(loop(), bytes, strlen(bytes), nullptr, &promise) != INOX_OK) {
    return Promise();
  }

  return adopt(promise);
}

Promise fetch(inox_loop* loop, StringView url, const FetchInit* init) {
  inox_promise* promise = nullptr;
  fetch_init native_init = {};
  std::vector<fetch_header> native_headers;
  const fetch_init* native_init_ptr = nullptr;

  if (init != nullptr) {
    native_headers.reserve(init->header_count);

    for (size_t index = 0; index < init->header_count; ++index) {
      const FetchHeader& header = init->headers[index];
      native_headers.push_back({
        header.name.bytes,
        header.name.len,
        header.value.bytes,
        header.value.len
      });
    }

    native_init.method = init->method.bytes;
    native_init.method_len = init->method.len;
    native_init.headers = native_headers.data();
    native_init.header_count = native_headers.size();
    native_init.body = init->body.bytes;
    native_init.body_len = init->body.len;
    native_init.signal = init->signal.raw();
    native_init.redirect = init->redirect.bytes;
    native_init.redirect_len = init->redirect.len;
    native_init_ptr = &native_init;
  }

  if (fetch_backend_with_init(loop, url.bytes, url.len, native_init_ptr, &promise) != INOX_OK) {
    return Promise();
  }

  return adopt(promise);
}

Promise fetch(StringView url, const FetchInit* init) {
  inox_promise* promise = nullptr;
  fetch_init native_init = {};
  std::vector<fetch_header> native_headers;
  const fetch_init* native_init_ptr = nullptr;

  if (init != nullptr) {
    native_headers.reserve(init->header_count);

    for (size_t index = 0; index < init->header_count; ++index) {
      const FetchHeader& header = init->headers[index];
      native_headers.push_back({
        header.name.bytes,
        header.name.len,
        header.value.bytes,
        header.value.len
      });
    }

    native_init.method = init->method.bytes;
    native_init.method_len = init->method.len;
    native_init.headers = native_headers.data();
    native_init.header_count = native_headers.size();
    native_init.body = init->body.bytes;
    native_init.body_len = init->body.len;
    native_init.signal = init->signal.raw();
    native_init.redirect = init->redirect.bytes;
    native_init.redirect_len = init->redirect.len;
    native_init_ptr = &native_init;
  }

  if (fetch_backend_with_init(loop(), url.bytes, url.len, native_init_ptr, &promise) != INOX_OK) {
    return Promise();
  }

  return adopt(promise);
}

Promise fetch(const char* url, const FetchInit* init) {
  const char* bytes = url == nullptr ? "" : url;
  inox_promise* promise = nullptr;
  fetch_init native_init = {};
  std::vector<fetch_header> native_headers;
  const fetch_init* native_init_ptr = nullptr;

  if (init != nullptr) {
    native_headers.reserve(init->header_count);

    for (size_t index = 0; index < init->header_count; ++index) {
      const FetchHeader& header = init->headers[index];
      native_headers.push_back({
        header.name.bytes,
        header.name.len,
        header.value.bytes,
        header.value.len
      });
    }

    native_init.method = init->method.bytes;
    native_init.method_len = init->method.len;
    native_init.headers = native_headers.data();
    native_init.header_count = native_headers.size();
    native_init.body = init->body.bytes;
    native_init.body_len = init->body.len;
    native_init.signal = init->signal.raw();
    native_init.redirect = init->redirect.bytes;
    native_init.redirect_len = init->redirect.len;
    native_init_ptr = &native_init;
  }

  if (fetch_backend_with_init(loop(), bytes, strlen(bytes), native_init_ptr, &promise) != INOX_OK) {
    return Promise();
  }

  return adopt(promise);
}

bool fetch_headers_has(inox_value headers, StringView name) {
  int out = 0;

  if (fetch_backend_headers_has(headers, name.bytes, name.len, &out) != INOX_OK) {
    throw_value(Value());
    return false;
  }

  return out != 0;
}

Value fetch_headers_get(inox_value headers, StringView name) {
  Value out;

  if (fetch_backend_headers_get(&inox_default_allocator, headers, name.bytes, name.len, out.out()) != INOX_OK) {
    throw_value(Value());
  }

  return out;
}

Value fetch_abort_controller() {
  Value out;

  if (fetch_backend_abort_controller_new(&inox_default_allocator, out.out()) != INOX_OK) {
    throw_value(Value());
  }

  return out;
}

Value fetch_abort_controller_signal(inox_value controller) {
  Value out;

  if (fetch_backend_abort_controller_signal(controller, out.out()) != INOX_OK) {
    throw_value(Value());
  }

  return out;
}

void fetch_abort_controller_abort(inox_value controller) {
  if (fetch_backend_abort_controller_abort(controller) != INOX_OK) {
    throw_value(Value());
  }
}

} // namespace inox
