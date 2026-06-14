#include <string.h>
#include "ccjs/array.h"
#include "ccjs/binary.h"
#include "ccjs/callback.h"
#ifdef CCJS_DEBUG_MEMORY
#include "ccjs/debug.h"
#endif
#include "ccjs/map.h"
#include "ccjs/object.h"
#include "ccjs/set.h"
#include "ccjs/value.h"
#ifdef CCJS_ENABLE_WEAK
#include "ccjs/weak.h"
#endif

void ccjs_retain(ccjs_value value) {
  if (ccjs_is_ref_value(value) && value.as.ref != 0) {
#ifdef CCJS_DEBUG_MEMORY
    ccjs_debug_memory_record_retain();
#endif
    value.as.ref->ref_count += 1;
  }
}

void ccjs_release(ccjs_value value) {
  if (!ccjs_is_ref_value(value) || value.as.ref == 0 || value.as.ref->ref_count == 0) {
    return;
  }

  value.as.ref->ref_count -= 1;
#ifdef CCJS_DEBUG_MEMORY
  ccjs_debug_memory_record_release();
#endif

  if (value.as.ref->ref_count > 0) {
    return;
  }

  ccjs_allocator* allocator = value.as.ref->allocator;
#ifdef CCJS_ENABLE_WEAK
  ccjs_weak_clear_target(value.as.ref);
#endif

  if (value.as.ref->kind == CCJS_REF_OBJECT) {
    ccjs_object* object = (ccjs_object*)value.as.ref;

    for (uint32_t index = 0; index < object->shape->field_count; index += 1) {
      ccjs_release(object->fields[index]);
    }

    if ((object->header.flags & CCJS_OBJECT_OWNED_SHAPE) != 0 && allocator != 0 && allocator->free != 0) {
      for (uint32_t index = 0; index < object->shape->field_count; index += 1) {
        const char* name = object->shape->fields[index].name;

        if (name != 0) {
          allocator->free(allocator->user, (void*)name, strlen(name) + 1, _Alignof(char));
        }
      }

      if (object->shape->fields != 0) {
        allocator->free(
          allocator->user, (void*)object->shape->fields, sizeof(ccjs_field_info) * object->shape->field_count,
          _Alignof(ccjs_field_info)
        );
      }

      allocator->free(allocator->user, (void*)object->shape, sizeof(ccjs_shape), _Alignof(ccjs_shape));
    }
  } else if (value.as.ref->kind == CCJS_REF_ARRAY) {
    ccjs_array* array = (ccjs_array*)value.as.ref;

    for (size_t index = 0; index < array->len; index += 1) {
      ccjs_release(array->items[index]);
    }

    if (allocator != 0 && allocator->free != 0 && array->items != 0) {
      allocator->free(allocator->user, array->items, sizeof(ccjs_value) * array->cap, _Alignof(ccjs_value));
    }
  } else if (value.as.ref->kind == CCJS_REF_FUNCTION) {
    ccjs_callback* callback = (ccjs_callback*)value.as.ref;

    if (callback->finalizer != 0) {
      callback->finalizer(callback->context);
    }
  } else if (value.as.ref->kind == CCJS_REF_MAP) {
    ccjs_map_dispose((ccjs_map*)value.as.ref);
  } else if (value.as.ref->kind == CCJS_REF_SET) {
    ccjs_set_dispose((ccjs_set*)value.as.ref);
  }

#ifdef CCJS_DEBUG_MEMORY
  ccjs_debug_memory_record_ref_destroyed(value.as.ref->kind);
#endif

  if (allocator != 0 && allocator->free != 0) {
    allocator->free(allocator->user, value.as.ref, value.as.ref->size, value.as.ref->align);
  }
}
