#ifndef INOX_CALLBACK_H
#define INOX_CALLBACK_H

#include <stddef.h>
#include "inox/allocator.h"
#include "inox/value.h"

typedef inox_status (*inox_callback_call_fn)(void* context, const inox_value* args, size_t arg_count, inox_value* out);
typedef void (*inox_callback_finalizer_fn)(void* context);

typedef struct inox_callback {
  inox_ref header;
  inox_callback_call_fn call;
  void* context;
  inox_callback_finalizer_fn finalizer;
} inox_callback;

inox_status inox_callback_new(
  inox_allocator* allocator,
  inox_callback_call_fn call,
  void* context,
  inox_callback_finalizer_fn finalizer,
  inox_value* out
);
inox_status inox_callback_call(inox_value callback, const inox_value* args, size_t arg_count, inox_value* out);

#endif
