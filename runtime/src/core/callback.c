#include "inox/callback.h"
#ifdef INOX_DEBUG_MEMORY
#include "inox/debug.h"
#endif

inox_status inox_callback_new(
  inox_allocator* allocator,
  inox_callback_call_fn call,
  void* context,
  inox_callback_finalizer_fn finalizer,
  inox_value* out
) {
  if (allocator == 0 || allocator->alloc == 0 || call == 0 || out == 0) {
    return INOX_ERR_TYPE;
  }

  inox_callback* callback = allocator->alloc(allocator->user, sizeof(inox_callback), _Alignof(inox_callback));

  if (callback == 0) {
    *out = inox_undefined_value();
    return INOX_ERR_OOM;
  }

  callback->header.kind = INOX_REF_FUNCTION;
  callback->header.ref_count = 1;
  callback->header.flags = 0;
  callback->header.size = sizeof(inox_callback);
  callback->header.align = _Alignof(inox_callback);
  callback->header.allocator = allocator;
  inox_ref_init_weak(&callback->header);
  callback->call = call;
  callback->context = context;
  callback->finalizer = finalizer;

  out->tag = INOX_TAG_FUNCTION;
  out->as.ref = &callback->header;
#ifdef INOX_DEBUG_MEMORY
  inox_debug_memory_record_ref_created(INOX_REF_FUNCTION);
#endif

  return INOX_OK;
}

inox_status inox_callback_call(inox_value callback, const inox_value* args, size_t arg_count, inox_value* out) {
  if (out == 0 || callback.tag != INOX_TAG_FUNCTION || callback.as.ref == 0) {
    return INOX_ERR_TYPE;
  }

  if (callback.as.ref->kind != INOX_REF_FUNCTION) {
    return INOX_ERR_TYPE;
  }

  if (args == 0 && arg_count != 0) {
    return INOX_ERR_TYPE;
  }

  inox_callback* instance = (inox_callback*)callback.as.ref;

  if (instance->call == 0) {
    return INOX_ERR_TYPE;
  }

  *out = inox_undefined_value();

  return instance->call(instance->context, args, arg_count, out);
}
