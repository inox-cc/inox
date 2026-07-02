#ifndef INOX_JSON_H
#define INOX_JSON_H

#include <stddef.h>
#include "inox/allocator.h"
#include "inox/class_descriptor.h"
#include "inox/value.h"

#ifdef __cplusplus
#include "inox/string_view.h"
#endif

#ifdef __cplusplus
extern "C" {
#endif

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

#ifdef __cplusplus
namespace inox {

inline inox_status json_parse(StringView text, Value& out) {
  return inox_json_parse(&inox_default_allocator, text.bytes, text.len, out.out());
}

inline inox_status json_parse_with_error(StringView text, Value& out, Value& error_out) {
  return inox_json_parse_with_error(&inox_default_allocator, text.bytes, text.len, out.out(), error_out.out());
}

inline inox_status json_stringify(inox_value value, Value& out) {
  return inox_json_stringify(&inox_default_allocator, value, out.out());
}

} // namespace inox
#endif

#endif
