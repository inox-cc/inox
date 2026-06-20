#ifndef INOX_BINARY_H
#define INOX_BINARY_H

#include <stddef.h>
#include <stdint.h>
#include "inox/allocator.h"
#include "inox/value.h"

typedef struct inox_bytes {
  inox_ref header;
  size_t len;
  uint8_t bytes[];
} inox_bytes;

inox_status inox_bytes_new(inox_allocator* allocator, size_t len, inox_value* out);
inox_status inox_bytes_from_data(inox_allocator* allocator, const uint8_t* bytes, size_t len, inox_value* out);
inox_status inox_bytes_get(inox_value value, size_t index, uint8_t* out);
inox_status inox_bytes_len(inox_value value, size_t* out);
inox_status inox_bytes_set(inox_value value, size_t index, uint8_t byte);
inox_status inox_bytes_slice(inox_value value, size_t start, size_t end, inox_value* out);
inox_status inox_bytes_to_string(inox_allocator* allocator, inox_value value, inox_value* out);
inox_status inox_bytes_to_uint8array_string(inox_allocator* allocator, inox_value value, inox_value* out);

#endif
