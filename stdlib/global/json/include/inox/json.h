#ifndef INOX_JSON_H
#define INOX_JSON_H

#ifdef __cplusplus
extern "C" {
#endif

#include <stddef.h>
#include "inox/allocator.h"
#include "inox/class_descriptor.h"
#include "inox/value.h"

inox_status inox_json_parse(inox_allocator* allocator, const char* bytes, size_t len, inox_value* out);
inox_status inox_json_parse_with_error(
  inox_allocator* allocator,
  const char* bytes,
  size_t len,
  inox_value* out,
  inox_value* error_out
);
inox_status inox_json_stringify(inox_allocator* allocator, inox_value value, inox_value* out);
inox_status inox_json_stringify_class_instance(
  inox_allocator* allocator,
  const inox_class_descriptor* descriptor,
  const void* instance,
  inox_value* out
);

#ifdef __cplusplus
}
#endif

#endif
