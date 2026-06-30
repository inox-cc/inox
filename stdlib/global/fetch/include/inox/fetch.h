#ifndef INOX_FETCH_H
#define INOX_FETCH_H

#include <stdbool.h>
#include <stddef.h>
#include "inox/loop.h"
#include "inox/promise.h"
#include "inox/value.h"

#ifdef __cplusplus
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
#endif

#endif
