#ifndef INOX_MAP_H
#define INOX_MAP_H

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>
#include "inox/allocator.h"
#include "inox/value.h"

typedef enum inox_map_slot_state { INOX_MAP_SLOT_EMPTY, INOX_MAP_SLOT_OCCUPIED, INOX_MAP_SLOT_TOMBSTONE } inox_map_slot_state;

typedef struct inox_map_entry {
  inox_value key;
  inox_value value;
  uint64_t hash;
  inox_map_slot_state state;
} inox_map_entry;

typedef struct inox_map {
  inox_ref header;
  size_t len;
  size_t cap;
  size_t tombstones;
  inox_map_entry* entries;
} inox_map;

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
  inox_map* data() const;
};

#endif

#endif
