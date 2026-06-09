#include "ccjs/callback.h"

ccjs_status ccjs_callback_new(
  ccjs_allocator* allocator,
  ccjs_callback_call_fn call,
  void* context,
  ccjs_callback_finalizer_fn finalizer,
  ccjs_value* out
) {
  if (allocator == 0 || allocator->alloc == 0 || call == 0 || out == 0) {
    return CCJS_ERR_TYPE;
  }

  ccjs_callback* callback = allocator->alloc(allocator->user, sizeof(ccjs_callback), _Alignof(ccjs_callback));

  if (callback == 0) {
    *out = ccjs_undefined_value();
    return CCJS_ERR_OOM;
  }

  callback->header.kind = CCJS_REF_FUNCTION;
  callback->header.ref_count = 1;
  callback->header.flags = 0;
  callback->header.size = sizeof(ccjs_callback);
  callback->header.align = _Alignof(ccjs_callback);
  callback->header.allocator = allocator;
  callback->call = call;
  callback->context = context;
  callback->finalizer = finalizer;

  out->tag = CCJS_TAG_FUNCTION;
  out->as.ref = &callback->header;

  return CCJS_OK;
}

ccjs_status ccjs_callback_call(ccjs_value callback, const ccjs_value* args, size_t arg_count, ccjs_value* out) {
  if (out == 0 || callback.tag != CCJS_TAG_FUNCTION || callback.as.ref == 0) {
    return CCJS_ERR_TYPE;
  }

  if (callback.as.ref->kind != CCJS_REF_FUNCTION) {
    return CCJS_ERR_TYPE;
  }

  if (args == 0 && arg_count != 0) {
    return CCJS_ERR_TYPE;
  }

  ccjs_callback* instance = (ccjs_callback*)callback.as.ref;

  if (instance->call == 0) {
    return CCJS_ERR_TYPE;
  }

  *out = ccjs_undefined_value();

  return instance->call(instance->context, args, arg_count, out);
}
