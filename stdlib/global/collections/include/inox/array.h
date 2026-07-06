#ifndef INOX_ARRAY_H
#define INOX_ARRAY_H

#include <stddef.h>
#include "inox/allocator.h"
#include "inox/value.h"

struct ArrayStorage {
  inox_ref header;
  size_t length;
  size_t capacity;
  inox_value* items;
};

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
  ArrayStorage* raw(inox_value value) const;
  ArrayStorage* raw(const inox::Value& value) const;
  void throwNotIterable() const;
};

using ArrayClass = Array;

extern Array Array;

#endif

#endif
