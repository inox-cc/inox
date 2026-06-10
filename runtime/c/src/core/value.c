#include "ccjs/array.h"
#include "ccjs/binary.h"
#include "ccjs/callback.h"
#include "ccjs/map.h"
#include "ccjs/object.h"
#include "ccjs/set.h"
#include "ccjs/value.h"

void ccjs_retain(ccjs_value value) {
  if (ccjs_is_ref_value(value) && value.as.ref != 0) {
    value.as.ref->ref_count += 1;
  }
}

void ccjs_release(ccjs_value value) {
  if (!ccjs_is_ref_value(value) || value.as.ref == 0 || value.as.ref->ref_count == 0) {
    return;
  }

  value.as.ref->ref_count -= 1;

  if (value.as.ref->ref_count > 0) {
    return;
  }

  ccjs_allocator* allocator = value.as.ref->allocator;

  if (value.as.ref->kind == CCJS_REF_OBJECT) {
    ccjs_object* object = (ccjs_object*)value.as.ref;

    for (uint32_t index = 0; index < object->shape->field_count; index += 1) {
      ccjs_release(object->fields[index]);
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

  if (allocator != 0 && allocator->free != 0) {
    allocator->free(allocator->user, value.as.ref, value.as.ref->size, value.as.ref->align);
  }
}
