#include "inox/callback.h"
#ifdef INOX_DEBUG_MEMORY
#include "inox/debug_bridge.h"
#endif

static void inox_callback_dispose_ref(inox_ref* ref) {
  if (ref == 0) {
    return;
  }

  inox_callback* callback = (inox_callback*)ref;

  if (callback->finalizer != 0) {
    callback->finalizer(callback->context);
  }
}

static inox_status inox_callback_new_internal(
  inox_allocator* allocator,
  inox_callback_call_fn call,
  inox_callback_async_call_fn async_call,
  void* context,
  inox_callback_finalizer_fn finalizer,
  inox_value* out
) {
  if (allocator == 0 || allocator->alloc == 0 || (call == 0 && async_call == 0) || out == 0) {
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
  callback->header.dispose = inox_callback_dispose_ref;
  inox_ref_init_weak(&callback->header);
  callback->call = call;
  callback->async_call = async_call;
  callback->context = context;
  callback->finalizer = finalizer;

  out->tag = INOX_TAG_FUNCTION;
  out->as.ref = &callback->header;
#ifdef INOX_DEBUG_MEMORY
  inox_debug_memory_record_ref_created(INOX_REF_FUNCTION);
#endif

  return INOX_OK;
}

inox_status inox_callback_new(
  inox_allocator* allocator,
  inox_callback_call_fn call,
  void* context,
  inox_callback_finalizer_fn finalizer,
  inox_value* out
) {
  if (call == 0) {
    return INOX_ERR_TYPE;
  }

  return inox_callback_new_internal(allocator, call, 0, context, finalizer, out);
}

inox_status inox_callback_new_async(
  inox_allocator* allocator,
  inox_callback_async_call_fn call,
  void* context,
  inox_callback_finalizer_fn finalizer,
  inox_value* out
) {
  if (call == 0) {
    return INOX_ERR_TYPE;
  }

  return inox_callback_new_internal(allocator, 0, call, context, finalizer, out);
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

inox_status inox_callback_call_async(
  inox_value callback,
  const inox_value* args,
  size_t arg_count,
  void* out
) {
  if (out == 0 || callback.tag != INOX_TAG_FUNCTION || callback.as.ref == 0) {
    return INOX_ERR_TYPE;
  }

  if (callback.as.ref->kind != INOX_REF_FUNCTION || (args == 0 && arg_count != 0)) {
    return INOX_ERR_TYPE;
  }

  inox_callback* instance = (inox_callback*)callback.as.ref;

  if (instance->async_call == 0) {
    return INOX_ERR_TYPE;
  }

  return instance->async_call(instance->context, args, arg_count, out);
}

inox_status inox_shared_number_box_new(inox_allocator* allocator, double value, inox_shared_number_box** out) {
  if (allocator == 0 || allocator->alloc == 0 || out == 0) {
    return INOX_ERR_TYPE;
  }

  inox_shared_number_box* box =
    allocator->alloc(allocator->user, sizeof(inox_shared_number_box), _Alignof(inox_shared_number_box));

  if (box == 0) {
    *out = 0;
    return INOX_ERR_OOM;
  }

  box->ref_count = 1;
  box->allocator = allocator;
  box->value = value;
  *out = box;
  return INOX_OK;
}

void inox_shared_number_box_retain(inox_shared_number_box* box) {
  if (box != 0) {
    box->ref_count += 1;
  }
}

void inox_shared_number_box_release(inox_shared_number_box* box) {
  if (box == 0 || box->ref_count == 0) {
    return;
  }

  box->ref_count -= 1;

  if (box->ref_count != 0) {
    return;
  }

  inox_allocator* allocator = box->allocator;

  if (allocator != 0 && allocator->free != 0) {
    allocator->free(allocator->user, box, sizeof(inox_shared_number_box), _Alignof(inox_shared_number_box));
  }
}

inox_status inox_shared_value_box_new(inox_allocator* allocator, inox_value value, inox_shared_value_box** out) {
  if (allocator == 0 || allocator->alloc == 0 || out == 0) {
    return INOX_ERR_TYPE;
  }

  inox_shared_value_box* box =
    allocator->alloc(allocator->user, sizeof(inox_shared_value_box), _Alignof(inox_shared_value_box));

  if (box == 0) {
    *out = 0;
    return INOX_ERR_OOM;
  }

  box->ref_count = 1;
  box->allocator = allocator;
  box->value = value;
  inox_retain(box->value);
  *out = box;
  return INOX_OK;
}

void inox_shared_value_box_retain(inox_shared_value_box* box) {
  if (box != 0) {
    box->ref_count += 1;
  }
}

void inox_shared_value_box_release(inox_shared_value_box* box) {
  if (box == 0 || box->ref_count == 0) {
    return;
  }

  box->ref_count -= 1;

  if (box->ref_count != 0) {
    return;
  }

  inox_release(box->value);
  inox_allocator* allocator = box->allocator;

  if (allocator != 0 && allocator->free != 0) {
    allocator->free(allocator->user, box, sizeof(inox_shared_value_box), _Alignof(inox_shared_value_box));
  }
}
