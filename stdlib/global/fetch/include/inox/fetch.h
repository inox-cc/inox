#ifndef INOX_FETCH_H
#define INOX_FETCH_H

#include <stdbool.h>
#include <stddef.h>
#include "inox/loop.h"
#include "inox/promise.h"
#include "inox/value.h"

#ifdef __cplusplus
#include "inox/object.h"
#include "inox/string.h"
#include "inox/string_view.h"

extern "C" {
#endif

typedef struct inox_fetch_response {
  int status;
  bool ok;
  bool redirected;
  const char* url;
  size_t url_len;
  const char* status_text;
  size_t status_text_len;
  const char* headers;
  size_t headers_len;
  const char* body;
  size_t body_len;
} inox_fetch_response;

typedef struct inox_fetch_header {
  const char* name;
  size_t name_len;
  const char* value;
  size_t value_len;
} inox_fetch_header;

typedef struct inox_fetch_init {
  const char* method;
  size_t method_len;
  const inox_fetch_header* headers;
  size_t header_count;
  const char* body;
  size_t body_len;
  inox_value signal;
  const char* redirect;
  size_t redirect_len;
} inox_fetch_init;

typedef inox_status (*inox_fetch_done_fn)(void* user, inox_status status, const inox_fetch_response* response);

inox_status inox_fetch_get(inox_loop* loop, const char* url, inox_fetch_done_fn done, void* user);
inox_status inox_fetch_request(inox_loop* loop, const char* url, const inox_fetch_init* init, inox_fetch_done_fn done, void* user);
inox_status inox_fetch(inox_loop* loop, const char* url, size_t url_len, inox_promise** out);
inox_status inox_fetch_with_init(
  inox_loop* loop,
  const char* url,
  size_t url_len,
  const inox_fetch_init* init,
  inox_promise** out
);
inox_status inox_fetch_response_text(inox_loop* loop, inox_value response, inox_promise** out);
inox_status inox_fetch_headers_get(inox_allocator* allocator, inox_value headers, const char* name, size_t name_len, inox_value* out);
inox_status inox_fetch_headers_has(inox_value headers, const char* name, size_t name_len, int* out);
inox_status inox_fetch_abort_controller_new(inox_allocator* allocator, inox_value* out);
inox_status inox_fetch_abort_controller_signal(inox_value controller, inox_value* out);
inox_status inox_fetch_abort_controller_abort(inox_value controller);
inox_status inox_fetch_signal_aborted(inox_value signal, int* out);

#ifdef __cplusplus
}

inline inox_status inox_fetch(inox_loop* loop, inox::StringView url, inox_promise** out) {
  return inox_fetch(loop, url.bytes, url.len, out);
}

inline inox_status inox_fetch_with_init(
  inox_loop* loop,
  inox::StringView url,
  const inox_fetch_init* init,
  inox_promise** out
) {
  return inox_fetch_with_init(loop, url.bytes, url.len, init, out);
}

namespace inox {

class FetchResponse {
private:
  Value value_;

public:
  FetchResponse() : value_() {}

  explicit FetchResponse(Value value) : value_(std::move(value)) {}

  bool valid() const {
    inox_value value = value_.raw();

    return value.tag == INOX_TAG_OBJECT && value.as.ref != nullptr;
  }

  inox_number status() const {
    Value value;

    if (!number_field("status", 6, value)) {
      return 0;
    }

    return value.as.number;
  }

  bool ok() const {
    Value value;

    return bool_field("ok", 2, value) && value.as.boolean;
  }

  bool redirected() const {
    Value value;

    return bool_field("redirected", 10, value) && value.as.boolean;
  }

  Promise text(inox_loop* loop) const {
    inox_promise* promise = nullptr;

    if (!valid()) {
      return Promise();
    }

    if (inox_fetch_response_text(loop, value_, &promise) != INOX_OK) {
      return Promise();
    }

    return adopt(promise);
  }

  inox_value raw() const {
    return value_.raw();
  }

  operator inox_value() const {
    return value_.raw();
  }

private:
  bool field(const char* name, size_t len, Value& out) const {
    return valid() && inox_object_get(value_, name, len, out.out()) == INOX_OK;
  }

  bool number_field(const char* name, size_t len, Value& out) const {
    return field(name, len, out) && out.tag == INOX_TAG_NUMBER;
  }

  bool bool_field(const char* name, size_t len, Value& out) const {
    return field(name, len, out) && out.tag == INOX_TAG_BOOL;
  }
};

inline Promise fetch(inox_loop* loop, StringView url) {
  inox_promise* promise = nullptr;

  if (inox_fetch(loop, url, &promise) != INOX_OK) {
    return Promise();
  }

  return adopt(promise);
}

inline Promise fetch(inox_loop* loop, StringView url, const inox_fetch_init* init) {
  inox_promise* promise = nullptr;

  if (inox_fetch_with_init(loop, url, init, &promise) != INOX_OK) {
    return Promise();
  }

  return adopt(promise);
}

} // namespace inox
#endif

#endif
