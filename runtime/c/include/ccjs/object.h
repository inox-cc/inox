#ifndef CCJS_OBJECT_H
#define CCJS_OBJECT_H

#include <stddef.h>
#include <stdint.h>
#include "ccjs/allocator.h"
#include "ccjs/value.h"

enum { CCJS_FIELD_READONLY = 1u << 0, CCJS_OBJECT_OWNED_SHAPE = 1u << 1 };

typedef struct ccjs_field_info {
  const char* name;
  uint32_t flags;
} ccjs_field_info;

typedef struct ccjs_shape {
  uint32_t field_count;
  const ccjs_field_info* fields;
} ccjs_shape;

typedef struct ccjs_object {
  ccjs_ref header;
  const ccjs_shape* shape;
  ccjs_value fields[];
} ccjs_object;

ccjs_status ccjs_object_new(ccjs_allocator* allocator, const ccjs_shape* shape, ccjs_value* out);
ccjs_status ccjs_object_get_known(ccjs_value object, uint32_t index, ccjs_value* out);
ccjs_status ccjs_object_init_known(ccjs_value object, uint32_t index, ccjs_value value);
ccjs_status ccjs_object_set_known(ccjs_value object, uint32_t index, ccjs_value value);
ccjs_status ccjs_object_get(ccjs_value object, const char* name, size_t len, ccjs_value* out);
ccjs_status ccjs_object_set(ccjs_value object, const char* name, size_t len, ccjs_value value);

#endif
