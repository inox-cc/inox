#ifndef INOX_ARRAY_H
#define INOX_ARRAY_H

#include <stddef.h>
#include "inox/allocator.h"
#include "inox/loop.h"
#include "inox/value.h"

#ifdef __cplusplus
extern "C" {
#endif

typedef struct inox_array {
  inox_ref header;
  size_t length;
  size_t cap;
  inox_value* items;
} inox_array;

inox_status inox_array_new(inox_allocator* allocator, size_t len, inox_value* out);
inox_status inox_array_get(inox_value array, size_t index, inox_value* out);
inox_status inox_array_join(
  inox_allocator* allocator,
  inox_value array,
  const char* separator_bytes,
  size_t separator_len,
  inox_value* out
);
inox_status inox_array_len(inox_value array, size_t* out);
inox_status inox_array_pop(inox_value array, inox_value* out);
inox_status inox_array_push(inox_value array, inox_value value);
inox_status inox_array_set(inox_value array, size_t index, inox_value value);
inox_status inox_array_slice(inox_allocator* allocator, inox_value array, size_t start, size_t end, inox_value* out);
inox_status inox_array_sort(inox_value array);
inox_status inox_array_unshift(inox_value array, inox_value value, size_t* out);

#ifdef __cplusplus
}
#endif

#ifdef __cplusplus

class Array : public inox::Value {
public:
  Array() : inox::Value() {}

  explicit Array(inox_value value) : inox::Value(value) {}

  explicit Array(const inox::Value& value) : inox::Value(value) {}

  explicit Array(inox::Value&& value) : inox::Value(std::move(value)) {}

  Array(inox::AdoptValue, inox_value value) : inox::Value(inox::adopt_value, value) {}

  using inox::Value::operator=;
  using inox::Value::raw;

  bool valid() const {
    inox_value value = inox::Value::raw();

    return value.tag == INOX_TAG_ARRAY && value.as.ref != nullptr;
  }

  bool isArray(inox_value value) const {
    return value.tag == INOX_TAG_ARRAY;
  }

  bool isArray(const inox::Value& value) const {
    return isArray(value.raw());
  }

  inox_array* raw(inox_value value) const {
    if (!isArray(value) || value.as.ref == nullptr) {
      return nullptr;
    }

    return (inox_array*)value.as.ref;
  }

  inox_array* raw(const inox::Value& value) const {
    return raw(value.raw());
  }

  void throwNotIterable() const {
    inox::throw_value(inox::string("TypeError: value is not iterable"));
  }
};

namespace inox {

inline ::Array String::split(StringView separator) const {
  if (!valid()) {
    return ::Array();
  }

  inox_value out = inox_undefined_value();

  if (inox_string_split_parts(&inox_default_allocator, bytes(), length(), separator.bytes, separator.len, &out) != INOX_OK) {
    return ::Array();
  }

  return ::Array(inox::adopt_value, out);
}

} // namespace inox

inline Array Array;

#endif

#endif
