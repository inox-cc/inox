#ifndef INOX_JSON_H
#define INOX_JSON_H

#include <stddef.h>
#include "inox/allocator.h"
#include "inox/class_descriptor.h"
#include "inox/value.h"

#ifdef __cplusplus
#include "inox/loop.h"
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
class Json {
public:
  inox::Value parse(inox::StringView text) const;
  inox::Value parse(const char* text) const;

  template <size_t N>
  inox::Value parse(const char (&text)[N]) const {
    return parse(inox::StringView(text));
  }

  inox_status stringify(inox_value value, inox::Value& out) const;

  inox_status stringify(const inox_class_descriptor& descriptor, const void* instance, inox::Value& out) const {
    return stringify(&descriptor, instance, out);
  }

  inox_status stringify(const inox_class_descriptor* descriptor, const void* instance, inox::Value& out) const;
};

inline Json JSON;
#endif

#endif
