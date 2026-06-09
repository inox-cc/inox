#include <stddef.h>
#include <string.h>
#include "ccjs/object.h"

ccjs_status ccjs_object_new(ccjs_allocator* allocator, const ccjs_shape* shape, ccjs_value* out) {
  if (allocator == 0 || allocator->alloc == 0 || shape == 0 || out == 0) {
    return CCJS_ERR_TYPE;
  }

  const size_t size = sizeof(ccjs_object) + sizeof(ccjs_value) * shape->field_count;
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
  object->shape = shape;

  for (uint32_t index = 0; index < shape->field_count; index += 1) {
    object->fields[index] = ccjs_undefined_value();
  }

  out->tag = CCJS_TAG_OBJECT;
  out->as.ref = &object->header;

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

  *out = instance->fields[index];
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

  ccjs_retain(value);
  ccjs_release(instance->fields[index]);
  instance->fields[index] = value;

  return CCJS_OK;
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

  ccjs_retain(value);
  ccjs_release(instance->fields[index]);
  instance->fields[index] = value;

  return CCJS_OK;
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
