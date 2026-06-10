#ifndef CCJS_BINARY_H
#define CCJS_BINARY_H

#include <stddef.h>
#include <stdint.h>
#include "ccjs/allocator.h"
#include "ccjs/value.h"

typedef struct ccjs_bytes {
  ccjs_ref header;
  size_t len;
  uint8_t bytes[];
} ccjs_bytes;

ccjs_status ccjs_bytes_new(ccjs_allocator* allocator, size_t len, ccjs_value* out);
ccjs_status ccjs_bytes_from_data(ccjs_allocator* allocator, const uint8_t* bytes, size_t len, ccjs_value* out);
ccjs_status ccjs_bytes_get(ccjs_value value, size_t index, uint8_t* out);
ccjs_status ccjs_bytes_len(ccjs_value value, size_t* out);
ccjs_status ccjs_bytes_set(ccjs_value value, size_t index, uint8_t byte);
ccjs_status ccjs_bytes_slice(ccjs_value value, size_t start, size_t end, ccjs_value* out);

#endif
