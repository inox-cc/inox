#include <stddef.h>
#include "ccjs/array.h"

ccjs_status ccjs_array_new(ccjs_allocator* allocator, size_t len, ccjs_value* out) {
  if (allocator == 0 || allocator->alloc == 0 || out == 0) {
    return CCJS_ERR_TYPE;
  }

  ccjs_array* array = allocator->alloc(allocator->user, sizeof(ccjs_array), _Alignof(ccjs_array));

  if (array == 0) {
    *out = ccjs_undefined_value();
    return CCJS_ERR_OOM;
  }

  array->items = len == 0 ? 0 : allocator->alloc(allocator->user, sizeof(ccjs_value) * len, _Alignof(ccjs_value));

  if (len > 0 && array->items == 0) {
    *out = ccjs_undefined_value();
    if (allocator->free != 0) {
      allocator->free(allocator->user, array, sizeof(ccjs_array), _Alignof(ccjs_array));
    }
    return CCJS_ERR_OOM;
  }

  array->header.kind = CCJS_REF_ARRAY;
  array->header.ref_count = 1;
  array->header.flags = 0;
  array->header.size = sizeof(ccjs_array);
  array->header.align = _Alignof(ccjs_array);
  array->header.allocator = allocator;
  array->len = len;
  array->cap = len;

  for (size_t index = 0; index < len; index += 1) {
    array->items[index] = ccjs_undefined_value();
  }

  out->tag = CCJS_TAG_ARRAY;
  out->as.ref = &array->header;

  return CCJS_OK;
}

ccjs_status ccjs_array_get(ccjs_value array, size_t index, ccjs_value* out) {
  if (out == 0 || array.tag != CCJS_TAG_ARRAY || array.as.ref == 0) {
    return CCJS_ERR_TYPE;
  }

  ccjs_array* instance = (ccjs_array*)array.as.ref;

  if (index >= instance->len) {
    *out = ccjs_undefined_value();
    return CCJS_ERR_FIELD;
  }

  *out = instance->items[index];
  ccjs_retain(*out);

  return CCJS_OK;
}

ccjs_status ccjs_array_len(ccjs_value array, size_t* out) {
  if (out == 0 || array.tag != CCJS_TAG_ARRAY || array.as.ref == 0) {
    return CCJS_ERR_TYPE;
  }

  ccjs_array* instance = (ccjs_array*)array.as.ref;
  *out = instance->len;

  return CCJS_OK;
}

ccjs_status ccjs_array_set(ccjs_value array, size_t index, ccjs_value value) {
  if (array.tag != CCJS_TAG_ARRAY || array.as.ref == 0) {
    return CCJS_ERR_TYPE;
  }

  ccjs_array* instance = (ccjs_array*)array.as.ref;

  if (index >= instance->len) {
    return CCJS_ERR_FIELD;
  }

  ccjs_retain(value);
  ccjs_release(instance->items[index]);
  instance->items[index] = value;

  return CCJS_OK;
}
