#ifndef INOX_STRING_H
#define INOX_STRING_H

#include <stdbool.h>
#include <stddef.h>
#include "inox/allocator.h"
#include "inox/value.h"

#ifdef __cplusplus
extern "C" {
#endif

typedef struct inox_string {
  inox_ref header;
  size_t len;
  char bytes[];
} inox_string;

inox_status inox_string_from_literal(inox_allocator* allocator, const char* bytes, size_t len, inox_value* out);
inox_status inox_string_from_bool(inox_allocator* allocator, bool value, inox_value* out);
inox_status inox_string_from_number(inox_allocator* allocator, double value, inox_value* out);
inox_status inox_string_from_number_radix(inox_allocator* allocator, double value, int radix, inox_value* out);
inox_status inox_string_from_format(inox_allocator* allocator, inox_value* out, const char* format, ...);
inox_status inox_string_from_value(inox_allocator* allocator, inox_value value, inox_value* out);
inox_status inox_string_to_number(const char* value_bytes, size_t value_len, inox_value* out);
size_t inox_string_code_unit_length_parts(const char* value_bytes, size_t value_len);
double inox_string_char_code_at_parts(const char* value_bytes, size_t value_len, size_t offset);
inox_status inox_string_concat_parts(
  inox_allocator* allocator,
  const char* left_bytes,
  size_t left_len,
  const char* right_bytes,
  size_t right_len,
  inox_value* out
);
inox_status inox_string_trim_parts(inox_allocator* allocator, const char* value_bytes, size_t value_len, inox_value* out);
inox_status inox_string_to_upper_case_parts(inox_allocator* allocator, const char* value_bytes, size_t value_len, inox_value* out);
inox_status inox_string_pad_start_parts(
  inox_allocator* allocator,
  const char* value_bytes,
  size_t value_len,
  size_t target_len,
  const char* pad_bytes,
  size_t pad_len,
  inox_value* out
);
inox_status inox_string_slice_parts(
  inox_allocator* allocator,
  const char* value_bytes,
  size_t value_len,
  size_t start,
  size_t end,
  inox_value* out
);
inox_status inox_string_split_parts(
  inox_allocator* allocator,
  const char* value_bytes,
  size_t value_len,
  const char* separator_bytes,
  size_t separator_len,
  inox_value* out
);
inox_status inox_string_trim_start_parts(inox_allocator* allocator, const char* value_bytes, size_t value_len, inox_value* out);
inox_status inox_string_trim_end_parts(inox_allocator* allocator, const char* value_bytes, size_t value_len, inox_value* out);
bool inox_string_includes_parts(const char* value_bytes, size_t value_len, const char* search_bytes, size_t search_len);
bool inox_string_includes_from_parts(
  const char* value_bytes,
  size_t value_len,
  const char* search_bytes,
  size_t search_len,
  size_t start
);
double inox_string_index_of_parts(
  const char* value_bytes,
  size_t value_len,
  const char* search_bytes,
  size_t search_len,
  size_t start
);
double inox_string_last_index_of_parts(
  const char* value_bytes,
  size_t value_len,
  const char* search_bytes,
  size_t search_len,
  size_t start
);
bool inox_string_starts_with_parts(const char* value_bytes, size_t value_len, const char* search_bytes, size_t search_len);
bool inox_string_ends_with_parts(const char* value_bytes, size_t value_len, const char* search_bytes, size_t search_len);

#ifdef __cplusplus
}
#endif

#endif
