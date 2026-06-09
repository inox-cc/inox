#include <stddef.h>
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
