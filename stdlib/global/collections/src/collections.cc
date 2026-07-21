#include <stddef.h>
#include <stdio.h>
#include <string.h>
#include <utility>

#include "inox/array.h"
#ifdef INOX_DEBUG_MEMORY
#include "inox/debug.h"
#endif
#include "inox/loop.h"
#include "inox/map.h"
#include "inox/set.h"
#include "inox/string.h"

struct ArrayStorage {
  inox_ref header;
  size_t length;
  size_t capacity;
  inox_value* items;
};

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

static void inox_map_dispose_ref(inox_ref* ref);
static inox::Value inox_map_create_value();
static uint64_t inox_hash_mix(uint64_t hash, const void* bytes, size_t len);
static bool inox_hash_value(inox_value value, uint64_t& out);
static bool inox_value_equal(inox_value left, inox_value right);

static void inox_collection_throw(const char* message) {
  inox::throw_value(inox::String(message));
}

static bool inox_array_call_predicate(
  inox::Callback& predicate,
  inox_value item,
  size_t index,
  const char* method,
  bool* match
) {
  inox::Value arguments[] = {
    inox::Value(item),
    inox::Value(inox_number_value((double)index))
  };
  inox::Value result = predicate.call(std::span<const inox::Value>(arguments, 2));

  if (inox::thrown()) {
    return false;
  }

  if (result.tag != INOX_TAG_BOOL) {
    inox_collection_throw(method);
    return false;
  }

  *match = result.as.boolean;
  return true;
}

static void inox_map_init_entries(MapEntry* entries, size_t cap) {
  for (size_t index = 0; index < cap; index += 1) {
    entries[index].key = inox_undefined_value();
    entries[index].value = inox_undefined_value();
    entries[index].hash = 0;
    entries[index].state = MapSlotEmpty;
  }
}

static inox_status
inox_map_insert_existing(MapEntry* entries, size_t cap, inox_value key, inox_value value, uint64_t hash) {
  if (entries == 0 || cap == 0) {
    return INOX_ERR_TYPE;
  }

  size_t mask = cap - 1;
  size_t index = (size_t)hash & mask;

  for (size_t probe = 0; probe < cap; probe += 1) {
    MapEntry* entry = &entries[index];

    if (entry->state != MapSlotOccupied) {
      entry->key = key;
      entry->value = value;
      entry->hash = hash;
      entry->state = MapSlotOccupied;
      return INOX_OK;
    }

    index = (index + 1) & mask;
  }

  return INOX_ERR_TYPE;
}

static inox_status inox_map_rehash(MapStorage* map, size_t next_cap) {
  if (map == 0 || map->header.allocator == 0 || map->header.allocator->alloc == 0) {
    return INOX_ERR_TYPE;
  }

  inox_allocator* allocator = map->header.allocator;
  MapEntry* entries = (MapEntry*)allocator->alloc(
    allocator->user, sizeof(MapEntry) * next_cap, alignof(MapEntry)
  );

  if (entries == 0) {
    return INOX_ERR_OOM;
  }

  inox_map_init_entries(entries, next_cap);

  for (size_t index = 0; index < map->capacity; index += 1) {
    MapEntry* entry = &map->entries[index];

    if (entry->state != MapSlotOccupied) {
      continue;
    }

    inox_status status = inox_map_insert_existing(entries, next_cap, entry->key, entry->value, entry->hash);

    if (status != INOX_OK) {
      if (allocator->free != 0) {
        allocator->free(allocator->user, entries, sizeof(MapEntry) * next_cap, alignof(MapEntry));
      }

      return status;
    }
  }

  if (allocator->free != 0 && map->entries != 0) {
    allocator->free(allocator->user, map->entries, sizeof(MapEntry) * map->capacity, alignof(MapEntry));
  }

  map->entries = entries;
  map->capacity = next_cap;
  map->tombstones = 0;

  return INOX_OK;
}

static inox_status inox_map_reserve(MapStorage* map, size_t min_len) {
  if (map == 0) {
    return INOX_ERR_TYPE;
  }

  if (map->capacity > 0 && (map->length + map->tombstones + 1) * 4 < map->capacity * 3 && min_len * 2 <= map->capacity) {
    return INOX_OK;
  }

  size_t next_cap = map->capacity == 0 ? 8 : map->capacity;

  while (next_cap < min_len * 2 || next_cap < 8) {
    next_cap *= 2;
  }

  if (next_cap == map->capacity && map->tombstones > 0) {
    return inox_map_rehash(map, next_cap);
  }

  return inox_map_rehash(map, next_cap);
}

static inox_status inox_map_find(MapStorage* map, inox_value key, uint64_t hash, size_t* index, bool* found) {
  if (map == 0 || index == 0 || found == 0) {
    return INOX_ERR_TYPE;
  }

  if (map->capacity == 0) {
    *index = 0;
    *found = false;
    return INOX_OK;
  }

  size_t mask = map->capacity - 1;
  size_t current = (size_t)hash & mask;
  size_t first_tombstone = (size_t)-1;

  for (size_t probe = 0; probe < map->capacity; probe += 1) {
    MapEntry* entry = &map->entries[current];

    if (entry->state == MapSlotEmpty) {
      *index = first_tombstone == (size_t)-1 ? current : first_tombstone;
      *found = false;
      return INOX_OK;
    }

    if (entry->state == MapSlotTombstone) {
      if (first_tombstone == (size_t)-1) {
        first_tombstone = current;
      }
    } else if (entry->hash == hash && inox_value_equal(entry->key, key)) {
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

static MapStorage* map_data(const Map& value) {
  inox_value raw = value.raw();

  if (raw.tag != INOX_TAG_MAP || raw.as.ref == 0) {
    return 0;
  }

  return (MapStorage*)raw.as.ref;
}

static bool inox_map_add_entry(Map& map, const inox::Value& entry_value) {
  Array entry(entry_value);

  if (!entry.valid() || entry.length() < 2) {
    inox_collection_throw("TypeError: Map constructor entry is not a key/value pair");
    return false;
  }

  inox::Value key = entry.get(0);
  inox::Value value = entry.get(1);

  if (inox::thrown()) {
    return false;
  }

  map.set(key, value);
  return !inox::thrown();
}

Map::Map() : inox::Value(inox_map_create_value()) {}

Map::Map(const inox::Value& value) : inox::Value(value) {}

static inox::Value inox_map_create_value() {
  if (inox_default_allocator.alloc == 0) {
    inox_collection_throw("TypeError: Map allocator is not available");
    return inox::Value();
  }

  MapStorage* map = (MapStorage*)inox_default_allocator.alloc(
    inox_default_allocator.user, sizeof(MapStorage), alignof(MapStorage)
  );

  if (map == 0) {
    inox_collection_throw("TypeError: Map allocation failed");
    return inox::Value();
  }

  map->header.kind = INOX_REF_MAP;
  map->header.ref_count = 1;
  map->header.flags = 0;
  map->header.size = sizeof(MapStorage);
  map->header.align = alignof(MapStorage);
  map->header.allocator = &inox_default_allocator;
  map->header.dispose = inox_map_dispose_ref;
  inox_ref_init_weak(&map->header);
  map->length = 0;
  map->capacity = 0;
  map->tombstones = 0;
  map->entries = 0;

  inox_value out = inox_undefined_value();
  out.tag = INOX_TAG_MAP;
  out.as.ref = &map->header;
#ifdef INOX_DEBUG_MEMORY
  inox::debugMemory.recordRefCreated(INOX_REF_MAP);
#endif

  return inox::adopt(out);
}

Map Map::from(const inox::Value& values) {
  Map result;

  if (!result.valid() || inox::thrown()) {
    return result;
  }

  inox_value raw_values = values.raw();

  if (raw_values.tag == INOX_TAG_ARRAY) {
    Array entries(values);
    size_t length = entries.length();

    if (inox::thrown()) {
      return result;
    }

    for (size_t index = 0; index < length; index += 1) {
      inox::Value entry = entries.get(index);

      if (inox::thrown() || !inox_map_add_entry(result, entry)) {
        return result;
      }
    }

    return result;
  }

  if (raw_values.tag == INOX_TAG_MAP) {
    MapIterator iterator = Map(values).entries();

    while (true) {
      MapIterationResult step = iterator.next();

      if (inox::thrown() || step.done) {
        return result;
      }

      if (!inox_map_add_entry(result, step.value)) {
        return result;
      }
    }
  }

  inox_collection_throw("TypeError: Map constructor value is not iterable");
  return result;
}

bool Map::valid() const {
  inox_value value = inox::Value::raw();

  return value.tag == INOX_TAG_MAP && value.as.ref != 0;
}

void Map::clear() const {
  MapStorage* instance = map_data(*this);

  if (instance == 0) {
    inox_collection_throw("TypeError: Map.clear receiver is not a Map");
    return;
  }

  for (size_t index = 0; index < instance->capacity; index += 1) {
    MapEntry* entry = &instance->entries[index];

    if (entry->state == MapSlotOccupied) {
      inox_release(entry->key);
      inox_release(entry->value);
    }

    entry->key = inox_undefined_value();
    entry->value = inox_undefined_value();
    entry->hash = 0;
    entry->state = MapSlotEmpty;
  }

  instance->length = 0;
  instance->tombstones = 0;
}

bool Map::erase(const inox::Value& key) const {
  MapStorage* instance = map_data(*this);

  if (instance == 0) {
    inox_collection_throw("TypeError: Map.delete receiver is not a Map");
    return false;
  }

  inox_value raw_key = key.raw();
  uint64_t hash = 0;
  bool hash_ok = inox_hash_value(raw_key, hash);

  if (!hash_ok) {
    inox_collection_throw("TypeError: Map key is not hashable");
    return false;
  }

  size_t index = 0;
  bool found = false;
  inox_status status = inox_map_find(instance, raw_key, hash, &index, &found);

  if (status != INOX_OK) {
    inox_collection_throw("TypeError: Map lookup failed");
    return false;
  }

  if (!found) {
    return false;
  }

  MapEntry* entry = &instance->entries[index];
  inox_release(entry->key);
  inox_release(entry->value);
  entry->key = inox_undefined_value();
  entry->value = inox_undefined_value();
  entry->hash = 0;
  entry->state = MapSlotTombstone;
  instance->length -= 1;
  instance->tombstones += 1;

  return true;
}

static void inox_map_dispose(MapStorage* map) {
  if (map == 0) {
    return;
  }

  for (size_t index = 0; index < map->capacity; index += 1) {
    MapEntry* entry = &map->entries[index];

    if (entry->state == MapSlotOccupied) {
      inox_release(entry->key);
      inox_release(entry->value);
    }
  }

  if (map->header.allocator != 0 && map->header.allocator->free != 0 && map->entries != 0) {
    map->header.allocator->free(
      map->header.allocator->user, map->entries, sizeof(MapEntry) * map->capacity, alignof(MapEntry)
    );
  }
}

static void inox_map_dispose_ref(inox_ref* ref) {
  inox_map_dispose((MapStorage*)ref);
}

inox::Value Map::get(const inox::Value& key) const {
  MapStorage* instance = map_data(*this);

  if (instance == 0) {
    inox_collection_throw("TypeError: Map.get receiver is not a Map");
    return inox::Value();
  }

  inox_value raw_key = key.raw();
  uint64_t hash = 0;
  bool hash_ok = inox_hash_value(raw_key, hash);

  if (!hash_ok) {
    inox_collection_throw("TypeError: Map key is not hashable");
    return inox::Value();
  }

  size_t index = 0;
  bool found = false;
  inox_status status = inox_map_find(instance, raw_key, hash, &index, &found);

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

bool Map::has(const inox::Value& key) const {
  MapStorage* instance = map_data(*this);

  if (instance == 0) {
    inox_collection_throw("TypeError: Map.has receiver is not a Map");
    return false;
  }

  inox_value raw_key = key.raw();
  uint64_t hash = 0;
  bool hash_ok = inox_hash_value(raw_key, hash);

  if (!hash_ok) {
    inox_collection_throw("TypeError: Map key is not hashable");
    return false;
  }

  size_t index = 0;
  bool found = false;
  inox_status status = inox_map_find(instance, raw_key, hash, &index, &found);

  if (status != INOX_OK) {
    inox_collection_throw("TypeError: Map lookup failed");
    return false;
  }

  return found;
}

Map Map::set(const inox::Value& key, const inox::Value& value) const {
  MapStorage* instance = map_data(*this);

  if (instance == 0) {
    inox_collection_throw("TypeError: Map.set receiver is not a Map");
    return Map();
  }

  inox_value raw_key = key.raw();
  inox_value raw_value = value.raw();
  uint64_t hash = 0;
  bool hash_ok = inox_hash_value(raw_key, hash);

  if (!hash_ok) {
    inox_collection_throw("TypeError: Map key is not hashable");
    return Map();
  }

  inox_status status = inox_map_reserve(instance, instance->length + 1);

  if (status != INOX_OK) {
    inox_collection_throw("TypeError: Map allocation failed");
    return Map();
  }

  size_t index = 0;
  bool found = false;
  status = inox_map_find(instance, raw_key, hash, &index, &found);

  if (status != INOX_OK) {
    inox_collection_throw("TypeError: Map lookup failed");
    return Map();
  }

  MapEntry* entry = &instance->entries[index];

  if (found) {
    inox_retain(raw_value);
    inox_release(entry->value);
    entry->value = raw_value;
    return Map(*this);
  }

  if (entry->state == MapSlotTombstone) {
    instance->tombstones -= 1;
  }

  inox_retain(raw_key);
  inox_retain(raw_value);
  entry->key = raw_key;
  entry->value = raw_value;
  entry->hash = hash;
  entry->state = MapSlotOccupied;
  instance->length += 1;

  return Map(*this);
}

size_t Map::size() const {
  MapStorage* instance = map_data(*this);

  if (instance == 0) {
    inox_collection_throw("TypeError: Map.size receiver is not a Map");
    return 0;
  }

  return instance->length;
}

MapIterator Map::entries() const {
  if (!valid()) {
    inox_collection_throw("TypeError: Map.entries receiver is not a Map");
  }

  return MapIterator(*this, 0);
}

MapIterator Map::keys() const {
  if (!valid()) {
    inox_collection_throw("TypeError: Map.keys receiver is not a Map");
  }

  return MapIterator(*this, 1);
}

MapIterator Map::values() const {
  if (!valid()) {
    inox_collection_throw("TypeError: Map.values receiver is not a Map");
  }

  return MapIterator(*this, 2);
}

MapIterator::MapIterator() : owner_(), index_(0), mode_(0) {}

MapIterator::MapIterator(const Map& value, uint8_t mode) : owner_(value), index_(0), mode_(mode) {}

MapIterationResult MapIterator::next() {
  Map value(owner_);
  MapStorage* instance = map_data(value);

  if (instance == 0) {
    inox_collection_throw("TypeError: Map iterator receiver is not a Map");
    return { true, inox::Value() };
  }

  while (index_ < instance->capacity) {
    MapEntry* entry = &instance->entries[index_];
    index_ += 1;

    if (entry->state != MapSlotOccupied) {
      continue;
    }

    if (mode_ == 1) {
      return { false, inox::Value(entry->key) };
    }

    if (mode_ == 2) {
      return { false, inox::Value(entry->value) };
    }

    Array pair = Array::create(0);
    pair.push(inox::Value(entry->key));
    pair.push(inox::Value(entry->value));

    if (inox::thrown()) {
      return { true, inox::Value() };
    }

    return { false, pair };
  }

  return { true, inox::Value() };
}

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

static SetStorage* set_data(const Set& value) {
  inox_value raw = value.raw();

  if (raw.tag != INOX_TAG_SET || raw.as.ref == 0) {
    return 0;
  }

  return (SetStorage*)raw.as.ref;
}

static void inox_set_dispose_ref(inox_ref* ref);
static inox::Value inox_set_create_value();

static void inox_set_init_entries(SetEntry* entries, size_t cap) {
  for (size_t index = 0; index < cap; index += 1) {
    entries[index].value = inox_undefined_value();
    entries[index].hash = 0;
    entries[index].state = SetSlotEmpty;
  }
}

static inox_status inox_set_insert_existing(SetEntry* entries, size_t cap, inox_value value, uint64_t hash) {
  if (entries == 0 || cap == 0) {
    return INOX_ERR_TYPE;
  }

  size_t mask = cap - 1;
  size_t index = (size_t)hash & mask;

  for (size_t probe = 0; probe < cap; probe += 1) {
    SetEntry* entry = &entries[index];

    if (entry->state != SetSlotOccupied) {
      entry->value = value;
      entry->hash = hash;
      entry->state = SetSlotOccupied;
      return INOX_OK;
    }

    index = (index + 1) & mask;
  }

  return INOX_ERR_TYPE;
}

static inox_status inox_set_rehash(SetStorage* set, size_t next_cap) {
  if (set == 0 || set->header.allocator == 0 || set->header.allocator->alloc == 0) {
    return INOX_ERR_TYPE;
  }

  inox_allocator* allocator = set->header.allocator;
  SetEntry* entries = (SetEntry*)allocator->alloc(
    allocator->user, sizeof(SetEntry) * next_cap, alignof(SetEntry)
  );

  if (entries == 0) {
    return INOX_ERR_OOM;
  }

  inox_set_init_entries(entries, next_cap);

  for (size_t index = 0; index < set->capacity; index += 1) {
    SetEntry* entry = &set->entries[index];

    if (entry->state != SetSlotOccupied) {
      continue;
    }

    inox_status status = inox_set_insert_existing(entries, next_cap, entry->value, entry->hash);

    if (status != INOX_OK) {
      if (allocator->free != 0) {
        allocator->free(allocator->user, entries, sizeof(SetEntry) * next_cap, alignof(SetEntry));
      }

      return status;
    }
  }

  if (allocator->free != 0 && set->entries != 0) {
    allocator->free(allocator->user, set->entries, sizeof(SetEntry) * set->capacity, alignof(SetEntry));
  }

  set->entries = entries;
  set->capacity = next_cap;
  set->tombstones = 0;

  return INOX_OK;
}

static inox_status inox_set_reserve(SetStorage* set, size_t min_len) {
  if (set == 0) {
    return INOX_ERR_TYPE;
  }

  if (set->capacity > 0 && (set->length + set->tombstones + 1) * 4 < set->capacity * 3 && min_len * 2 <= set->capacity) {
    return INOX_OK;
  }

  size_t next_cap = set->capacity == 0 ? 8 : set->capacity;

  while (next_cap < min_len * 2 || next_cap < 8) {
    next_cap *= 2;
  }

  if (next_cap == set->capacity && set->tombstones > 0) {
    return inox_set_rehash(set, next_cap);
  }

  return inox_set_rehash(set, next_cap);
}

static inox_status inox_set_find(SetStorage* set, inox_value value, uint64_t hash, size_t* index, bool* found) {
  if (set == 0 || index == 0 || found == 0) {
    return INOX_ERR_TYPE;
  }

  if (set->capacity == 0) {
    *index = 0;
    *found = false;
    return INOX_OK;
  }

  size_t mask = set->capacity - 1;
  size_t current = (size_t)hash & mask;
  size_t first_tombstone = (size_t)-1;

  for (size_t probe = 0; probe < set->capacity; probe += 1) {
    SetEntry* entry = &set->entries[current];

    if (entry->state == SetSlotEmpty) {
      *index = first_tombstone == (size_t)-1 ? current : first_tombstone;
      *found = false;
      return INOX_OK;
    }

    if (entry->state == SetSlotTombstone) {
      if (first_tombstone == (size_t)-1) {
        first_tombstone = current;
      }
    } else if (entry->hash == hash && inox_value_equal(entry->value, value)) {
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

Set::Set() : inox::Value(inox_set_create_value()) {}

Set::Set(const inox::Value& value) : inox::Value(value) {}

Set Set::from(const inox::Value& values) {
  Set result;

  if (!result.valid() || inox::thrown()) {
    return result;
  }

  inox_value raw_values = values.raw();

  if (raw_values.tag == INOX_TAG_ARRAY) {
    Array array(values);
    size_t length = array.length();

    if (inox::thrown()) {
      return result;
    }

    for (size_t index = 0; index < length; index += 1) {
      inox::Value value = array.get(index);

      if (inox::thrown()) {
        return result;
      }

      result.add(value);

      if (inox::thrown()) {
        return result;
      }
    }

    return result;
  }

  if (raw_values.tag == INOX_TAG_SET) {
    SetIterator iterator{Set(values)};

    while (true) {
      SetIterationResult step = iterator.next();

      if (inox::thrown() || step.done) {
        return result;
      }

      result.add(step.value);

      if (inox::thrown()) {
        return result;
      }
    }
  }

  inox_collection_throw("TypeError: Set constructor value is not iterable");
  return result;
}

bool Set::valid() const {
  inox_value value = inox::Value::raw();

  return value.tag == INOX_TAG_SET && value.as.ref != 0;
}

Set Set::add(const inox::Value& value) const {
  SetStorage* instance = set_data(*this);

  if (instance == 0) {
    inox_collection_throw("TypeError: Set.add receiver is not a Set");
    return Set(*this);
  }

  inox_value raw_value = value.raw();
  uint64_t hash = 0;
  bool hash_ok = inox_hash_value(raw_value, hash);

  if (!hash_ok) {
    inox_collection_throw("TypeError: Set value is not hashable");
    return Set(*this);
  }

  inox_status status = inox_set_reserve(instance, instance->length + 1);

  if (status != INOX_OK) {
    inox_collection_throw("TypeError: Set allocation failed");
    return Set(*this);
  }

  size_t index = 0;
  bool found = false;
  status = inox_set_find(instance, raw_value, hash, &index, &found);

  if (status != INOX_OK || found) {
    if (status != INOX_OK) {
      inox_collection_throw("TypeError: Set lookup failed");
      return Set(*this);
    }

    return Set(*this);
  }

  SetEntry* entry = &instance->entries[index];

  if (entry->state == SetSlotTombstone) {
    instance->tombstones -= 1;
  }

  inox_retain(raw_value);
  entry->value = raw_value;
  entry->hash = hash;
  entry->state = SetSlotOccupied;
  instance->length += 1;

  return Set(*this);
}

void Set::clear() const {
  SetStorage* instance = set_data(*this);

  if (instance == 0) {
    inox_collection_throw("TypeError: Set.clear receiver is not a Set");
    return;
  }

  for (size_t index = 0; index < instance->capacity; index += 1) {
    SetEntry* entry = &instance->entries[index];

    if (entry->state == SetSlotOccupied) {
      inox_release(entry->value);
    }

    entry->value = inox_undefined_value();
    entry->hash = 0;
    entry->state = SetSlotEmpty;
  }

  instance->length = 0;
  instance->tombstones = 0;
}

bool Set::erase(const inox::Value& value) const {
  SetStorage* instance = set_data(*this);

  if (instance == 0) {
    inox_collection_throw("TypeError: Set.delete receiver is not a Set");
    return false;
  }

  inox_value raw_value = value.raw();
  uint64_t hash = 0;
  bool hash_ok = inox_hash_value(raw_value, hash);

  if (!hash_ok) {
    inox_collection_throw("TypeError: Set value is not hashable");
    return false;
  }

  size_t index = 0;
  bool found = false;
  inox_status status = inox_set_find(instance, raw_value, hash, &index, &found);

  if (status != INOX_OK) {
    inox_collection_throw("TypeError: Set lookup failed");
    return false;
  }

  if (!found) {
    return false;
  }

  SetEntry* entry = &instance->entries[index];
  inox_release(entry->value);
  entry->value = inox_undefined_value();
  entry->hash = 0;
  entry->state = SetSlotTombstone;
  instance->length -= 1;
  instance->tombstones += 1;

  return true;
}

static void inox_set_dispose(SetStorage* set) {
  if (set == 0) {
    return;
  }

  for (size_t index = 0; index < set->capacity; index += 1) {
    SetEntry* entry = &set->entries[index];

    if (entry->state == SetSlotOccupied) {
      inox_release(entry->value);
    }
  }

  if (set->header.allocator != 0 && set->header.allocator->free != 0 && set->entries != 0) {
    set->header.allocator->free(
      set->header.allocator->user, set->entries, sizeof(SetEntry) * set->capacity, alignof(SetEntry)
    );
  }
}

static void inox_set_dispose_ref(inox_ref* ref) {
  inox_set_dispose((SetStorage*)ref);
}

bool Set::has(const inox::Value& value) const {
  SetStorage* instance = set_data(*this);

  if (instance == 0) {
    inox_collection_throw("TypeError: Set.has receiver is not a Set");
    return false;
  }

  inox_value raw_value = value.raw();
  uint64_t hash = 0;
  bool hash_ok = inox_hash_value(raw_value, hash);

  if (!hash_ok) {
    inox_collection_throw("TypeError: Set value is not hashable");
    return false;
  }

  size_t index = 0;
  bool found = false;
  inox_status status = inox_set_find(instance, raw_value, hash, &index, &found);

  if (status != INOX_OK) {
    inox_collection_throw("TypeError: Set lookup failed");
    return false;
  }

  return found;
}

static inox::Value inox_set_create_value() {
  if (inox_default_allocator.alloc == 0) {
    inox_collection_throw("TypeError: Set allocator is not available");
    return inox::Value();
  }

  SetStorage* set = (SetStorage*)inox_default_allocator.alloc(
    inox_default_allocator.user, sizeof(SetStorage), alignof(SetStorage)
  );

  if (set == 0) {
    inox_collection_throw("TypeError: Set allocation failed");
    return inox::Value();
  }

  set->header.kind = INOX_REF_SET;
  set->header.ref_count = 1;
  set->header.flags = 0;
  set->header.size = sizeof(SetStorage);
  set->header.align = alignof(SetStorage);
  set->header.allocator = &inox_default_allocator;
  set->header.dispose = inox_set_dispose_ref;
  inox_ref_init_weak(&set->header);
  set->length = 0;
  set->capacity = 0;
  set->tombstones = 0;
  set->entries = 0;

  inox_value out = inox_undefined_value();
  out.tag = INOX_TAG_SET;
  out.as.ref = &set->header;
#ifdef INOX_DEBUG_MEMORY
  inox::debugMemory.recordRefCreated(INOX_REF_SET);
#endif

  return inox::adopt(out);
}

size_t Set::size() const {
  SetStorage* instance = set_data(*this);

  if (instance == 0) {
    inox_collection_throw("TypeError: Set.size receiver is not a Set");
    return 0;
  }

  return instance->length;
}

SetIterator Set::values() const {
  if (!valid()) {
    inox_collection_throw("TypeError: Set.values receiver is not a Set");
  }

  return SetIterator(*this);
}

SetIterator::SetIterator() : owner_(), index_(0) {}

SetIterator::SetIterator(const Set& value) : owner_(value), index_(0) {}

SetIterationResult SetIterator::next() {
  Set value(owner_);
  SetStorage* instance = set_data(value);

  if (instance == 0) {
    inox_collection_throw("TypeError: Set iterator receiver is not a Set");
    return { true, inox::Value() };
  }

  while (index_ < instance->capacity) {
    SetEntry* entry = &instance->entries[index_];
    index_ += 1;

    if (entry->state == SetSlotOccupied) {
      return { false, inox::Value(entry->value) };
    }
  }

  return { true, inox::Value() };
}

static uint64_t inox_hash_mix(uint64_t hash, const void* bytes, size_t len) {
  const unsigned char* data = (const unsigned char*)bytes;

  for (size_t index = 0; index < len; index += 1) {
    hash ^= data[index];
    hash *= 1099511628211ULL;
  }

  return hash;
}

static bool inox_hash_value(inox_value value, uint64_t& out) {
  uint64_t hash = 1469598103934665603ULL;
  uint8_t tag = (uint8_t)value.tag;

  hash = inox_hash_mix(hash, &tag, sizeof(tag));

  if (value.tag == INOX_TAG_STRING) {
    if (value.as.ref == 0) {
      return false;
    }

    inox_string* string = (inox_string*)value.as.ref;
    out = inox_hash_mix(hash, string->bytes, string->len);
    return true;
  }

  if (value.tag == INOX_TAG_NUMBER) {
    double number = value.as.number;

    if (number != number) {
      uint64_t nan_bits = 0x7ff8000000000000ULL;
      out = inox_hash_mix(hash, &nan_bits, sizeof(nan_bits));
      return true;
    }

    if (number == 0) {
      number = 0;
    }

    uint64_t bits = 0;
    memcpy(&bits, &number, sizeof(bits));
    out = inox_hash_mix(hash, &bits, sizeof(bits));
    return true;
  }

  if (value.tag == INOX_TAG_BOOL) {
    uint8_t boolean = value.as.boolean ? 1 : 0;
    out = inox_hash_mix(hash, &boolean, sizeof(boolean));
    return true;
  }

  if (inox_is_ref_value(value)) {
    if (value.as.ref == 0) {
      return false;
    }

    uintptr_t ref = (uintptr_t)value.as.ref;
    out = inox_hash_mix(hash, &ref, sizeof(ref));
    return true;
  }

  if (value.tag == INOX_TAG_NULL || value.tag == INOX_TAG_UNDEFINED) {
    out = hash;
    return true;
  }

  return false;
}

static bool inox_value_equal(inox_value left, inox_value right) {
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

  if (cap <= array->capacity) {
    return INOX_OK;
  }

  size_t next_cap = array->capacity == 0 ? 4 : array->capacity;

  while (next_cap < cap) {
    next_cap *= 2;
  }

  inox_value* items = (inox_value*)array->header.allocator->realloc(
    array->header.allocator->user,
    array->items,
    sizeof(inox_value) * array->capacity,
    sizeof(inox_value) * next_cap,
    alignof(inox_value)
  );

  if (items == 0) {
    return INOX_ERR_OOM;
  }

  array->items = items;

  for (size_t index = array->capacity; index < next_cap; index += 1) {
    array->items[index] = inox_undefined_value();
  }

  array->capacity = next_cap;

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
      array->header.allocator->user, array->items, sizeof(inox_value) * array->capacity, alignof(inox_value)
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
  array->capacity = len;

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

Array::Array(const inox::Value& value) : inox::Value(value) {}

Array::Array(inox::Value&& value) : inox::Value(std::move(value)) {}

static ArrayStorage* array_data(const Array& value) {
  inox_value raw = value.raw();

  if (raw.tag != INOX_TAG_ARRAY || raw.as.ref == 0) {
    return 0;
  }

  return (ArrayStorage*)raw.as.ref;
}

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

bool Array::includes(const inox::Value& value) const {
  inox_value array = inox::Value::raw();

  if (array.tag != INOX_TAG_ARRAY || array.as.ref == 0) {
    inox_collection_throw("TypeError: Array.includes receiver is not an Array");
    return false;
  }

  ArrayStorage* instance = (ArrayStorage*)array.as.ref;
  inox_value raw_value = value.raw();

  for (size_t index = 0; index < instance->length; ++index) {
    if (inox_value_equal(instance->items[index], raw_value)) {
      return true;
    }
  }

  return false;
}

Array Array::create(size_t len) {
  ArrayStorage* array = inox_array_alloc_storage(&inox_default_allocator, len);

  if (array == 0) {
    inox_collection_throw("TypeError: Array allocation failed");
    return Array();
  }

  return Array(inox::adopt(inox_array_adopt_storage(array)));
}

Array Array::from(inox::StringView value) {
  Array result = Array::create(value.len);

  if (!result.valid() || inox::thrown()) {
    return result;
  }

  for (size_t index = 0; index < value.len; index += 1) {
    result.set(index, inox::String(value.bytes + index, 1));

    if (inox::thrown()) {
      return result;
    }
  }

  return result;
}

Array Array::filter(inox::Callback predicate) const {
  inox_value array = inox::Value::raw();

  if (array.tag != INOX_TAG_ARRAY || array.as.ref == 0) {
    inox_collection_throw("TypeError: Array.filter receiver is not an Array");
    return Array();
  }

  ArrayStorage* instance = (ArrayStorage*)array.as.ref;
  Array result = Array::create(0);

  if (inox::thrown()) {
    return Array();
  }

  for (size_t index = 0; index < instance->length; index += 1) {
    bool match = false;

    if (!inox_array_call_predicate(
          predicate,
          instance->items[index],
          index,
          "TypeError: Array.filter callback must return boolean",
          &match
        )) {
      return Array();
    }

    if (match) {
      result.push(inox::Value(instance->items[index]));

      if (inox::thrown()) {
        return Array();
      }
    }
  }

  return result;
}

inox::Value Array::find(inox::Callback predicate) const {
  inox_value array = inox::Value::raw();

  if (array.tag != INOX_TAG_ARRAY || array.as.ref == 0) {
    inox_collection_throw("TypeError: Array.find receiver is not an Array");
    return inox::Value();
  }

  ArrayStorage* instance = (ArrayStorage*)array.as.ref;

  for (size_t index = 0; index < instance->length; index += 1) {
    bool match = false;

    if (!inox_array_call_predicate(
          predicate,
          instance->items[index],
          index,
          "TypeError: Array.find callback must return boolean",
          &match
        )) {
      return inox::Value();
    }

    if (match) {
      return inox::Value(instance->items[index]);
    }
  }

  return inox::Value(inox_null_value());
}

Array Array::map(inox::Callback callback) const {
  inox_value array = inox::Value::raw();

  if (array.tag != INOX_TAG_ARRAY || array.as.ref == 0) {
    inox_collection_throw("TypeError: Array.map receiver is not an Array");
    return Array();
  }

  ArrayStorage* instance = (ArrayStorage*)array.as.ref;
  Array result = Array::create(0);

  if (inox::thrown()) {
    return Array();
  }

  for (size_t index = 0; index < instance->length; index += 1) {
    inox::Value arguments[] = {
      inox::Value(instance->items[index]),
      inox::Value(inox_number_value((double)index))
    };
    inox::Value mapped = callback.call(std::span<const inox::Value>(arguments, 2));

    if (inox::thrown()) {
      return Array();
    }

    result.push(mapped);

    if (inox::thrown()) {
      return Array();
    }
  }

  return result;
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

void Array::appendAll(const Array& values) const {
  size_t count = values.length();

  if (inox::thrown()) {
    return;
  }

  for (size_t index = 0; index < count; index += 1) {
    push(values.get(index));

    if (inox::thrown()) {
      return;
    }
  }
}

size_t Array::push(const inox::Value& value) const {
  inox_value array = inox::Value::raw();

  if (array.tag != INOX_TAG_ARRAY || array.as.ref == 0) {
    inox_collection_throw("TypeError: Array push receiver is not an Array");
    return 0;
  }

  ArrayStorage* instance = (ArrayStorage*)array.as.ref;
  inox_status status = inox_array_reserve(instance, instance->length + 1);

  if (status != INOX_OK) {
    inox_collection_throw("TypeError: Array push failed");
    return 0;
  }

  inox_value item = value.raw();
  inox_retain(item);
  instance->items[instance->length] = item;
  instance->length += 1;
  return instance->length;
}

inox::Value Array::reduce(inox::Callback callback, const inox::Value& initial) const {
  inox_value array = inox::Value::raw();

  if (array.tag != INOX_TAG_ARRAY || array.as.ref == 0) {
    inox_collection_throw("TypeError: Array.reduce receiver is not an Array");
    return inox::Value();
  }

  ArrayStorage* instance = (ArrayStorage*)array.as.ref;
  inox::Value accumulator = initial;

  for (size_t index = 0; index < instance->length; index += 1) {
    inox::Value arguments[] = {
      accumulator,
      inox::Value(instance->items[index]),
      inox::Value(inox_number_value((double)index))
    };
    accumulator = callback.call(std::span<const inox::Value>(arguments, 3));

    if (inox::thrown()) {
      return inox::Value();
    }
  }

  return accumulator;
}

inox::Value Array::set(size_t index, const inox::Value& value) const {
  inox_value array = inox::Value::raw();

  if (array.tag != INOX_TAG_ARRAY || array.as.ref == 0) {
    inox_collection_throw("TypeError: Array assignment receiver is not an Array");
    return inox::Value();
  }

  ArrayStorage* instance = (ArrayStorage*)array.as.ref;

  if (index >= instance->length) {
    inox_collection_throw("TypeError: Array assignment failed");
    return inox::Value();
  }

  inox_value item = value.raw();
  inox_retain(item);
  inox_release(instance->items[index]);
  instance->items[index] = item;
  return value;
}

Array Array::slice(size_t start, size_t end) const {
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

  return Array(inox::adopt(inox_array_adopt_storage(target)));
}

bool Array::some(inox::Callback predicate) const {
  inox_value array = inox::Value::raw();

  if (array.tag != INOX_TAG_ARRAY || array.as.ref == 0) {
    inox_collection_throw("TypeError: Array.some receiver is not an Array");
    return false;
  }

  ArrayStorage* instance = (ArrayStorage*)array.as.ref;

  for (size_t index = 0; index < instance->length; index += 1) {
    bool match = false;

    if (!inox_array_call_predicate(
          predicate,
          instance->items[index],
          index,
          "TypeError: Array.some callback must return boolean",
          &match
        )) {
      return false;
    }

    if (match) {
      return true;
    }
  }

  return false;
}

Array Array::sort() const {
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

Array Array::sort(inox::Callback compare) const {
  inox_value array = inox::Value::raw();

  if (array.tag != INOX_TAG_ARRAY || array.as.ref == 0) {
    inox_collection_throw("TypeError: Array.sort receiver is not an Array");
    return Array();
  }

  ArrayStorage* instance = (ArrayStorage*)array.as.ref;

  for (size_t index = 1; index < instance->length; index += 1) {
    inox_value value = instance->items[index];
    size_t scan = index;

    while (scan > 0) {
      inox::Value arguments[] = {
        inox::Value(instance->items[scan - 1]),
        inox::Value(value)
      };
      inox::Value compared = compare.call(std::span<const inox::Value>(arguments, 2));

      if (inox::thrown()) {
        return Array();
      }

      if (compared.tag != INOX_TAG_NUMBER) {
        inox_collection_throw("TypeError: Array.sort callback must return number");
        return Array();
      }

      if (compared.as.number <= 0) {
        break;
      }

      instance->items[scan] = instance->items[scan - 1];
      scan -= 1;
    }

    instance->items[scan] = value;
  }

  return Array(*this);
}

double Array::unshift(const inox::Value& value) const {
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

  inox_value item = value.raw();
  inox_retain(item);
  instance->items[0] = item;
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

bool Array::isArray(const inox::Value& value) {
  return value.raw().tag == INOX_TAG_ARRAY;
}

ArrayIterator Array::values() const {
  if (!valid()) {
    inox_collection_throw("TypeError: Array.values receiver is not an Array");
  }

  return ArrayIterator(*this);
}

ArrayIterator::ArrayIterator() : owner_(), index_(0) {}

ArrayIterator::ArrayIterator(const Array& value) : owner_(value), index_(0) {}

ArrayIterationResult ArrayIterator::next() {
  Array value(owner_);
  ArrayStorage* instance = array_data(value);

  if (instance == 0) {
    inox_collection_throw("TypeError: Array iterator receiver is not an Array");
    return { true, inox::Value() };
  }

  if (index_ >= instance->length) {
    return { true, inox::Value() };
  }

  return { false, inox::Value(instance->items[index_++]) };
}
