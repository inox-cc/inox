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
ccjs_status ccjs_string_concat_parts(
  ccjs_allocator* allocator,
  const char* left_bytes,
  size_t left_len,
  const char* right_bytes,
  size_t right_len,
  ccjs_value* out
);
bool ccjs_string_includes_parts(const char* value_bytes, size_t value_len, const char* search_bytes, size_t search_len);
bool ccjs_string_starts_with_parts(const char* value_bytes, size_t value_len, const char* search_bytes, size_t search_len);
bool ccjs_string_ends_with_parts(const char* value_bytes, size_t value_len, const char* search_bytes, size_t search_len);

#endif
