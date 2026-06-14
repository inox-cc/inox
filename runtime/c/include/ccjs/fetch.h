#ifndef CCJS_FETCH_H
#define CCJS_FETCH_H

#include <stdbool.h>
#include <stddef.h>
#include "ccjs/loop.h"
#include "ccjs/promise.h"
#include "ccjs/value.h"

typedef struct ccjs_fetch_response {
  int status;
  bool ok;
  const char* headers;
  size_t headers_len;
  const char* body;
  size_t body_len;
} ccjs_fetch_response;

typedef struct ccjs_fetch_header {
  const char* name;
  size_t name_len;
  const char* value;
  size_t value_len;
} ccjs_fetch_header;

typedef struct ccjs_fetch_init {
  const char* method;
  size_t method_len;
  const ccjs_fetch_header* headers;
  size_t header_count;
  const char* body;
  size_t body_len;
  ccjs_value signal;
} ccjs_fetch_init;

typedef ccjs_status (*ccjs_fetch_done_fn)(void* user, ccjs_status status, const ccjs_fetch_response* response);

ccjs_status ccjs_fetch_get(ccjs_loop* loop, const char* url, ccjs_fetch_done_fn done, void* user);
ccjs_status ccjs_fetch_request(ccjs_loop* loop, const char* url, const ccjs_fetch_init* init, ccjs_fetch_done_fn done, void* user);
ccjs_status ccjs_fetch(ccjs_loop* loop, const char* url, size_t url_len, ccjs_promise** out);
ccjs_status ccjs_fetch_with_init(
  ccjs_loop* loop,
  const char* url,
  size_t url_len,
  const ccjs_fetch_init* init,
  ccjs_promise** out
);
ccjs_status ccjs_fetch_response_text(ccjs_loop* loop, ccjs_value response, ccjs_promise** out);
ccjs_status ccjs_fetch_abort_controller_new(ccjs_allocator* allocator, ccjs_value* out);
ccjs_status ccjs_fetch_abort_controller_signal(ccjs_value controller, ccjs_value* out);
ccjs_status ccjs_fetch_abort_controller_abort(ccjs_value controller);
ccjs_status ccjs_fetch_signal_aborted(ccjs_value signal, int* out);

#endif
