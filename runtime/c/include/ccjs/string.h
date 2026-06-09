#ifndef CCJS_STRING_H
#define CCJS_STRING_H

#include <stddef.h>
#include "ccjs/allocator.h"
#include "ccjs/value.h"

typedef struct ccjs_string {
  ccjs_ref header;
  size_t len;
  char bytes[];
} ccjs_string;

ccjs_status ccjs_string_from_literal(ccjs_allocator* allocator, const char* bytes, size_t len, ccjs_value* out);

#endif
