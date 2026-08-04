#ifndef INOX_SET_H
#define INOX_SET_H

#include <stddef.h>
#include <stdint.h>
#include "inox/callback.h"
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
  explicit SetIterator(const Set& value, uint8_t mode = 0);

  SetIterationResult next();

private:
  inox::Value owner_;
  size_t index_;
  uint8_t mode_;
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
  SetIterator entries() const;
  void forEach(inox::Callback callback) const;
  bool has(const inox::Value& value) const;
  SetIterator keys() const;
  size_t size() const;
  bool valid() const;
  SetIterator values() const;
};

#endif

#endif
