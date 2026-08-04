#ifndef INOX_SET_H
#define INOX_SET_H

#include <stddef.h>
#include "inox/value.h"

#ifdef __cplusplus

class Set;

struct SetIterationResult {
  bool done;
  inox::Value value;
};

class SetIterator {
public:
  SetIterator();
  explicit SetIterator(const Set& value);

  SetIterationResult next();

private:
  inox::Value owner_;
  size_t index_;
  bool done_;
};

class Set : public inox::Value {
public:
  Set();
  explicit Set(const inox::Value& value);

  using inox::Value::operator=;
  using inox::Value::raw;

  static Set from(const inox::Value& values);

  Set add(const inox::Value& value) const;
  void clear() const;
  bool erase(const inox::Value& value) const;
  bool has(const inox::Value& value) const;
  size_t size() const;
  bool valid() const;
  SetIterator values() const;
};

#endif

#endif
