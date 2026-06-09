#ifndef CCJS_CALLBACK_H
#define CCJS_CALLBACK_H

#include <stddef.h>
#include "ccjs/allocator.h"
#include "ccjs/value.h"

typedef ccjs_status (*ccjs_callback_call_fn)(void* context, const ccjs_value* args, size_t arg_count, ccjs_value* out);
typedef void (*ccjs_callback_finalizer_fn)(void* context);

typedef struct ccjs_callback {
  ccjs_ref header;
  ccjs_callback_call_fn call;
  void* context;
  ccjs_callback_finalizer_fn finalizer;
} ccjs_callback;

ccjs_status ccjs_callback_new(
  ccjs_allocator* allocator,
  ccjs_callback_call_fn call,
  void* context,
  ccjs_callback_finalizer_fn finalizer,
  ccjs_value* out
);
ccjs_status ccjs_callback_call(ccjs_value callback, const ccjs_value* args, size_t arg_count, ccjs_value* out);

#endif
