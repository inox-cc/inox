#include <stddef.h>
#include <stdio.h>
#include <string.h>
#include "inox/array.h"
#ifdef INOX_DEBUG_MEMORY
#include "inox/debug.h"
#endif
#include "inox/string.h"

static void inox_array_sort_key(inox_value value, char* buffer, size_t buffer_len, const char** bytes, size_t* len) {
  if (value.tag == INOX_TAG_STRING && value.as.ref != 0) {
    inox_string* string = (inox_string*)value.as.ref;
    *bytes = string->bytes;
    *len = string->len;
    return;
  }

  if (value.tag == INOX_TAG_NUMBER) {
    int written = snprintf(buffer, buffer_len, "%.15g", value.as.number);
    *bytes = buffer;
    *len = written < 0 ? 0 : (size_t)written;
    return;
  }

  if (value.tag == INOX_TAG_BOOL) {
    *bytes = value.as.boolean ? "true" : "false";
    *len = value.as.boolean ? 4 : 5;
    return;
  }

  if (value.tag == INOX_TAG_NULL) {
    *bytes = "null";
    *len = 4;
    return;
  }

  if (value.tag == INOX_TAG_UNDEFINED) {
    *bytes = "undefined";
    *len = 9;
    return;
  }

  *bytes = "";
  *len = 0;
}

static int inox_array_sort_compare(const void* left_ptr, const void* right_ptr) {
  const inox_value* left = (const inox_value*)left_ptr;
  const inox_value* right = (const inox_value*)right_ptr;
  char left_buffer[64];
  char right_buffer[64];
  const char* left_bytes = "";
  const char* right_bytes = "";
  size_t left_len = 0;
  size_t right_len = 0;

  inox_array_sort_key(*left, left_buffer, sizeof(left_buffer), &left_bytes, &left_len);
  inox_array_sort_key(*right, right_buffer, sizeof(right_buffer), &right_bytes, &right_len);

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

static inox_status inox_array_reserve(inox_array* array, size_t cap) {
  if (array == 0 || array->header.allocator == 0 || array->header.allocator->realloc == 0) {
    return INOX_ERR_TYPE;
  }

  if (cap <= array->cap) {
    return INOX_OK;
  }

  size_t next_cap = array->cap == 0 ? 4 : array->cap;

  while (next_cap < cap) {
    next_cap *= 2;
  }

  inox_value* items = array->header.allocator->realloc(
    array->header.allocator->user, array->items, sizeof(inox_value) * array->cap, sizeof(inox_value) * next_cap,
    _Alignof(inox_value)
  );

  if (items == 0) {
    return INOX_ERR_OOM;
  }

  array->items = items;

  for (size_t index = array->cap; index < next_cap; index += 1) {
    array->items[index] = inox_undefined_value();
  }

  array->cap = next_cap;

  return INOX_OK;
}

inox_status inox_array_new(inox_allocator* allocator, size_t len, inox_value* out) {
  if (allocator == 0 || allocator->alloc == 0 || out == 0) {
    return INOX_ERR_TYPE;
  }

  inox_array* array = allocator->alloc(allocator->user, sizeof(inox_array), _Alignof(inox_array));

  if (array == 0) {
    *out = inox_undefined_value();
    return INOX_ERR_OOM;
  }

  array->items = len == 0 ? 0 : allocator->alloc(allocator->user, sizeof(inox_value) * len, _Alignof(inox_value));

  if (len > 0 && array->items == 0) {
    *out = inox_undefined_value();
    if (allocator->free != 0) {
      allocator->free(allocator->user, array, sizeof(inox_array), _Alignof(inox_array));
    }
    return INOX_ERR_OOM;
  }

  array->header.kind = INOX_REF_ARRAY;
  array->header.ref_count = 1;
  array->header.flags = 0;
  array->header.size = sizeof(inox_array);
  array->header.align = _Alignof(inox_array);
  array->header.allocator = allocator;
  inox_ref_init_weak(&array->header);
  array->len = len;
  array->cap = len;

  for (size_t index = 0; index < len; index += 1) {
    array->items[index] = inox_undefined_value();
  }

  out->tag = INOX_TAG_ARRAY;
  out->as.ref = &array->header;
#ifdef INOX_DEBUG_MEMORY
  inox_debug_memory_record_ref_created(INOX_REF_ARRAY);
#endif

  return INOX_OK;
}

inox_status inox_array_push(inox_value array, inox_value value) {
  if (array.tag != INOX_TAG_ARRAY || array.as.ref == 0) {
    return INOX_ERR_TYPE;
  }

  inox_array* instance = (inox_array*)array.as.ref;
  inox_status status = inox_array_reserve(instance, instance->len + 1);

  if (status != INOX_OK) {
    return status;
  }

  inox_retain(value);
  instance->items[instance->len] = value;
  instance->len += 1;

  return INOX_OK;
}

inox_status inox_array_unshift(inox_value array, inox_value value, size_t* out) {
  if (out == 0 || array.tag != INOX_TAG_ARRAY || array.as.ref == 0) {
    return INOX_ERR_TYPE;
  }

  inox_array* instance = (inox_array*)array.as.ref;
  inox_status status = inox_array_reserve(instance, instance->len + 1);

  if (status != INOX_OK) {
    return status;
  }

  for (size_t index = instance->len; index > 0; index -= 1) {
    instance->items[index] = instance->items[index - 1];
  }

  inox_retain(value);
  instance->items[0] = value;
  instance->len += 1;
  *out = instance->len;

  return INOX_OK;
}

inox_status inox_array_get(inox_value array, size_t index, inox_value* out) {
  if (out == 0 || array.tag != INOX_TAG_ARRAY || array.as.ref == 0) {
    return INOX_ERR_TYPE;
  }

  inox_array* instance = (inox_array*)array.as.ref;

  if (index >= instance->len) {
    *out = inox_undefined_value();
    return INOX_ERR_FIELD;
  }

  *out = instance->items[index];
  inox_retain(*out);

  return INOX_OK;
}

inox_status inox_array_len(inox_value array, size_t* out) {
  if (out == 0 || array.tag != INOX_TAG_ARRAY || array.as.ref == 0) {
    return INOX_ERR_TYPE;
  }

  inox_array* instance = (inox_array*)array.as.ref;
  *out = instance->len;

  return INOX_OK;
}

inox_status inox_array_pop(inox_value array, inox_value* out) {
  if (out == 0 || array.tag != INOX_TAG_ARRAY || array.as.ref == 0) {
    return INOX_ERR_TYPE;
  }

  inox_array* instance = (inox_array*)array.as.ref;

  if (instance->len == 0) {
    *out = inox_null_value();
    return INOX_OK;
  }

  instance->len -= 1;
  *out = instance->items[instance->len];
  instance->items[instance->len] = inox_undefined_value();

  return INOX_OK;
}

inox_status inox_array_set(inox_value array, size_t index, inox_value value) {
  if (array.tag != INOX_TAG_ARRAY || array.as.ref == 0) {
    return INOX_ERR_TYPE;
  }

  inox_array* instance = (inox_array*)array.as.ref;

  if (index >= instance->len) {
    return INOX_ERR_FIELD;
  }

  inox_retain(value);
  inox_release(instance->items[index]);
  instance->items[index] = value;

  return INOX_OK;
}

static inox_status inox_array_join_part(inox_value value, char* buffer, size_t buffer_len, const char** bytes, size_t* len) {
  if (bytes == 0 || len == 0) {
    return INOX_ERR_TYPE;
  }

  if (value.tag == INOX_TAG_STRING && value.as.ref != 0) {
    inox_string* string = (inox_string*)value.as.ref;
    *bytes = string->bytes;
    *len = string->len;
    return INOX_OK;
  }

  if (value.tag == INOX_TAG_NUMBER) {
    int written = snprintf(buffer, buffer_len, "%.17g", value.as.number);

    if (written < 0 || (size_t)written >= buffer_len) {
      return INOX_ERR_TYPE;
    }

    *bytes = buffer;
    *len = (size_t)written;
    return INOX_OK;
  }

  if (value.tag == INOX_TAG_BOOL) {
    *bytes = value.as.boolean ? "true" : "false";
    *len = value.as.boolean ? 4 : 5;
    return INOX_OK;
  }

  if (value.tag == INOX_TAG_NULL || value.tag == INOX_TAG_UNDEFINED) {
    *bytes = "";
    *len = 0;
    return INOX_OK;
  }

  return INOX_ERR_TYPE;
}

inox_status inox_array_join(
  inox_allocator* allocator,
  inox_value array,
  const char* separator_bytes,
  size_t separator_len,
  inox_value* out
) {
  if (out != 0) {
    *out = inox_undefined_value();
  }

  if (
    allocator == 0 || allocator->alloc == 0 || allocator->free == 0 || out == 0 ||
    array.tag != INOX_TAG_ARRAY || array.as.ref == 0 || (separator_bytes == 0 && separator_len != 0)
  ) {
    return INOX_ERR_TYPE;
  }

  inox_array* instance = (inox_array*)array.as.ref;
  const char* separator = separator_bytes == 0 ? "" : separator_bytes;
  size_t total_len = 0;

  for (size_t index = 0; index < instance->len; index += 1) {
    char buffer[64];
    const char* bytes = "";
    size_t len = 0;
    inox_status status = inox_array_join_part(instance->items[index], buffer, sizeof(buffer), &bytes, &len);

    if (status != INOX_OK) {
      return status;
    }

    if (index > 0) {
      if (total_len > (size_t)-1 - separator_len) {
        return INOX_ERR_OOM;
      }

      total_len += separator_len;
    }

    if (total_len > (size_t)-1 - len) {
      return INOX_ERR_OOM;
    }

    total_len += len;
  }

  if (total_len == 0) {
    return inox_string_from_literal(allocator, "", 0, out);
  }

  char* joined = allocator->alloc(allocator->user, total_len, _Alignof(char));

  if (joined == 0) {
    return INOX_ERR_OOM;
  }

  size_t offset = 0;

  for (size_t index = 0; index < instance->len; index += 1) {
    char buffer[64];
    const char* bytes = "";
    size_t len = 0;
    inox_status status = inox_array_join_part(instance->items[index], buffer, sizeof(buffer), &bytes, &len);

    if (status != INOX_OK) {
      allocator->free(allocator->user, joined, total_len, _Alignof(char));
      return status;
    }

    if (index > 0 && separator_len > 0) {
      memcpy(joined + offset, separator, separator_len);
      offset += separator_len;
    }

    if (len > 0) {
      memcpy(joined + offset, bytes, len);
      offset += len;
    }
  }

  inox_status status = inox_string_from_literal(allocator, joined, total_len, out);
  allocator->free(allocator->user, joined, total_len, _Alignof(char));

  return status;
}

inox_status inox_array_slice(inox_allocator* allocator, inox_value array, size_t start, size_t end, inox_value* out) {
  if (allocator == 0 || out == 0 || array.tag != INOX_TAG_ARRAY || array.as.ref == 0) {
    return INOX_ERR_TYPE;
  }

  inox_array* source = (inox_array*)array.as.ref;

  if (start > source->len) {
    start = source->len;
  }

  if (end > source->len) {
    end = source->len;
  }

  if (end < start) {
    end = start;
  }

  inox_status status = inox_array_new(allocator, end - start, out);

  if (status != INOX_OK) {
    return status;
  }

  inox_array* target = (inox_array*)out->as.ref;

  for (size_t index = 0; index < target->len; index += 1) {
    inox_value value = source->items[start + index];

    inox_retain(value);
    inox_release(target->items[index]);
    target->items[index] = value;
  }

  return INOX_OK;
}

inox_status inox_array_sort(inox_value array) {
  if (array.tag != INOX_TAG_ARRAY || array.as.ref == 0) {
    return INOX_ERR_TYPE;
  }

  inox_array* instance = (inox_array*)array.as.ref;

  if (instance->len < 2) {
    return INOX_OK;
  }

  for (size_t index = 1; index < instance->len; index += 1) {
    inox_value value = instance->items[index];
    size_t scan = index;

    while (scan > 0 && inox_array_sort_compare(&instance->items[scan - 1], &value) > 0) {
      instance->items[scan] = instance->items[scan - 1];
      scan -= 1;
    }

    instance->items[scan] = value;
  }

  return INOX_OK;
}
