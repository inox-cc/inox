#include <stddef.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "ccjs/array.h"
#include "ccjs/string.h"

static void ccjs_array_sort_key(ccjs_value value, char* buffer, size_t buffer_len, const char** bytes, size_t* len) {
  if (value.tag == CCJS_TAG_STRING && value.as.ref != 0) {
    ccjs_string* string = (ccjs_string*)value.as.ref;
    *bytes = string->bytes;
    *len = string->len;
    return;
  }

  if (value.tag == CCJS_TAG_NUMBER) {
    int written = snprintf(buffer, buffer_len, "%.15g", value.as.number);
    *bytes = buffer;
    *len = written < 0 ? 0 : (size_t)written;
    return;
  }

  if (value.tag == CCJS_TAG_BOOL) {
    *bytes = value.as.boolean ? "true" : "false";
    *len = value.as.boolean ? 4 : 5;
    return;
  }

  if (value.tag == CCJS_TAG_NULL) {
    *bytes = "null";
    *len = 4;
    return;
  }

  if (value.tag == CCJS_TAG_UNDEFINED) {
    *bytes = "undefined";
    *len = 9;
    return;
  }

  *bytes = "";
  *len = 0;
}

static int ccjs_array_sort_compare(const void* left_ptr, const void* right_ptr) {
  const ccjs_value* left = (const ccjs_value*)left_ptr;
  const ccjs_value* right = (const ccjs_value*)right_ptr;
  char left_buffer[64];
  char right_buffer[64];
  const char* left_bytes = "";
  const char* right_bytes = "";
  size_t left_len = 0;
  size_t right_len = 0;

  ccjs_array_sort_key(*left, left_buffer, sizeof(left_buffer), &left_bytes, &left_len);
  ccjs_array_sort_key(*right, right_buffer, sizeof(right_buffer), &right_bytes, &right_len);

  size_t min_len = left_len < right_len ? left_len : right_len;
  int result = memcmp(left_bytes, right_bytes, min_len);

  if (result != 0) {
    return result;
  }

  if (left_len < right_len) {
    return -1;
  }

  if (left_len > right_len) {
    return 1;
  }

  return 0;
}

static ccjs_status ccjs_array_reserve(ccjs_array* array, size_t cap) {
  if (array == 0 || array->header.allocator == 0 || array->header.allocator->realloc == 0) {
    return CCJS_ERR_TYPE;
  }

  if (cap <= array->cap) {
    return CCJS_OK;
  }

  size_t next_cap = array->cap == 0 ? 4 : array->cap;

  while (next_cap < cap) {
    next_cap *= 2;
  }

  ccjs_value* items = array->header.allocator->realloc(
    array->header.allocator->user,
    array->items,
    sizeof(ccjs_value) * array->cap,
    sizeof(ccjs_value) * next_cap,
    _Alignof(ccjs_value)
  );

  if (items == 0) {
    return CCJS_ERR_OOM;
  }

  array->items = items;

  for (size_t index = array->cap; index < next_cap; index += 1) {
    array->items[index] = ccjs_undefined_value();
  }

  array->cap = next_cap;

  return CCJS_OK;
}

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

ccjs_status ccjs_array_push(ccjs_value array, ccjs_value value) {
  if (array.tag != CCJS_TAG_ARRAY || array.as.ref == 0) {
    return CCJS_ERR_TYPE;
  }

  ccjs_array* instance = (ccjs_array*)array.as.ref;
  ccjs_status status = ccjs_array_reserve(instance, instance->len + 1);

  if (status != CCJS_OK) {
    return status;
  }

  ccjs_retain(value);
  instance->items[instance->len] = value;
  instance->len += 1;

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

ccjs_status ccjs_array_pop(ccjs_value array, ccjs_value* out) {
  if (out == 0 || array.tag != CCJS_TAG_ARRAY || array.as.ref == 0) {
    return CCJS_ERR_TYPE;
  }

  ccjs_array* instance = (ccjs_array*)array.as.ref;

  if (instance->len == 0) {
    *out = ccjs_null_value();
    return CCJS_OK;
  }

  instance->len -= 1;
  *out = instance->items[instance->len];
  instance->items[instance->len] = ccjs_undefined_value();

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

ccjs_status ccjs_array_sort(ccjs_value array) {
  if (array.tag != CCJS_TAG_ARRAY || array.as.ref == 0) {
    return CCJS_ERR_TYPE;
  }

  ccjs_array* instance = (ccjs_array*)array.as.ref;

  if (instance->len < 2) {
    return CCJS_OK;
  }

  qsort(instance->items, instance->len, sizeof(ccjs_value), ccjs_array_sort_compare);

  return CCJS_OK;
}
