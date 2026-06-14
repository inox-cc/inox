#include <stdbool.h>
#include <stddef.h>
#include <string.h>
#ifdef CCJS_DEBUG_MEMORY
#include "ccjs/debug.h"
#endif
#include "ccjs/object.h"
#ifdef CCJS_ENABLE_WEAK
#include "ccjs/weak.h"
#endif

static bool ccjs_object_field_is_weak(const ccjs_object* object, uint32_t index) {
  return object != 0 && index < object->shape->field_count && (object->shape->fields[index].flags & CCJS_FIELD_WEAK) != 0;
}

static void ccjs_object_init_field(ccjs_object* object, uint32_t index) {
#ifdef CCJS_ENABLE_WEAK
  if (ccjs_object_field_is_weak(object, index)) {
    object->fields[index].weak = ccjs_weak_null();
    return;
  }
#endif

  object->fields[index].strong = ccjs_undefined_value();
}

static void ccjs_object_release_field(ccjs_object* object, uint32_t index) {
#ifdef CCJS_ENABLE_WEAK
  if (ccjs_object_field_is_weak(object, index)) {
    ccjs_weak_release(object->fields[index].weak);
    object->fields[index].weak = ccjs_weak_null();
    return;
  }
#endif

  ccjs_release(object->fields[index].strong);
  object->fields[index].strong = ccjs_undefined_value();
}

static ccjs_status ccjs_object_write_field(ccjs_object* object, uint32_t index, ccjs_value value) {
#ifdef CCJS_ENABLE_WEAK
  if (ccjs_object_field_is_weak(object, index)) {
    ccjs_weak_ref weak = ccjs_weak_null();
    ccjs_status status = ccjs_weak_from_value(value, &weak);

    if (status != CCJS_OK) {
      return status;
    }

    ccjs_weak_release(object->fields[index].weak);
    object->fields[index].weak = weak;
    return CCJS_OK;
  }
#else
  if (ccjs_object_field_is_weak(object, index)) {
    return CCJS_ERR_UNSUPPORTED;
  }
#endif

  ccjs_retain(value);
  ccjs_release(object->fields[index].strong);
  object->fields[index].strong = value;

  return CCJS_OK;
}

ccjs_status ccjs_object_new(ccjs_allocator* allocator, const ccjs_shape* shape, ccjs_value* out) {
  if (allocator == 0 || allocator->alloc == 0 || shape == 0 || out == 0) {
    return CCJS_ERR_TYPE;
  }

  const size_t size = sizeof(ccjs_object) + sizeof(ccjs_object_field) * shape->field_count;
  ccjs_object* object = allocator->alloc(allocator->user, size, _Alignof(ccjs_object));

  if (object == 0) {
    *out = ccjs_undefined_value();
    return CCJS_ERR_OOM;
  }

  object->header.kind = CCJS_REF_OBJECT;
  object->header.ref_count = 1;
  object->header.flags = 0;
  object->header.size = size;
  object->header.align = _Alignof(ccjs_object);
  object->header.allocator = allocator;
  ccjs_ref_init_weak(&object->header);
  object->shape = shape;

  for (uint32_t index = 0; index < shape->field_count; index += 1) {
    ccjs_object_init_field(object, index);
  }

  out->tag = CCJS_TAG_OBJECT;
  out->as.ref = &object->header;
#ifdef CCJS_DEBUG_MEMORY
  ccjs_debug_memory_record_ref_created(CCJS_REF_OBJECT);
#endif

  return CCJS_OK;
}

ccjs_status ccjs_object_get_known(ccjs_value object, uint32_t index, ccjs_value* out) {
  if (out == 0 || object.tag != CCJS_TAG_OBJECT || object.as.ref == 0) {
    return CCJS_ERR_TYPE;
  }

  ccjs_object* instance = (ccjs_object*)object.as.ref;

  if (index >= instance->shape->field_count) {
    *out = ccjs_undefined_value();
    return CCJS_ERR_FIELD;
  }

#ifdef CCJS_ENABLE_WEAK
  if (ccjs_object_field_is_weak(instance, index)) {
    return ccjs_weak_upgrade(instance->fields[index].weak, out);
  }
#else
  if (ccjs_object_field_is_weak(instance, index)) {
    *out = ccjs_undefined_value();
    return CCJS_ERR_UNSUPPORTED;
  }
#endif

  *out = instance->fields[index].strong;
  ccjs_retain(*out);

  return CCJS_OK;
}

ccjs_status ccjs_object_init_known(ccjs_value object, uint32_t index, ccjs_value value) {
  if (object.tag != CCJS_TAG_OBJECT || object.as.ref == 0) {
    return CCJS_ERR_TYPE;
  }

  ccjs_object* instance = (ccjs_object*)object.as.ref;

  if (index >= instance->shape->field_count) {
    return CCJS_ERR_FIELD;
  }

  return ccjs_object_write_field(instance, index, value);
}

ccjs_status ccjs_object_set_known(ccjs_value object, uint32_t index, ccjs_value value) {
  if (object.tag != CCJS_TAG_OBJECT || object.as.ref == 0) {
    return CCJS_ERR_TYPE;
  }

  ccjs_object* instance = (ccjs_object*)object.as.ref;

  if (index >= instance->shape->field_count) {
    return CCJS_ERR_FIELD;
  }

  if ((instance->shape->fields[index].flags & CCJS_FIELD_READONLY) != 0) {
    return CCJS_ERR_READONLY;
  }

  return ccjs_object_write_field(instance, index, value);
}

ccjs_status ccjs_object_get(ccjs_value object, const char* name, size_t len, ccjs_value* out) {
  if (out == 0 || object.tag != CCJS_TAG_OBJECT || object.as.ref == 0 || name == 0) {
    return CCJS_ERR_TYPE;
  }

  ccjs_object* instance = (ccjs_object*)object.as.ref;
  const ccjs_shape* shape = instance->shape;

  for (uint32_t index = 0; index < shape->field_count; index += 1) {
    const char* field = shape->fields[index].name;

    if (strlen(field) == len && strncmp(field, name, len) == 0) {
      return ccjs_object_get_known(object, index, out);
    }
  }

  *out = ccjs_undefined_value();

  return CCJS_ERR_FIELD;
}

void ccjs_object_dispose_fields(ccjs_object* object) {
  if (object == 0 || object->shape == 0) {
    return;
  }

  for (uint32_t index = 0; index < object->shape->field_count; index += 1) {
    ccjs_object_release_field(object, index);
  }
}

ccjs_status ccjs_object_set(ccjs_value object, const char* name, size_t len, ccjs_value value) {
  if (object.tag != CCJS_TAG_OBJECT || object.as.ref == 0 || name == 0) {
    return CCJS_ERR_TYPE;
  }

  ccjs_object* instance = (ccjs_object*)object.as.ref;
  const ccjs_shape* shape = instance->shape;

  for (uint32_t index = 0; index < shape->field_count; index += 1) {
    const char* field = shape->fields[index].name;

    if (strlen(field) == len && strncmp(field, name, len) == 0) {
      return ccjs_object_set_known(object, index, value);
    }
  }

  return CCJS_ERR_FIELD;
}
