#ifndef INOX_ARRAY_H
#define INOX_ARRAY_H

#include <stddef.h>
#include "inox/allocator.h"
#include "inox/callback.h"
#include "inox/value.h"

#ifdef __cplusplus
#include <initializer_list>

class Array;

struct ArrayIterationResult {
  bool done;
  inox::Value value;
};

class ArrayIterator {
public:
  ArrayIterator();
  explicit ArrayIterator(const Array& value);

  ArrayIterationResult next();
  ArrayIterator begin() const;
  ArrayIterator end() const;
  inox::Value operator*() const;
  ArrayIterator& operator++();
  bool operator!=(const ArrayIterator& other) const;

private:
  ArrayIterator(const Array& value, size_t index, bool is_end);

  inox::Value owner_;
  size_t index_;
  bool is_end_;
};

class Array : public inox::Value {
public:
  Array();

  explicit Array(const inox::Value& value);

  explicit Array(inox::Value&& value);

  using inox::Value::operator=;
  using inox::Value::raw;

  static Array create(size_t len);
  static Array from(std::initializer_list<inox::Value> values);
  static Array from(inox::StringView value);
  static bool isArray(const inox::Value& value);

  bool valid() const;
  size_t length() const;
  inox::Value get(size_t index) const;
  Array filter(inox::Callback predicate) const;
  inox::Value find(inox::Callback predicate) const;
  bool includes(const inox::Value& value) const;
  Array map(inox::Callback callback) const;
  inox::Value pop() const;
  void appendAll(const Array& values) const;
  size_t push(const inox::Value& value) const;
  inox::Value reduce(inox::Callback callback, const inox::Value& initial) const;
  inox::Value set(size_t index, const inox::Value& value) const;
  Array slice(size_t start = 0, size_t end = static_cast<size_t>(-1)) const;
  bool some(inox::Callback predicate) const;
  Array sort() const;
  Array sort(inox::Callback compare) const;
  double unshift(const inox::Value& value) const;
  ArrayIterator values() const;

  inox::String join(inox::StringView separator) const;
};

#endif

#endif
