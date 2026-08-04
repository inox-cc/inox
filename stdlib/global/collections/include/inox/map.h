#ifndef INOX_MAP_H
#define INOX_MAP_H

#include <stddef.h>
#include <stdint.h>
#include "inox/value.h"

#ifdef __cplusplus

class Map;

struct MapIterationResult {
  bool done;
  inox::Value value;
};

class MapIterator {
public:
  MapIterator();

  MapIterationResult next();

private:
  friend class Map;

  MapIterator(const Map& value, uint8_t mode);

  inox::Value owner_;
  size_t index_;
  uint8_t mode_;
  bool done_;
};

class Map : public inox::Value {
public:
  Map();
  explicit Map(const inox::Value& value);

  using inox::Value::operator=;
  using inox::Value::raw;

  static Map from(const inox::Value& values);

  void clear() const;
  bool erase(const inox::Value& key) const;
  MapIterator entries() const;
  inox::Value get(const inox::Value& key) const;
  bool has(const inox::Value& key) const;
  MapIterator keys() const;
  Map set(const inox::Value& key, const inox::Value& value) const;
  size_t size() const;
  bool valid() const;
  MapIterator values() const;
};

#endif

#endif
