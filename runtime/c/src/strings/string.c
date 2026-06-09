#include <stddef.h>
#include <stdio.h>
#include <string.h>
#include "ccjs/string.h"

ccjs_status ccjs_string_from_literal(ccjs_allocator* allocator, const char* bytes, size_t len, ccjs_value* out) {
  if (allocator == 0 || allocator->alloc == 0 || bytes == 0 || out == 0) {
    return CCJS_ERR_TYPE;
  }

  const size_t size = sizeof(ccjs_string) + len;
  ccjs_string* string = allocator->alloc(allocator->user, size, _Alignof(ccjs_string));

  if (string == 0) {
    *out = ccjs_undefined_value();
    return CCJS_ERR_OOM;
  }

  string->header.kind = CCJS_REF_STRING;
  string->header.ref_count = 1;
  string->header.flags = 0;
  string->header.size = size;
  string->header.align = _Alignof(ccjs_string);
  string->header.allocator = allocator;
  string->len = len;
  memcpy(string->bytes, bytes, len);

  out->tag = CCJS_TAG_STRING;
  out->as.ref = &string->header;

  return CCJS_OK;
}

ccjs_status ccjs_string_from_bool(ccjs_allocator* allocator, bool value, ccjs_value* out) {
  return value
    ? ccjs_string_from_literal(allocator, "true", 4, out)
    : ccjs_string_from_literal(allocator, "false", 5, out);
}

ccjs_status ccjs_string_from_number(ccjs_allocator* allocator, double value, ccjs_value* out) {
  char buffer[64];
  const int len = snprintf(buffer, sizeof(buffer), "%.17g", value);

  if (len < 0 || (size_t)len >= sizeof(buffer)) {
    if (out != 0) {
      *out = ccjs_undefined_value();
    }

    return CCJS_ERR_TYPE;
  }

  return ccjs_string_from_literal(allocator, buffer, (size_t)len, out);
}

ccjs_status ccjs_string_concat_parts(
  ccjs_allocator* allocator,
  const char* left_bytes,
  size_t left_len,
  const char* right_bytes,
  size_t right_len,
  ccjs_value* out
) {
  if (out != 0) {
    *out = ccjs_undefined_value();
  }

  if (left_len > ((size_t)-1) - right_len) {
    return CCJS_ERR_OOM;
  }

  const size_t len = left_len + right_len;

  if (allocator == 0 || allocator->alloc == 0 || out == 0 || (left_bytes == 0 && left_len != 0) || (right_bytes == 0 && right_len != 0)) {
    return CCJS_ERR_TYPE;
  }

  if (len > ((size_t)-1) - sizeof(ccjs_string)) {
    return CCJS_ERR_OOM;
  }

  const size_t size = sizeof(ccjs_string) + len;
  ccjs_string* string = allocator->alloc(allocator->user, size, _Alignof(ccjs_string));

  if (string == 0) {
    return CCJS_ERR_OOM;
  }

  string->header.kind = CCJS_REF_STRING;
  string->header.ref_count = 1;
  string->header.flags = 0;
  string->header.size = size;
  string->header.align = _Alignof(ccjs_string);
  string->header.allocator = allocator;
  string->len = len;

  if (left_len != 0) {
    memcpy(string->bytes, left_bytes, left_len);
  }

  if (right_len != 0) {
    memcpy(string->bytes + left_len, right_bytes, right_len);
  }

  out->tag = CCJS_TAG_STRING;
  out->as.ref = &string->header;

  return CCJS_OK;
}

static bool ccjs_string_is_ascii_trim_space(char value) {
  return value == ' '
    || value == '\t'
    || value == '\n'
    || value == '\r'
    || value == '\f'
    || value == '\v';
}

ccjs_status ccjs_string_trim_parts(ccjs_allocator* allocator, const char* value_bytes, size_t value_len, ccjs_value* out) {
  if (value_bytes == 0 && value_len != 0) {
    if (out != 0) {
      *out = ccjs_undefined_value();
    }

    return CCJS_ERR_TYPE;
  }

  const char* bytes = value_bytes == 0 ? "" : value_bytes;
  size_t start = 0;
  size_t end = value_len;

  while (start < end && ccjs_string_is_ascii_trim_space(bytes[start])) {
    start += 1;
  }

  while (end > start && ccjs_string_is_ascii_trim_space(bytes[end - 1])) {
    end -= 1;
  }

  return ccjs_string_from_literal(allocator, bytes + start, end - start, out);
}

ccjs_status ccjs_string_slice_parts(ccjs_allocator* allocator, const char* value_bytes, size_t value_len, size_t start, size_t end, ccjs_value* out) {
  if (value_bytes == 0 && value_len != 0) {
    if (out != 0) {
      *out = ccjs_undefined_value();
    }

    return CCJS_ERR_TYPE;
  }

  if (start > value_len) {
    start = value_len;
  }

  if (end > value_len) {
    end = value_len;
  }

  if (end < start) {
    end = start;
  }

  const char* bytes = value_bytes == 0 ? "" : value_bytes;

  return ccjs_string_from_literal(allocator, bytes + start, end - start, out);
}

bool ccjs_string_includes_parts(const char* value_bytes, size_t value_len, const char* search_bytes, size_t search_len) {
  if ((value_bytes == 0 && value_len != 0) || (search_bytes == 0 && search_len != 0)) {
    return false;
  }

  if (search_len == 0) {
    return true;
  }

  if (search_len > value_len) {
    return false;
  }

  const size_t max_start = value_len - search_len;

  for (size_t index = 0; index <= max_start; index += 1) {
    if (memcmp(value_bytes + index, search_bytes, search_len) == 0) {
      return true;
    }
  }

  return false;
}

bool ccjs_string_starts_with_parts(const char* value_bytes, size_t value_len, const char* search_bytes, size_t search_len) {
  if ((value_bytes == 0 && value_len != 0) || (search_bytes == 0 && search_len != 0)) {
    return false;
  }

  if (search_len > value_len) {
    return false;
  }

  return search_len == 0 || memcmp(value_bytes, search_bytes, search_len) == 0;
}

bool ccjs_string_ends_with_parts(const char* value_bytes, size_t value_len, const char* search_bytes, size_t search_len) {
  if ((value_bytes == 0 && value_len != 0) || (search_bytes == 0 && search_len != 0)) {
    return false;
  }

  if (search_len > value_len) {
    return false;
  }

  return search_len == 0 || memcmp(value_bytes + value_len - search_len, search_bytes, search_len) == 0;
}
