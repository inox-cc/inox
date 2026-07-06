#ifndef INOX_ARRAY_H
#define INOX_ARRAY_H

#include <stddef.h>
#include "inox/allocator.h"
#include "inox/value.h"

typedef struct inox_array {
  inox_ref header;
  size_t length;
  size_t cap;
  inox_value* items;
} inox_array;

#ifdef __cplusplus

class Array : public inox::Value {
public:
  Array();

  explicit Array(inox_value value);

  explicit Array(const inox::Value& value);

  explicit Array(inox::Value&& value);

  Array(inox::AdoptValue, inox_value value);

  using inox::Value::operator=;
  using inox::Value::raw;

  bool valid() const;
  inox_status make(inox_allocator* allocator, size_t len, inox_value* out) const;
  inox_status get(inox_value array, size_t index, inox_value* out) const;
  inox_status length(inox_value array, size_t* out) const;
  inox_status pop(inox_value array, inox_value* out) const;
  inox_status push(inox_value array, inox_value value) const;
  inox_status set(inox_value array, size_t index, inox_value value) const;
  inox_status slice(inox_allocator* allocator, inox_value array, size_t start, size_t end, inox_value* out) const;
  inox_status sort(inox_value array) const;
  inox_status unshift(inox_value array, inox_value value, size_t* out) const;
  inox::String join(inox::StringView separator) const;
  bool isArray(inox_value value) const;
  bool isArray(const inox::Value& value) const;
  inox_array* raw(inox_value value) const;
  inox_array* raw(const inox::Value& value) const;
  void throwNotIterable() const;
};

using ArrayClass = Array;

extern Array Array;

#endif

#endif
