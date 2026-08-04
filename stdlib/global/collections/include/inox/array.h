#ifndef INOX_ARRAY_H
#define INOX_ARRAY_H

#include <stddef.h>
#include "inox/allocator.h"
#include "inox/callback.h"
#include "inox/value.h"

#ifdef __cplusplus
#include <initializer_list>
#include <limits>

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
  inox::Value at(double index) const;
  Array concat(const inox::Value* values, size_t count) const;
  bool every(inox::Callback predicate) const;
  Array fill(
    const inox::Value& value,
    double start = 0,
    double end = std::numeric_limits<double>::infinity()
  ) const;
  Array filter(inox::Callback predicate) const;
  inox::Value find(inox::Callback predicate) const;
  double findIndex(inox::Callback predicate) const;
  inox::Value findLast(inox::Callback predicate) const;
  double findLastIndex(inox::Callback predicate) const;
  void forEach(inox::Callback callback) const;
  bool includes(const inox::Value& value) const;
  double indexOf(const inox::Value& value, double from = 0) const;
  double lastIndexOf(
    const inox::Value& value,
    double from = std::numeric_limits<double>::infinity()
  ) const;
  Array map(inox::Callback callback) const;
  inox::Value pop() const;
  Array reverse() const;
  void appendAll(const Array& values) const;
  size_t push(const inox::Value& value) const;
  size_t push(const inox::Value* values, size_t count) const;
  inox::Value reduce(inox::Callback callback, const inox::Value& initial) const;
  inox::Value set(size_t index, const inox::Value& value) const;
  Array slice(double start = 0, double end = std::numeric_limits<double>::infinity()) const;
  inox::Value shift() const;
  bool some(inox::Callback predicate) const;
  Array sort() const;
  Array sort(inox::Callback compare) const;
  size_t unshift(const inox::Value& value) const;
  size_t unshift(const inox::Value* values, size_t count) const;
  ArrayIterator values() const;

  inox::String join(inox::StringView separator) const;
};

#endif

#endif
