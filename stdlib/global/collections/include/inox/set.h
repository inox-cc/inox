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
  explicit Set(const inox::Value& value);
  explicit Set(inox::Value&& value);

  using inox::Value::operator=;
  using inox::Value::raw;

  static Set create();

  Set add(const inox::Value& value) const;
  void clear() const;
  bool deleteValue(const inox::Value& value) const;
  bool has(const inox::Value& value) const;
  size_t size() const;
  bool valid() const;
  SetStorage* data() const;
};

#endif

#endif
