#ifndef CCJS_ARRAY_H
#define CCJS_ARRAY_H

#include <stddef.h>
#include "ccjs/allocator.h"
#include "ccjs/value.h"

typedef struct ccjs_array {
  ccjs_ref header;
  size_t len;
  size_t cap;
  ccjs_value* items;
} ccjs_array;

ccjs_status ccjs_array_new(ccjs_allocator* allocator, size_t len, ccjs_value* out);
ccjs_status ccjs_array_get(ccjs_value array, size_t index, ccjs_value* out);
ccjs_status ccjs_array_len(ccjs_value array, size_t* out);
ccjs_status ccjs_array_set(ccjs_value array, size_t index, ccjs_value value);
ccjs_status ccjs_array_sort(ccjs_value array);

#endif
