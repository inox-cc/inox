#ifndef INOX_ARRAY_H
#define INOX_ARRAY_H

#ifdef __cplusplus
extern "C" {
#endif

#include <stddef.h>
#include "inox/allocator.h"
#include "inox/value.h"

typedef struct inox_array {
  inox_ref header;
  size_t len;
  size_t cap;
  inox_value* items;
} inox_array;

inox_status inox_array_new(inox_allocator* allocator, size_t len, inox_value* out);
inox_status inox_array_get(inox_value array, size_t index, inox_value* out);
inox_status inox_array_join(
  inox_allocator* allocator,
  inox_value array,
  const char* separator_bytes,
  size_t separator_len,
  inox_value* out
);
inox_status inox_array_len(inox_value array, size_t* out);
inox_status inox_array_pop(inox_value array, inox_value* out);
inox_status inox_array_push(inox_value array, inox_value value);
inox_status inox_array_set(inox_value array, size_t index, inox_value value);
inox_status inox_array_slice(inox_allocator* allocator, inox_value array, size_t start, size_t end, inox_value* out);
inox_status inox_array_sort(inox_value array);
inox_status inox_array_unshift(inox_value array, inox_value value, size_t* out);

#ifdef __cplusplus
}
#endif

#endif
