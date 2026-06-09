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
