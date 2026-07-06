#ifdef INOX_DEBUG_MEMORY
#include "inox/debug_bridge.h"
#endif
#include "inox/string.h"
#include "inox/value.h"
#ifdef INOX_ENABLE_WEAK
#include "inox/weak.h"
#endif

bool inox_value_truthy(inox_value value) {
  if (value.tag == INOX_TAG_UNDEFINED || value.tag == INOX_TAG_NULL) {
    return false;
  }

  if (value.tag == INOX_TAG_BOOL) {
    return value.as.boolean;
  }

  if (value.tag == INOX_TAG_NUMBER) {
    return value.as.number != 0 && value.as.number == value.as.number;
  }

  if (value.tag == INOX_TAG_STRING) {
    return value.as.ref != 0 && ((inox_string*)value.as.ref)->len != 0;
  }

  return value.as.ref != 0;
}

void inox_retain(inox_value value) {
  if (inox_is_ref_value(value) && value.as.ref != 0) {
#ifdef INOX_DEBUG_MEMORY
    inox_debug_memory_record_retain();
#endif
    value.as.ref->ref_count += 1;
  }
}

void inox_release(inox_value value) {
  if (!inox_is_ref_value(value) || value.as.ref == 0 || value.as.ref->ref_count == 0) {
    return;
  }

  value.as.ref->ref_count -= 1;
#ifdef INOX_DEBUG_MEMORY
  inox_debug_memory_record_release();
#endif

  if (value.as.ref->ref_count > 0) {
    return;
  }

  inox_allocator* allocator = value.as.ref->allocator;
#ifdef INOX_ENABLE_WEAK
  inox_weak_clear_target(value.as.ref);
#endif

  if (value.as.ref->dispose != 0) {
    value.as.ref->dispose(value.as.ref);
  }

#ifdef INOX_DEBUG_MEMORY
  inox_debug_memory_record_ref_destroyed(value.as.ref->kind);
#endif

  if (allocator != 0 && allocator->free != 0) {
    allocator->free(allocator->user, value.as.ref, value.as.ref->size, value.as.ref->align);
  }
}
