#ifndef CCJS_STRING_H
#define CCJS_STRING_H

#include <stdbool.h>
#include <stddef.h>
#include "ccjs/allocator.h"
#include "ccjs/value.h"

typedef struct ccjs_string {
  ccjs_ref header;
  size_t len;
  char bytes[];
} ccjs_string;

ccjs_status ccjs_string_from_literal(ccjs_allocator* allocator, const char* bytes, size_t len, ccjs_value* out);
ccjs_status ccjs_string_from_bool(ccjs_allocator* allocator, bool value, ccjs_value* out);
ccjs_status ccjs_string_from_number(ccjs_allocator* allocator, double value, ccjs_value* out);
ccjs_status ccjs_string_to_number(const char* value_bytes, size_t value_len, ccjs_value* out);
size_t ccjs_string_code_point_length_parts(const char* value_bytes, size_t value_len);
ccjs_status ccjs_string_concat_parts(
  ccjs_allocator* allocator,
  const char* left_bytes,
  size_t left_len,
  const char* right_bytes,
  size_t right_len,
  ccjs_value* out
);
ccjs_status ccjs_string_trim_parts(ccjs_allocator* allocator, const char* value_bytes, size_t value_len, ccjs_value* out);
ccjs_status ccjs_string_slice_parts(
  ccjs_allocator* allocator,
  const char* value_bytes,
  size_t value_len,
  size_t start,
  size_t end,
  ccjs_value* out
);
ccjs_status ccjs_string_split_parts(
  ccjs_allocator* allocator,
  const char* value_bytes,
  size_t value_len,
  const char* separator_bytes,
  size_t separator_len,
  ccjs_value* out
);
ccjs_status ccjs_string_trim_start_parts(ccjs_allocator* allocator, const char* value_bytes, size_t value_len, ccjs_value* out);
ccjs_status ccjs_string_trim_end_parts(ccjs_allocator* allocator, const char* value_bytes, size_t value_len, ccjs_value* out);
bool ccjs_string_includes_parts(const char* value_bytes, size_t value_len, const char* search_bytes, size_t search_len);
bool ccjs_string_includes_from_parts(
  const char* value_bytes,
  size_t value_len,
  const char* search_bytes,
  size_t search_len,
  size_t start
);
double ccjs_string_index_of_parts(
  const char* value_bytes,
  size_t value_len,
  const char* search_bytes,
  size_t search_len,
  size_t start
);
double ccjs_string_last_index_of_parts(
  const char* value_bytes,
  size_t value_len,
  const char* search_bytes,
  size_t search_len,
  size_t start
);
bool ccjs_string_starts_with_parts(const char* value_bytes, size_t value_len, const char* search_bytes, size_t search_len);
bool ccjs_string_ends_with_parts(const char* value_bytes, size_t value_len, const char* search_bytes, size_t search_len);

#endif
