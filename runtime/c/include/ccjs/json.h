#ifndef CCJS_JSON_H
#define CCJS_JSON_H

#include <stddef.h>
#include "ccjs/allocator.h"
#include "ccjs/value.h"

ccjs_status ccjs_json_parse(ccjs_allocator* allocator, const char* bytes, size_t len, ccjs_value* out);
ccjs_status ccjs_json_parse_with_error(
  ccjs_allocator* allocator,
  const char* bytes,
  size_t len,
  ccjs_value* out,
  ccjs_value* error_out
);
ccjs_status ccjs_json_stringify(ccjs_allocator* allocator, ccjs_value value, ccjs_value* out);

#endif
