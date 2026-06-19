#include <string.h>
#include "inox/array.h"
#include "inox/binary.h"
#include "inox/callback.h"
#ifdef INOX_DEBUG_MEMORY
#include "inox/debug.h"
#endif
#include "inox/map.h"
#include "inox/object.h"
#include "inox/set.h"
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

  if (value.as.ref->kind == INOX_REF_OBJECT) {
    inox_object* object = (inox_object*)value.as.ref;

    inox_object_dispose_fields(object);

    if ((object->header.flags & INOX_OBJECT_OWNED_SHAPE) != 0 && allocator != 0 && allocator->free != 0) {
      for (uint32_t index = 0; index < object->shape->field_count; index += 1) {
        const char* name = object->shape->fields[index].name;

        if (name != 0) {
          allocator->free(allocator->user, (void*)name, strlen(name) + 1, _Alignof(char));
        }
      }

      if (object->shape->fields != 0) {
        allocator->free(
          allocator->user, (void*)object->shape->fields, sizeof(inox_field_info) * object->shape->field_count,
          _Alignof(inox_field_info)
        );
      }

      allocator->free(allocator->user, (void*)object->shape, sizeof(inox_shape), _Alignof(inox_shape));
    }
  } else if (value.as.ref->kind == INOX_REF_ARRAY) {
    inox_array* array = (inox_array*)value.as.ref;

    for (size_t index = 0; index < array->len; index += 1) {
      inox_release(array->items[index]);
    }

    if (allocator != 0 && allocator->free != 0 && array->items != 0) {
      allocator->free(allocator->user, array->items, sizeof(inox_value) * array->cap, _Alignof(inox_value));
    }
  } else if (value.as.ref->kind == INOX_REF_FUNCTION) {
    inox_callback* callback = (inox_callback*)value.as.ref;

    if (callback->finalizer != 0) {
      callback->finalizer(callback->context);
    }
  } else if (value.as.ref->kind == INOX_REF_MAP) {
    inox_map_dispose((inox_map*)value.as.ref);
  } else if (value.as.ref->kind == INOX_REF_SET) {
    inox_set_dispose((inox_set*)value.as.ref);
  }

#ifdef INOX_DEBUG_MEMORY
  inox_debug_memory_record_ref_destroyed(value.as.ref->kind);
#endif

  if (allocator != 0 && allocator->free != 0) {
    allocator->free(allocator->user, value.as.ref, value.as.ref->size, value.as.ref->align);
  }
}
