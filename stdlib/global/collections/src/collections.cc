#ifdef INOX_DEBUG_MEMORY
#include "inox/debug.h"
#endif
#include <utility>
#include "inox/hash.h"
#include "inox/loop.h"
#include "inox/map.h"
#include "inox/string.h"

static void inox_map_dispose_ref(inox_ref* ref);

static void inox_collection_throw(const char* message) {
  inox::throw_value(inox::String(message));
}

static void inox_map_init_entries(inox_map_entry* entries, size_t cap) {
  for (size_t index = 0; index < cap; index += 1) {
    entries[index].key = inox_undefined_value();
    entries[index].value = inox_undefined_value();
    entries[index].hash = 0;
    entries[index].state = INOX_MAP_SLOT_EMPTY;
  }
}

static inox_status
inox_map_insert_existing(inox_map_entry* entries, size_t cap, inox_value key, inox_value value, uint64_t hash) {
  if (entries == 0 || cap == 0) {
    return INOX_ERR_TYPE;
  }

  size_t mask = cap - 1;
  size_t index = (size_t)hash & mask;

  for (size_t probe = 0; probe < cap; probe += 1) {
    inox_map_entry* entry = &entries[index];

    if (entry->state != INOX_MAP_SLOT_OCCUPIED) {
      entry->key = key;
      entry->value = value;
      entry->hash = hash;
      entry->state = INOX_MAP_SLOT_OCCUPIED;
      return INOX_OK;
    }

    index = (index + 1) & mask;
  }

  return INOX_ERR_TYPE;
}

static inox_status inox_map_rehash(inox_map* map, size_t next_cap) {
  if (map == 0 || map->header.allocator == 0 || map->header.allocator->alloc == 0) {
    return INOX_ERR_TYPE;
  }

  inox_allocator* allocator = map->header.allocator;
  inox_map_entry* entries = (inox_map_entry*)allocator->alloc(
    allocator->user, sizeof(inox_map_entry) * next_cap, alignof(inox_map_entry)
  );

  if (entries == 0) {
    return INOX_ERR_OOM;
  }

  inox_map_init_entries(entries, next_cap);

  for (size_t index = 0; index < map->cap; index += 1) {
    inox_map_entry* entry = &map->entries[index];

    if (entry->state != INOX_MAP_SLOT_OCCUPIED) {
      continue;
    }

    inox_status status = inox_map_insert_existing(entries, next_cap, entry->key, entry->value, entry->hash);

    if (status != INOX_OK) {
      if (allocator->free != 0) {
        allocator->free(allocator->user, entries, sizeof(inox_map_entry) * next_cap, alignof(inox_map_entry));
      }

      return status;
    }
  }

  if (allocator->free != 0 && map->entries != 0) {
    allocator->free(allocator->user, map->entries, sizeof(inox_map_entry) * map->cap, alignof(inox_map_entry));
  }

  map->entries = entries;
  map->cap = next_cap;
  map->tombstones = 0;

  return INOX_OK;
}

static inox_status inox_map_reserve(inox_map* map, size_t min_len) {
  if (map == 0) {
    return INOX_ERR_TYPE;
  }

  if (map->cap > 0 && (map->len + map->tombstones + 1) * 4 < map->cap * 3 && min_len * 2 <= map->cap) {
    return INOX_OK;
  }

  size_t next_cap = map->cap == 0 ? 8 : map->cap;

  while (next_cap < min_len * 2 || next_cap < 8) {
    next_cap *= 2;
  }

  if (next_cap == map->cap && map->tombstones > 0) {
    return inox_map_rehash(map, next_cap);
  }

  return inox_map_rehash(map, next_cap);
}

static inox_status inox_map_find(inox_map* map, inox_value key, uint64_t hash, size_t* index, bool* found) {
  if (map == 0 || index == 0 || found == 0) {
    return INOX_ERR_TYPE;
  }

  if (map->cap == 0) {
    *index = 0;
    *found = false;
    return INOX_OK;
  }

  size_t mask = map->cap - 1;
  size_t current = (size_t)hash & mask;
  size_t first_tombstone = (size_t)-1;

  for (size_t probe = 0; probe < map->cap; probe += 1) {
    inox_map_entry* entry = &map->entries[current];

    if (entry->state == INOX_MAP_SLOT_EMPTY) {
      *index = first_tombstone == (size_t)-1 ? current : first_tombstone;
      *found = false;
      return INOX_OK;
    }

    if (entry->state == INOX_MAP_SLOT_TOMBSTONE) {
      if (first_tombstone == (size_t)-1) {
        first_tombstone = current;
      }
    } else if (entry->hash == hash && inox::value_equal(entry->key, key)) {
      *index = current;
      *found = true;
      return INOX_OK;
    }

    current = (current + 1) & mask;
  }

  if (first_tombstone != (size_t)-1) {
    *index = first_tombstone;
    *found = false;
    return INOX_OK;
  }

  return INOX_ERR_TYPE;
}

Map::Map() : inox::Value() {}

Map::Map(inox_value value) : inox::Value(value) {}

Map::Map(const inox::Value& value) : inox::Value(value) {}

Map::Map(inox::Value&& value) : inox::Value(std::move(value)) {}

Map::Map(inox::AdoptValue adopt, inox_value value) : inox::Value(adopt, value) {}

Map Map::create() {
  if (inox_default_allocator.alloc == 0) {
    inox_collection_throw("TypeError: Map allocator is not available");
    return Map();
  }

  inox_map* map = (inox_map*)inox_default_allocator.alloc(
    inox_default_allocator.user, sizeof(inox_map), alignof(inox_map)
  );

  if (map == 0) {
    inox_collection_throw("TypeError: Map allocation failed");
    return Map();
  }

  map->header.kind = INOX_REF_MAP;
  map->header.ref_count = 1;
  map->header.flags = 0;
  map->header.size = sizeof(inox_map);
  map->header.align = alignof(inox_map);
  map->header.allocator = &inox_default_allocator;
  map->header.dispose = inox_map_dispose_ref;
  inox_ref_init_weak(&map->header);
  map->len = 0;
  map->cap = 0;
  map->tombstones = 0;
  map->entries = 0;

  inox_value out = inox_undefined_value();
  out.tag = INOX_TAG_MAP;
  out.as.ref = &map->header;
#ifdef INOX_DEBUG_MEMORY
  inox::debugMemory.recordRefCreated(INOX_REF_MAP);
#endif

  return Map(inox::adopt_value, out);
}

bool Map::valid() const {
  inox_value value = inox::Value::raw();

  return value.tag == INOX_TAG_MAP && value.as.ref != 0;
}

inox_map* Map::data() const {
  if (!valid()) {
    return 0;
  }

  return (inox_map*)inox::Value::raw().as.ref;
}

void Map::clear() const {
  inox_map* instance = data();

  if (instance == 0) {
    inox_collection_throw("TypeError: Map.clear receiver is not a Map");
    return;
  }

  for (size_t index = 0; index < instance->cap; index += 1) {
    inox_map_entry* entry = &instance->entries[index];

    if (entry->state == INOX_MAP_SLOT_OCCUPIED) {
      inox_release(entry->key);
      inox_release(entry->value);
    }

    entry->key = inox_undefined_value();
    entry->value = inox_undefined_value();
    entry->hash = 0;
    entry->state = INOX_MAP_SLOT_EMPTY;
  }

  instance->len = 0;
  instance->tombstones = 0;
}

bool Map::deleteKey(inox_value key) const {
  inox_map* instance = data();

  if (instance == 0) {
    inox_collection_throw("TypeError: Map.delete receiver is not a Map");
    return false;
  }

  uint64_t hash = 0;
  bool hash_ok = inox::hash_value(key, hash);

  if (!hash_ok) {
    inox_collection_throw("TypeError: Map key is not hashable");
    return false;
  }

  size_t index = 0;
  bool found = false;
  inox_status status = inox_map_find(instance, key, hash, &index, &found);

  if (status != INOX_OK) {
    inox_collection_throw("TypeError: Map lookup failed");
    return false;
  }

  if (!found) {
    return false;
  }

  inox_map_entry* entry = &instance->entries[index];
  inox_release(entry->key);
  inox_release(entry->value);
  entry->key = inox_undefined_value();
  entry->value = inox_undefined_value();
  entry->hash = 0;
  entry->state = INOX_MAP_SLOT_TOMBSTONE;
  instance->len -= 1;
  instance->tombstones += 1;

  return true;
}

static void inox_map_dispose(inox_map* map) {
  if (map == 0) {
    return;
  }

  for (size_t index = 0; index < map->cap; index += 1) {
    inox_map_entry* entry = &map->entries[index];

    if (entry->state == INOX_MAP_SLOT_OCCUPIED) {
      inox_release(entry->key);
      inox_release(entry->value);
    }
  }

  if (map->header.allocator != 0 && map->header.allocator->free != 0 && map->entries != 0) {
    map->header.allocator->free(
      map->header.allocator->user, map->entries, sizeof(inox_map_entry) * map->cap, alignof(inox_map_entry)
    );
  }
}

static void inox_map_dispose_ref(inox_ref* ref) {
  inox_map_dispose((inox_map*)ref);
}

inox::Value Map::get(inox_value key) const {
  inox_map* instance = data();

  if (instance == 0) {
    inox_collection_throw("TypeError: Map.get receiver is not a Map");
    return inox::Value();
  }

  uint64_t hash = 0;
  bool hash_ok = inox::hash_value(key, hash);

  if (!hash_ok) {
    inox_collection_throw("TypeError: Map key is not hashable");
    return inox::Value();
  }

  size_t index = 0;
  bool found = false;
  inox_status status = inox_map_find(instance, key, hash, &index, &found);

  if (status != INOX_OK) {
    inox_collection_throw("TypeError: Map lookup failed");
    return inox::Value();
  }

  if (!found) {
    return inox::Value();
  }

  inox_value out = instance->entries[index].value;
  inox_retain(out);

  return inox::adopt(out);
}

bool Map::has(inox_value key) const {
  inox_map* instance = data();

  if (instance == 0) {
    inox_collection_throw("TypeError: Map.has receiver is not a Map");
    return false;
  }

  uint64_t hash = 0;
  bool hash_ok = inox::hash_value(key, hash);

  if (!hash_ok) {
    inox_collection_throw("TypeError: Map key is not hashable");
    return false;
  }

  size_t index = 0;
  bool found = false;
  inox_status status = inox_map_find(instance, key, hash, &index, &found);

  if (status != INOX_OK) {
    inox_collection_throw("TypeError: Map lookup failed");
    return false;
  }

  return found;
}

Map Map::set(inox_value key, inox_value value) const {
  inox_map* instance = data();

  if (instance == 0) {
    inox_collection_throw("TypeError: Map.set receiver is not a Map");
    return Map();
  }

  uint64_t hash = 0;
  bool hash_ok = inox::hash_value(key, hash);

  if (!hash_ok) {
    inox_collection_throw("TypeError: Map key is not hashable");
    return Map();
  }

  inox_status status = inox_map_reserve(instance, instance->len + 1);

  if (status != INOX_OK) {
    inox_collection_throw("TypeError: Map allocation failed");
    return Map();
  }

  size_t index = 0;
  bool found = false;
  status = inox_map_find(instance, key, hash, &index, &found);

  if (status != INOX_OK) {
    inox_collection_throw("TypeError: Map lookup failed");
    return Map();
  }

  inox_map_entry* entry = &instance->entries[index];

  if (found) {
    inox_retain(value);
    inox_release(entry->value);
    entry->value = value;
    return Map(*this);
  }

  if (entry->state == INOX_MAP_SLOT_TOMBSTONE) {
    instance->tombstones -= 1;
  }

  inox_retain(key);
  inox_retain(value);
  entry->key = key;
  entry->value = value;
  entry->hash = hash;
  entry->state = INOX_MAP_SLOT_OCCUPIED;
  instance->len += 1;

  return Map(*this);
}

size_t Map::size() const {
  inox_map* instance = data();

  if (instance == 0) {
    inox_collection_throw("TypeError: Map.size receiver is not a Map");
    return 0;
  }

  return instance->len;
}

#ifdef INOX_DEBUG_MEMORY
#include "inox/debug.h"
#endif
#include "inox/hash.h"
#include "inox/set.h"

static void inox_set_dispose_ref(inox_ref* ref);

static void inox_set_init_entries(inox_set_entry* entries, size_t cap) {
  for (size_t index = 0; index < cap; index += 1) {
    entries[index].value = inox_undefined_value();
    entries[index].hash = 0;
    entries[index].state = INOX_SET_SLOT_EMPTY;
  }
}

static inox_status inox_set_insert_existing(inox_set_entry* entries, size_t cap, inox_value value, uint64_t hash) {
  if (entries == 0 || cap == 0) {
    return INOX_ERR_TYPE;
  }

  size_t mask = cap - 1;
  size_t index = (size_t)hash & mask;

  for (size_t probe = 0; probe < cap; probe += 1) {
    inox_set_entry* entry = &entries[index];

    if (entry->state != INOX_SET_SLOT_OCCUPIED) {
      entry->value = value;
      entry->hash = hash;
      entry->state = INOX_SET_SLOT_OCCUPIED;
      return INOX_OK;
    }

    index = (index + 1) & mask;
  }

  return INOX_ERR_TYPE;
}

static inox_status inox_set_rehash(inox_set* set, size_t next_cap) {
  if (set == 0 || set->header.allocator == 0 || set->header.allocator->alloc == 0) {
    return INOX_ERR_TYPE;
  }

  inox_allocator* allocator = set->header.allocator;
  inox_set_entry* entries = (inox_set_entry*)allocator->alloc(
    allocator->user, sizeof(inox_set_entry) * next_cap, alignof(inox_set_entry)
  );

  if (entries == 0) {
    return INOX_ERR_OOM;
  }

  inox_set_init_entries(entries, next_cap);

  for (size_t index = 0; index < set->cap; index += 1) {
    inox_set_entry* entry = &set->entries[index];

    if (entry->state != INOX_SET_SLOT_OCCUPIED) {
      continue;
    }

    inox_status status = inox_set_insert_existing(entries, next_cap, entry->value, entry->hash);

    if (status != INOX_OK) {
      if (allocator->free != 0) {
        allocator->free(allocator->user, entries, sizeof(inox_set_entry) * next_cap, alignof(inox_set_entry));
      }

      return status;
    }
  }

  if (allocator->free != 0 && set->entries != 0) {
    allocator->free(allocator->user, set->entries, sizeof(inox_set_entry) * set->cap, alignof(inox_set_entry));
  }

  set->entries = entries;
  set->cap = next_cap;
  set->tombstones = 0;

  return INOX_OK;
}

static inox_status inox_set_reserve(inox_set* set, size_t min_len) {
  if (set == 0) {
    return INOX_ERR_TYPE;
  }

  if (set->cap > 0 && (set->len + set->tombstones + 1) * 4 < set->cap * 3 && min_len * 2 <= set->cap) {
    return INOX_OK;
  }

  size_t next_cap = set->cap == 0 ? 8 : set->cap;

  while (next_cap < min_len * 2 || next_cap < 8) {
    next_cap *= 2;
  }

  if (next_cap == set->cap && set->tombstones > 0) {
    return inox_set_rehash(set, next_cap);
  }

  return inox_set_rehash(set, next_cap);
}

static inox_status inox_set_find(inox_set* set, inox_value value, uint64_t hash, size_t* index, bool* found) {
  if (set == 0 || index == 0 || found == 0) {
    return INOX_ERR_TYPE;
  }

  if (set->cap == 0) {
    *index = 0;
    *found = false;
    return INOX_OK;
  }

  size_t mask = set->cap - 1;
  size_t current = (size_t)hash & mask;
  size_t first_tombstone = (size_t)-1;

  for (size_t probe = 0; probe < set->cap; probe += 1) {
    inox_set_entry* entry = &set->entries[current];

    if (entry->state == INOX_SET_SLOT_EMPTY) {
      *index = first_tombstone == (size_t)-1 ? current : first_tombstone;
      *found = false;
      return INOX_OK;
    }

    if (entry->state == INOX_SET_SLOT_TOMBSTONE) {
      if (first_tombstone == (size_t)-1) {
        first_tombstone = current;
      }
    } else if (entry->hash == hash && inox::value_equal(entry->value, value)) {
      *index = current;
      *found = true;
      return INOX_OK;
    }

    current = (current + 1) & mask;
  }

  if (first_tombstone != (size_t)-1) {
    *index = first_tombstone;
    *found = false;
    return INOX_OK;
  }

  return INOX_ERR_TYPE;
}

Set::Set() : inox::Value() {}

Set::Set(inox_value value) : inox::Value(value) {}

Set::Set(const inox::Value& value) : inox::Value(value) {}

Set::Set(inox::Value&& value) : inox::Value(std::move(value)) {}

Set::Set(inox::AdoptValue adopt, inox_value value) : inox::Value(adopt, value) {}

bool Set::valid() const {
  inox_value value = inox::Value::raw();

  return value.tag == INOX_TAG_SET && value.as.ref != 0;
}

inox_set* Set::data() const {
  if (!valid()) {
    return 0;
  }

  return (inox_set*)inox::Value::raw().as.ref;
}

Set Set::add(inox_value value) const {
  inox_set* instance = data();

  if (instance == 0) {
    inox_collection_throw("TypeError: Set.add receiver is not a Set");
    return Set();
  }

  uint64_t hash = 0;
  bool hash_ok = inox::hash_value(value, hash);

  if (!hash_ok) {
    inox_collection_throw("TypeError: Set value is not hashable");
    return Set();
  }

  inox_status status = inox_set_reserve(instance, instance->len + 1);

  if (status != INOX_OK) {
    inox_collection_throw("TypeError: Set allocation failed");
    return Set();
  }

  size_t index = 0;
  bool found = false;
  status = inox_set_find(instance, value, hash, &index, &found);

  if (status != INOX_OK || found) {
    if (status != INOX_OK) {
      inox_collection_throw("TypeError: Set lookup failed");
      return Set();
    }

    return Set(*this);
  }

  inox_set_entry* entry = &instance->entries[index];

  if (entry->state == INOX_SET_SLOT_TOMBSTONE) {
    instance->tombstones -= 1;
  }

  inox_retain(value);
  entry->value = value;
  entry->hash = hash;
  entry->state = INOX_SET_SLOT_OCCUPIED;
  instance->len += 1;

  return Set(*this);
}

void Set::clear() const {
  inox_set* instance = data();

  if (instance == 0) {
    inox_collection_throw("TypeError: Set.clear receiver is not a Set");
    return;
  }

  for (size_t index = 0; index < instance->cap; index += 1) {
    inox_set_entry* entry = &instance->entries[index];

    if (entry->state == INOX_SET_SLOT_OCCUPIED) {
      inox_release(entry->value);
    }

    entry->value = inox_undefined_value();
    entry->hash = 0;
    entry->state = INOX_SET_SLOT_EMPTY;
  }

  instance->len = 0;
  instance->tombstones = 0;
}

bool Set::deleteValue(inox_value value) const {
  inox_set* instance = data();

  if (instance == 0) {
    inox_collection_throw("TypeError: Set.delete receiver is not a Set");
    return false;
  }

  uint64_t hash = 0;
  bool hash_ok = inox::hash_value(value, hash);

  if (!hash_ok) {
    inox_collection_throw("TypeError: Set value is not hashable");
    return false;
  }

  size_t index = 0;
  bool found = false;
  inox_status status = inox_set_find(instance, value, hash, &index, &found);

  if (status != INOX_OK) {
    inox_collection_throw("TypeError: Set lookup failed");
    return false;
  }

  if (!found) {
    return false;
  }

  inox_set_entry* entry = &instance->entries[index];
  inox_release(entry->value);
  entry->value = inox_undefined_value();
  entry->hash = 0;
  entry->state = INOX_SET_SLOT_TOMBSTONE;
  instance->len -= 1;
  instance->tombstones += 1;

  return true;
}

static void inox_set_dispose(inox_set* set) {
  if (set == 0) {
    return;
  }

  for (size_t index = 0; index < set->cap; index += 1) {
    inox_set_entry* entry = &set->entries[index];

    if (entry->state == INOX_SET_SLOT_OCCUPIED) {
      inox_release(entry->value);
    }
  }

  if (set->header.allocator != 0 && set->header.allocator->free != 0 && set->entries != 0) {
    set->header.allocator->free(
      set->header.allocator->user, set->entries, sizeof(inox_set_entry) * set->cap, alignof(inox_set_entry)
    );
  }
}

static void inox_set_dispose_ref(inox_ref* ref) {
  inox_set_dispose((inox_set*)ref);
}

bool Set::has(inox_value value) const {
  inox_set* instance = data();

  if (instance == 0) {
    inox_collection_throw("TypeError: Set.has receiver is not a Set");
    return false;
  }

  uint64_t hash = 0;
  bool hash_ok = inox::hash_value(value, hash);

  if (!hash_ok) {
    inox_collection_throw("TypeError: Set value is not hashable");
    return false;
  }

  size_t index = 0;
  bool found = false;
  inox_status status = inox_set_find(instance, value, hash, &index, &found);

  if (status != INOX_OK) {
    inox_collection_throw("TypeError: Set lookup failed");
    return false;
  }

  return found;
}

Set Set::create() {
  if (inox_default_allocator.alloc == 0) {
    inox_collection_throw("TypeError: Set allocator is not available");
    return Set();
  }

  inox_set* set = (inox_set*)inox_default_allocator.alloc(
    inox_default_allocator.user, sizeof(inox_set), alignof(inox_set)
  );

  if (set == 0) {
    inox_collection_throw("TypeError: Set allocation failed");
    return Set();
  }

  set->header.kind = INOX_REF_SET;
  set->header.ref_count = 1;
  set->header.flags = 0;
  set->header.size = sizeof(inox_set);
  set->header.align = alignof(inox_set);
  set->header.allocator = &inox_default_allocator;
  set->header.dispose = inox_set_dispose_ref;
  inox_ref_init_weak(&set->header);
  set->len = 0;
  set->cap = 0;
  set->tombstones = 0;
  set->entries = 0;

  inox_value out = inox_undefined_value();
  out.tag = INOX_TAG_SET;
  out.as.ref = &set->header;
#ifdef INOX_DEBUG_MEMORY
  inox::debugMemory.recordRefCreated(INOX_REF_SET);
#endif

  return Set(inox::adopt_value, out);
}

size_t Set::size() const {
  inox_set* instance = data();

  if (instance == 0) {
    inox_collection_throw("TypeError: Set.size receiver is not a Set");
    return 0;
  }

  return instance->len;
}

#include <stddef.h>
#include <stdio.h>
#include <string.h>
#include <utility>
#include "inox/array.h"
#include "inox/hash.h"
#include "inox/loop.h"
#ifdef INOX_DEBUG_MEMORY
#include "inox/debug.h"
#endif
#include "inox/string.h"

namespace inox {

uint64_t hash_mix(uint64_t hash, const void* bytes, size_t len) {
  const unsigned char* data = (const unsigned char*)bytes;

  for (size_t index = 0; index < len; index += 1) {
    hash ^= data[index];
    hash *= 1099511628211ULL;
  }

  return hash;
}

bool hash_value(inox_value value, uint64_t& out) {
  uint64_t hash = 1469598103934665603ULL;
  uint8_t tag = (uint8_t)value.tag;

  hash = hash_mix(hash, &tag, sizeof(tag));

  if (value.tag == INOX_TAG_STRING) {
    if (value.as.ref == 0) {
      return false;
    }

    inox_string* string = (inox_string*)value.as.ref;
    out = hash_mix(hash, string->bytes, string->len);
    return true;
  }

  if (value.tag == INOX_TAG_NUMBER) {
    double number = value.as.number;

    if (number != number) {
      uint64_t nan_bits = 0x7ff8000000000000ULL;
      out = hash_mix(hash, &nan_bits, sizeof(nan_bits));
      return true;
    }

    if (number == 0) {
      number = 0;
    }

    uint64_t bits = 0;
    memcpy(&bits, &number, sizeof(bits));
    out = hash_mix(hash, &bits, sizeof(bits));
    return true;
  }

  if (value.tag == INOX_TAG_BOOL) {
    uint8_t boolean = value.as.boolean ? 1 : 0;
    out = hash_mix(hash, &boolean, sizeof(boolean));
    return true;
  }

  if (inox_is_ref_value(value)) {
    if (value.as.ref == 0) {
      return false;
    }

    uintptr_t ref = (uintptr_t)value.as.ref;
    out = hash_mix(hash, &ref, sizeof(ref));
    return true;
  }

  if (value.tag == INOX_TAG_NULL || value.tag == INOX_TAG_UNDEFINED) {
    out = hash;
    return true;
  }

  return false;
}

bool value_equal(inox_value left, inox_value right) {
  if (left.tag != right.tag) {
    return false;
  }

  if (left.tag == INOX_TAG_STRING) {
    if (left.as.ref == 0 || right.as.ref == 0) {
      return left.as.ref == right.as.ref;
    }

    inox_string* left_string = (inox_string*)left.as.ref;
    inox_string* right_string = (inox_string*)right.as.ref;

    return left_string->len == right_string->len && memcmp(left_string->bytes, right_string->bytes, left_string->len) == 0;
  }

  if (left.tag == INOX_TAG_NUMBER) {
    if (left.as.number != left.as.number && right.as.number != right.as.number) {
      return true;
    }

    return left.as.number == right.as.number;
  }

  if (left.tag == INOX_TAG_BOOL) {
    return left.as.boolean == right.as.boolean;
  }

  if (inox_is_ref_value(left)) {
    return left.as.ref == right.as.ref;
  }

  return left.tag == INOX_TAG_NULL || left.tag == INOX_TAG_UNDEFINED;
}

} // namespace inox

static void inox_array_sort_key(inox_value value, char* buffer, size_t buffer_len, const char** bytes, size_t* len) {
  if (value.tag == INOX_TAG_STRING && value.as.ref != 0) {
    inox_string* string = (inox_string*)value.as.ref;
    *bytes = string->bytes;
    *len = string->len;
    return;
  }

  if (value.tag == INOX_TAG_NUMBER) {
    int written = snprintf(buffer, buffer_len, "%.15g", value.as.number);
    *bytes = buffer;
    *len = written < 0 ? 0 : (size_t)written;
    return;
  }

  if (value.tag == INOX_TAG_BOOL) {
    *bytes = value.as.boolean ? "true" : "false";
    *len = value.as.boolean ? 4 : 5;
    return;
  }

  if (value.tag == INOX_TAG_NULL) {
    *bytes = "null";
    *len = 4;
    return;
  }

  if (value.tag == INOX_TAG_UNDEFINED) {
    *bytes = "undefined";
    *len = 9;
    return;
  }

  *bytes = "";
  *len = 0;
}

static int inox_array_sort_compare(const void* left_ptr, const void* right_ptr) {
  const inox_value* left = (const inox_value*)left_ptr;
  const inox_value* right = (const inox_value*)right_ptr;
  char left_buffer[64];
  char right_buffer[64];
  const char* left_bytes = "";
  const char* right_bytes = "";
  size_t left_len = 0;
  size_t right_len = 0;

  inox_array_sort_key(*left, left_buffer, sizeof(left_buffer), &left_bytes, &left_len);
  inox_array_sort_key(*right, right_buffer, sizeof(right_buffer), &right_bytes, &right_len);

  size_t min_len = left_len < right_len ? left_len : right_len;
  int result = memcmp(left_bytes, right_bytes, min_len);

  if (result != 0) {
    return result;
  }

  if (left_len < right_len) {
    return -1;
  }

  if (left_len > right_len) {
    return 1;
  }

  return 0;
}

static inox_status inox_array_reserve(ArrayStorage* array, size_t cap) {
  if (array == 0 || array->header.allocator == 0 || array->header.allocator->realloc == 0) {
    return INOX_ERR_TYPE;
  }

  if (cap <= array->cap) {
    return INOX_OK;
  }

  size_t next_cap = array->cap == 0 ? 4 : array->cap;

  while (next_cap < cap) {
    next_cap *= 2;
  }

  inox_value* items = (inox_value*)array->header.allocator->realloc(
    array->header.allocator->user,
    array->items,
    sizeof(inox_value) * array->cap,
    sizeof(inox_value) * next_cap,
    alignof(inox_value)
  );

  if (items == 0) {
    return INOX_ERR_OOM;
  }

  array->items = items;

  for (size_t index = array->cap; index < next_cap; index += 1) {
    array->items[index] = inox_undefined_value();
  }

  array->cap = next_cap;

  return INOX_OK;
}

static void inox_array_dispose_ref(inox_ref* ref) {
  if (ref == 0) {
    return;
  }

  ArrayStorage* array = (ArrayStorage*)ref;

  for (size_t index = 0; index < array->length; index += 1) {
    inox_release(array->items[index]);
  }

  if (array->header.allocator != 0 && array->header.allocator->free != 0 && array->items != 0) {
    array->header.allocator->free(
      array->header.allocator->user, array->items, sizeof(inox_value) * array->cap, alignof(inox_value)
    );
  }
}

static ArrayStorage* inox_array_alloc_storage(inox_allocator* allocator, size_t len) {
  if (allocator == 0 || allocator->alloc == 0) {
    return 0;
  }

  ArrayStorage* array = (ArrayStorage*)allocator->alloc(allocator->user, sizeof(ArrayStorage), alignof(ArrayStorage));

  if (array == 0) {
    return 0;
  }

  array->items =
    len == 0 ? 0 : (inox_value*)allocator->alloc(allocator->user, sizeof(inox_value) * len, alignof(inox_value));

  if (len > 0 && array->items == 0) {
    if (allocator->free != 0) {
      allocator->free(allocator->user, array, sizeof(ArrayStorage), alignof(ArrayStorage));
    }

    return 0;
  }

  array->header.kind = INOX_REF_ARRAY;
  array->header.ref_count = 1;
  array->header.flags = 0;
  array->header.size = sizeof(ArrayStorage);
  array->header.align = alignof(ArrayStorage);
  array->header.allocator = allocator;
  array->header.dispose = inox_array_dispose_ref;
  inox_ref_init_weak(&array->header);
  array->length = len;
  array->cap = len;

  for (size_t index = 0; index < len; index += 1) {
    array->items[index] = inox_undefined_value();
  }

#ifdef INOX_DEBUG_MEMORY
  inox::debugMemory.recordRefCreated(INOX_REF_ARRAY);
#endif

  return array;
}

static inox_value inox_array_adopt_storage(ArrayStorage* array) {
  inox_value value = { INOX_TAG_ARRAY };
  value.as.ref = &array->header;

  return value;
}

static inox_status inox_array_set_item(ArrayStorage* array, size_t index, inox_value value) {
  if (array == 0) {
    return INOX_ERR_TYPE;
  }

  if (index >= array->length) {
    return INOX_ERR_FIELD;
  }

  inox_retain(value);
  inox_release(array->items[index]);
  array->items[index] = value;

  return INOX_OK;
}

static inox_status inox_array_push_item(ArrayStorage* array, inox_value value) {
  if (array == 0) {
    return INOX_ERR_TYPE;
  }

  inox_status status = inox_array_reserve(array, array->length + 1);

  if (status != INOX_OK) {
    return status;
  }

  inox_retain(value);
  array->items[array->length] = value;
  array->length += 1;

  return INOX_OK;
}

static inox_status inox_array_join_part(inox_value value, char* buffer, size_t buffer_len, const char** bytes, size_t* len) {
  if (bytes == 0 || len == 0) {
    return INOX_ERR_TYPE;
  }

  if (value.tag == INOX_TAG_STRING && value.as.ref != 0) {
    inox_string* string = (inox_string*)value.as.ref;
    *bytes = string->bytes;
    *len = string->len;
    return INOX_OK;
  }

  if (value.tag == INOX_TAG_NUMBER) {
    int written = snprintf(buffer, buffer_len, "%.17g", value.as.number);

    if (written < 0 || (size_t)written >= buffer_len) {
      return INOX_ERR_TYPE;
    }

    *bytes = buffer;
    *len = (size_t)written;
    return INOX_OK;
  }

  if (value.tag == INOX_TAG_BOOL) {
    *bytes = value.as.boolean ? "true" : "false";
    *len = value.as.boolean ? 4 : 5;
    return INOX_OK;
  }

  if (value.tag == INOX_TAG_NULL || value.tag == INOX_TAG_UNDEFINED) {
    *bytes = "";
    *len = 0;
    return INOX_OK;
  }

  return INOX_ERR_TYPE;
}

Array::Array() : inox::Value() {}

Array::Array(inox_value value) : inox::Value(value) {}

Array::Array(const inox::Value& value) : inox::Value(value) {}

Array::Array(inox::Value&& value) : inox::Value(std::move(value)) {}

Array::Array(inox::AdoptValue, inox_value value) : inox::Value(inox::adopt_value, value) {}

bool Array::valid() const {
  inox_value value = inox::Value::raw();

  return value.tag == INOX_TAG_ARRAY && value.as.ref != 0;
}

size_t Array::length() const {
  inox_value array = inox::Value::raw();

  if (array.tag != INOX_TAG_ARRAY || array.as.ref == 0) {
    inox_collection_throw("TypeError: Array.length receiver is not an Array");
    return 0;
  }

  return ((ArrayStorage*)array.as.ref)->length;
}

inox::Value Array::get(size_t index) const {
  inox_value array = inox::Value::raw();

  if (array.tag != INOX_TAG_ARRAY || array.as.ref == 0) {
    inox_collection_throw("TypeError: Array index receiver is not an Array");
    return inox::Value();
  }

  ArrayStorage* instance = (ArrayStorage*)array.as.ref;

  if (index >= instance->length) {
    return inox::Value();
  }

  return inox::Value(instance->items[index]);
}

class Array Array::create(size_t len) {
  ArrayStorage* array = inox_array_alloc_storage(&inox_default_allocator, len);

  if (array == 0) {
    inox_collection_throw("TypeError: Array allocation failed");
    return Array();
  }

  return Array(inox::adopt_value, inox_array_adopt_storage(array));
}

class Array Array::create(inox_allocator* allocator, size_t len) {
  ArrayStorage* array = inox_array_alloc_storage(allocator, len);

  if (array == 0) {
    inox_collection_throw("TypeError: Array allocation failed");
    return Array();
  }

  return Array(inox::adopt_value, inox_array_adopt_storage(array));
}

inox::Value Array::pop() const {
  inox_value array = inox::Value::raw();

  if (array.tag != INOX_TAG_ARRAY || array.as.ref == 0) {
    inox_collection_throw("TypeError: Array.pop receiver is not an Array");
    return inox::Value();
  }

  ArrayStorage* instance = (ArrayStorage*)array.as.ref;

  if (instance->length == 0) {
    return inox::Value(inox_null_value());
  }

  instance->length -= 1;
  return inox::adopt(std::exchange(instance->items[instance->length], inox_undefined_value()));
}

void Array::push(inox_value value) const {
  inox_value array = inox::Value::raw();

  if (array.tag != INOX_TAG_ARRAY || array.as.ref == 0) {
    inox_collection_throw("TypeError: Array push receiver is not an Array");
    return;
  }

  inox_status status = inox_array_push_item((ArrayStorage*)array.as.ref, value);

  if (status != INOX_OK) {
    inox_collection_throw("TypeError: Array push failed");
  }
}

void Array::set(size_t index, inox_value value) const {
  inox_value array = inox::Value::raw();

  if (array.tag != INOX_TAG_ARRAY || array.as.ref == 0) {
    inox_collection_throw("TypeError: Array assignment receiver is not an Array");
    return;
  }

  inox_status status = inox_array_set_item((ArrayStorage*)array.as.ref, index, value);

  if (status != INOX_OK) {
    inox_collection_throw("TypeError: Array assignment failed");
  }
}

class Array Array::slice(size_t start, size_t end) const {
  inox_value array = inox::Value::raw();

  if (array.tag != INOX_TAG_ARRAY || array.as.ref == 0) {
    inox_collection_throw("TypeError: Array.slice receiver is not an Array");
    return Array();
  }

  ArrayStorage* source = (ArrayStorage*)array.as.ref;

  if (start > source->length) {
    start = source->length;
  }

  if (end > source->length) {
    end = source->length;
  }

  if (end < start) {
    end = start;
  }

  ArrayStorage* target = inox_array_alloc_storage(&inox_default_allocator, end - start);

  if (target == 0) {
    inox_collection_throw("TypeError: Array slice allocation failed");
    return Array();
  }

  for (size_t index = 0; index < target->length; index += 1) {
    inox_value value = source->items[start + index];

    inox_retain(value);
    inox_release(target->items[index]);
    target->items[index] = value;
  }

  return Array(inox::adopt_value, inox_array_adopt_storage(target));
}

class Array Array::sort() const {
  inox_value array = inox::Value::raw();

  if (array.tag != INOX_TAG_ARRAY || array.as.ref == 0) {
    inox_collection_throw("TypeError: Array.sort receiver is not an Array");
    return Array();
  }

  ArrayStorage* instance = (ArrayStorage*)array.as.ref;

  if (instance->length < 2) {
    return Array(*this);
  }

  for (size_t index = 1; index < instance->length; index += 1) {
    inox_value value = instance->items[index];
    size_t scan = index;

    while (scan > 0 && inox_array_sort_compare(&instance->items[scan - 1], &value) > 0) {
      instance->items[scan] = instance->items[scan - 1];
      scan -= 1;
    }

    instance->items[scan] = value;
  }

  return Array(*this);
}

double Array::unshift(inox_value value) const {
  inox_value array = inox::Value::raw();

  if (array.tag != INOX_TAG_ARRAY || array.as.ref == 0) {
    inox_collection_throw("TypeError: Array.unshift receiver is not an Array");
    return 0;
  }

  ArrayStorage* instance = (ArrayStorage*)array.as.ref;
  inox_status status = inox_array_reserve(instance, instance->length + 1);

  if (status != INOX_OK) {
    inox_collection_throw("TypeError: Array unshift failed");
    return 0;
  }

  for (size_t index = instance->length; index > 0; index -= 1) {
    instance->items[index] = instance->items[index - 1];
  }

  inox_retain(value);
  instance->items[0] = value;
  instance->length += 1;

  return (double)instance->length;
}

inox::String Array::join(inox::StringView separator) const {
  inox_value array = inox::Value::raw();

  if (
    inox_default_allocator.alloc == 0 ||
    inox_default_allocator.free == 0 ||
    array.tag != INOX_TAG_ARRAY ||
    array.as.ref == 0 ||
    (separator.bytes == 0 && separator.len != 0)
  ) {
    return inox::String();
  }

  ArrayStorage* instance = (ArrayStorage*)array.as.ref;
  const char* separator_bytes = separator.bytes == 0 ? "" : separator.bytes;
  const size_t separator_len = separator.len;
  size_t total_len = 0;

  for (size_t index = 0; index < instance->length; index += 1) {
    char buffer[64];
    const char* bytes = "";
    size_t len = 0;
    inox_status status = inox_array_join_part(instance->items[index], buffer, sizeof(buffer), &bytes, &len);

    if (status != INOX_OK) {
      return inox::String();
    }

    if (index > 0) {
      if (total_len > (size_t)-1 - separator_len) {
        return inox::String();
      }

      total_len += separator_len;
    }

    if (total_len > (size_t)-1 - len) {
      return inox::String();
    }

    total_len += len;
  }

  if (total_len == 0) {
    return inox::String("");
  }

  char* joined = (char*)inox_default_allocator.alloc(inox_default_allocator.user, total_len, alignof(char));

  if (joined == 0) {
    return inox::String();
  }

  size_t offset = 0;

  for (size_t index = 0; index < instance->length; index += 1) {
    char buffer[64];
    const char* bytes = "";
    size_t len = 0;
    inox_status status = inox_array_join_part(instance->items[index], buffer, sizeof(buffer), &bytes, &len);

    if (status != INOX_OK) {
      inox_default_allocator.free(inox_default_allocator.user, joined, total_len, alignof(char));
      return inox::String();
    }

    if (index > 0 && separator_len > 0) {
      memcpy(joined + offset, separator_bytes, separator_len);
      offset += separator_len;
    }

    if (len > 0) {
      memcpy(joined + offset, bytes, len);
      offset += len;
    }
  }

  inox::String result(joined, total_len);
  inox_default_allocator.free(inox_default_allocator.user, joined, total_len, alignof(char));

  return result;
}

bool Array::isArray(inox_value value) const {
  return value.tag == INOX_TAG_ARRAY;
}

bool Array::isArray(const inox::Value& value) const {
  return value.raw().tag == INOX_TAG_ARRAY;
}

ArrayStorage* Array::raw(inox_value value) const {
  if (value.tag != INOX_TAG_ARRAY || value.as.ref == 0) {
    return 0;
  }

  return (ArrayStorage*)value.as.ref;
}

ArrayStorage* Array::raw(const inox::Value& value) const {
  inox_value raw_value = value.raw();

  if (raw_value.tag != INOX_TAG_ARRAY || raw_value.as.ref == 0) {
    return 0;
  }

  return (ArrayStorage*)raw_value.as.ref;
}

void Array::throwNotIterable() const {
  inox::throw_value(inox::String("TypeError: value is not iterable"));
}

class Array Array;
