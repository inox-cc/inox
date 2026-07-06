#ifndef INOX_MAP_H
#define INOX_MAP_H

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>
#include "inox/allocator.h"
#include "inox/value.h"

enum MapSlotState { MapSlotEmpty, MapSlotOccupied, MapSlotTombstone };

struct MapEntry {
  inox_value key;
  inox_value value;
  uint64_t hash;
  MapSlotState state;
};

struct MapStorage {
  inox_ref header;
  size_t length;
  size_t capacity;
  size_t tombstones;
  MapEntry* entries;
};

#ifdef __cplusplus

class Map : public inox::Value {
public:
  Map();
  explicit Map(inox_value value);
  explicit Map(const inox::Value& value);
  explicit Map(inox::Value&& value);
  Map(inox::AdoptValue adopt, inox_value value);

  using inox::Value::operator=;
  using inox::Value::raw;

  static Map create();

  bool valid() const;
  void clear() const;
  bool deleteKey(inox_value key) const;
  inox::Value get(inox_value key) const;
  bool has(inox_value key) const;
  Map set(inox_value key, inox_value value) const;
  size_t size() const;
  MapStorage* data() const;
};

#endif

#endif
