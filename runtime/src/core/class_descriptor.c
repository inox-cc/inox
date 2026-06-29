#ifdef INOX_DEBUG_MEMORY
#include "inox/debug.h"
#endif
#include "inox/class_descriptor.h"

inox_status inox_class_instance_ref_new(
  inox_allocator* allocator,
  const inox_class_descriptor* descriptor,
  const void* instance,
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
  ref->header.dispose = 0;
  inox_ref_init_weak(&ref->header);
  ref->descriptor = descriptor;
  ref->instance = instance;

  out->tag = INOX_TAG_CLASS_INSTANCE;
  out->as.ref = &ref->header;
#ifdef INOX_DEBUG_MEMORY
  inox_debug_memory_record_ref_created(INOX_REF_CLASS_INSTANCE);
#endif

  return INOX_OK;
}
