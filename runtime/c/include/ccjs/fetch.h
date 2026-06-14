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
  const char* body;
  size_t body_len;
} ccjs_fetch_response;

typedef ccjs_status (*ccjs_fetch_done_fn)(void* user, ccjs_status status, const ccjs_fetch_response* response);

ccjs_status ccjs_fetch_get(ccjs_loop* loop, const char* url, ccjs_fetch_done_fn done, void* user);
ccjs_status ccjs_fetch(ccjs_loop* loop, const char* url, size_t url_len, ccjs_promise** out);
ccjs_status ccjs_fetch_response_text(ccjs_loop* loop, ccjs_value response, ccjs_promise** out);

#endif
