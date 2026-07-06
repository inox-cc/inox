#ifndef INOX_SET_H
#define INOX_SET_H

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>
#include "inox/allocator.h"
#include "inox/value.h"

enum SetSlotState { SetSlotEmpty, SetSlotOccupied, SetSlotTombstone };

struct SetEntry {
  inox_value value;
  uint64_t hash;
  SetSlotState state;
};

struct SetStorage {
  inox_ref header;
  size_t length;
  size_t capacity;
  size_t tombstones;
  SetEntry* entries;
};

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
  SetStorage* data() const;
};

#endif

#endif
