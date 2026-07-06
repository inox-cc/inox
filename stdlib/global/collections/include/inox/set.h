#ifndef INOX_SET_H
#define INOX_SET_H

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>
#include "inox/allocator.h"
#include "inox/value.h"

typedef enum inox_set_slot_state { INOX_SET_SLOT_EMPTY, INOX_SET_SLOT_OCCUPIED, INOX_SET_SLOT_TOMBSTONE } inox_set_slot_state;

typedef struct inox_set_entry {
  inox_value value;
  uint64_t hash;
  inox_set_slot_state state;
} inox_set_entry;

typedef struct inox_set {
  inox_ref header;
  size_t len;
  size_t cap;
  size_t tombstones;
  inox_set_entry* entries;
} inox_set;

#ifdef __cplusplus

class Set : public inox::Value {
public:
  Set();
  explicit Set(inox_value value);
  explicit Set(const inox::Value& value);
  explicit Set(inox::Value&& value);
  Set(inox::AdoptValue adopt, inox_value value);

  using inox::Value::operator=;
  using inox::Value::raw;

  static Set create();

  Set add(inox_value value) const;
  void clear() const;
  bool deleteValue(inox_value value) const;
  bool has(inox_value value) const;
  size_t size() const;
  bool valid() const;
  inox_set* data() const;
};

#endif

#endif
