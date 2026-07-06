#ifdef INOX_DEBUG_MEMORY
#include "inox/debug_bridge.h"
#endif
#include "inox/class_descriptor.h"

static void inox_class_instance_ref_dispose(inox_ref* header) {
  if (header == 0) {
    return;
  }

  inox_class_instance_ref* ref = (inox_class_instance_ref*)header;

  if (
    ref->owns_instance &&
    ref->descriptor != 0 &&
    ref->descriptor->destroy_instance != 0 &&
    ref->instance != 0
  ) {
    ref->descriptor->destroy_instance(header->allocator, (void*)ref->instance);
    ref->instance = 0;
  }
}

static inox_status inox_class_instance_ref_wrap(
  inox_allocator* allocator,
  const inox_class_descriptor* descriptor,
  const void* instance,
  bool owns_instance,
  inox_value* out
) {
  if (allocator == 0 || allocator->alloc == 0 || descriptor == 0 || instance == 0 || out == 0) {
    return INOX_ERR_TYPE;
  }

  inox_class_instance_ref* ref = allocator->alloc(allocator->user, sizeof(inox_class_instance_ref), _Alignof(inox_class_instance_ref));

  if (ref == 0) {
    *out = inox_undefined_value();
    return INOX_ERR_OOM;
  }

  ref->header.kind = INOX_REF_CLASS_INSTANCE;
  ref->header.ref_count = 1;
  ref->header.flags = 0;
  ref->header.size = sizeof(inox_class_instance_ref);
  ref->header.align = _Alignof(inox_class_instance_ref);
  ref->header.allocator = allocator;
  ref->header.dispose = inox_class_instance_ref_dispose;
  inox_ref_init_weak(&ref->header);
  ref->descriptor = descriptor;
  ref->instance = instance;
  ref->owns_instance = owns_instance;

  out->tag = INOX_TAG_CLASS_INSTANCE;
  out->as.ref = &ref->header;
#ifdef INOX_DEBUG_MEMORY
  inox_debug_memory_record_ref_created(INOX_REF_CLASS_INSTANCE);
#endif

  return INOX_OK;
}

inox_status inox_class_instance_ref_new(
  inox_allocator* allocator,
  const inox_class_descriptor* descriptor,
  const void* instance,
  inox_value* out
) {
  return inox_class_instance_ref_wrap(allocator, descriptor, instance, false, out);
}

inox_status inox_class_instance_ref_copy(
  inox_allocator* allocator,
  const inox_class_descriptor* descriptor,
  const void* instance,
  inox_value* out
) {
  if (
    allocator == 0 ||
    allocator->alloc == 0 ||
    allocator->free == 0 ||
    descriptor == 0 ||
    descriptor->copy_instance == 0 ||
    descriptor->destroy_instance == 0 ||
    instance == 0 ||
    out == 0
  ) {
    return INOX_ERR_TYPE;
  }

  void* instance_copy = 0;
  inox_status status = descriptor->copy_instance(allocator, instance, &instance_copy);

  if (status != INOX_OK) {
    *out = inox_undefined_value();
    return status;
  }

  if (instance_copy == 0) {
    *out = inox_undefined_value();
    return INOX_ERR_OOM;
  }

  status = inox_class_instance_ref_wrap(allocator, descriptor, instance_copy, true, out);

  if (status != INOX_OK) {
    descriptor->destroy_instance(allocator, instance_copy);
  }

  return status;
}
