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

  static Array create(size_t len);
  static Array create(inox_allocator* allocator, size_t len);

  bool valid() const;
  size_t length() const;
  inox::Value get(size_t index) const;
  inox::Value pop() const;
  void push(inox_value value) const;
  void set(size_t index, inox_value value) const;
  Array slice(size_t start, size_t end) const;
  Array sort() const;
  double unshift(inox_value value) const;

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
