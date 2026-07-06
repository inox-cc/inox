#ifdef INOX_DEBUG_MEMORY
#include "inox/debug.h"
#endif
#include "inox/hash.h"
#include "inox/map.h"

static void inox_map_dispose_ref(inox_ref* ref);

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
    } else if (entry->hash == hash && inox_hash_value_equal(entry->key, key)) {
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

inox_status inox_map_new(inox_allocator* allocator, inox_value* out) {
  if (allocator == 0 || allocator->alloc == 0 || out == 0) {
    return INOX_ERR_TYPE;
  }

  inox_map* map = (inox_map*)allocator->alloc(allocator->user, sizeof(inox_map), alignof(inox_map));

  if (map == 0) {
    *out = inox_undefined_value();
    return INOX_ERR_OOM;
  }

  map->header.kind = INOX_REF_MAP;
  map->header.ref_count = 1;
  map->header.flags = 0;
  map->header.size = sizeof(inox_map);
  map->header.align = alignof(inox_map);
  map->header.allocator = allocator;
  map->header.dispose = inox_map_dispose_ref;
  inox_ref_init_weak(&map->header);
  map->len = 0;
  map->cap = 0;
  map->tombstones = 0;
  map->entries = 0;

  out->tag = INOX_TAG_MAP;
  out->as.ref = &map->header;
#ifdef INOX_DEBUG_MEMORY
  inox_debug_memory_record_ref_created(INOX_REF_MAP);
#endif

  return INOX_OK;
}

inox_status inox_map_clear(inox_value map) {
  if (map.tag != INOX_TAG_MAP || map.as.ref == 0) {
    return INOX_ERR_TYPE;
  }

  inox_map* instance = (inox_map*)map.as.ref;

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

  return INOX_OK;
}

inox_status inox_map_delete(inox_value map, inox_value key, bool* out) {
  if (out == 0 || map.tag != INOX_TAG_MAP || map.as.ref == 0) {
    return INOX_ERR_TYPE;
  }

  inox_map* instance = (inox_map*)map.as.ref;
  uint64_t hash = 0;
  inox_status status = inox_hash_value(key, &hash);

  if (status != INOX_OK) {
    return status;
  }

  size_t index = 0;
  bool found = false;
  status = inox_map_find(instance, key, hash, &index, &found);

  if (status != INOX_OK) {
    return status;
  }

  if (!found) {
    *out = false;
    return INOX_OK;
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
  *out = true;

  return INOX_OK;
}

void inox_map_dispose(inox_map* map) {
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

inox_status inox_map_get(inox_value map, inox_value key, inox_value* out) {
  if (out == 0 || map.tag != INOX_TAG_MAP || map.as.ref == 0) {
    return INOX_ERR_TYPE;
  }

  inox_map* instance = (inox_map*)map.as.ref;
  uint64_t hash = 0;
  inox_status status = inox_hash_value(key, &hash);

  if (status != INOX_OK) {
    return status;
  }

  size_t index = 0;
  bool found = false;
  status = inox_map_find(instance, key, hash, &index, &found);

  if (status != INOX_OK) {
    return status;
  }

  if (!found) {
    *out = inox_undefined_value();
    return INOX_OK;
  }

  *out = instance->entries[index].value;
  inox_retain(*out);

  return INOX_OK;
}

inox_status inox_map_has(inox_value map, inox_value key, bool* out) {
  if (out == 0 || map.tag != INOX_TAG_MAP || map.as.ref == 0) {
    return INOX_ERR_TYPE;
  }

  inox_map* instance = (inox_map*)map.as.ref;
  uint64_t hash = 0;
  inox_status status = inox_hash_value(key, &hash);

  if (status != INOX_OK) {
    return status;
  }

  size_t index = 0;

  return inox_map_find(instance, key, hash, &index, out);
}

inox_status inox_map_set(inox_value map, inox_value key, inox_value value) {
  if (map.tag != INOX_TAG_MAP || map.as.ref == 0) {
    return INOX_ERR_TYPE;
  }

  inox_map* instance = (inox_map*)map.as.ref;
  uint64_t hash = 0;
  inox_status status = inox_hash_value(key, &hash);

  if (status != INOX_OK) {
    return status;
  }

  status = inox_map_reserve(instance, instance->len + 1);

  if (status != INOX_OK) {
    return status;
  }

  size_t index = 0;
  bool found = false;
  status = inox_map_find(instance, key, hash, &index, &found);

  if (status != INOX_OK) {
    return status;
  }

  inox_map_entry* entry = &instance->entries[index];

  if (found) {
    inox_retain(value);
    inox_release(entry->value);
    entry->value = value;
    return INOX_OK;
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

  return INOX_OK;
}

inox_status inox_map_size(inox_value map, size_t* out) {
  if (out == 0 || map.tag != INOX_TAG_MAP || map.as.ref == 0) {
    return INOX_ERR_TYPE;
  }

  inox_map* instance = (inox_map*)map.as.ref;
  *out = instance->len;

  return INOX_OK;
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
    } else if (entry->hash == hash && inox_hash_value_equal(entry->value, value)) {
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

inox_status inox_set_add(inox_value set, inox_value value) {
  if (set.tag != INOX_TAG_SET || set.as.ref == 0) {
    return INOX_ERR_TYPE;
  }

  inox_set* instance = (inox_set*)set.as.ref;
  uint64_t hash = 0;
  inox_status status = inox_hash_value(value, &hash);

  if (status != INOX_OK) {
    return status;
  }

  status = inox_set_reserve(instance, instance->len + 1);

  if (status != INOX_OK) {
    return status;
  }

  size_t index = 0;
  bool found = false;
  status = inox_set_find(instance, value, hash, &index, &found);

  if (status != INOX_OK || found) {
    return status;
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

  return INOX_OK;
}

inox_status inox_set_clear(inox_value set) {
  if (set.tag != INOX_TAG_SET || set.as.ref == 0) {
    return INOX_ERR_TYPE;
  }

  inox_set* instance = (inox_set*)set.as.ref;

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

  return INOX_OK;
}

inox_status inox_set_delete(inox_value set, inox_value value, bool* out) {
  if (out == 0 || set.tag != INOX_TAG_SET || set.as.ref == 0) {
    return INOX_ERR_TYPE;
  }

  inox_set* instance = (inox_set*)set.as.ref;
  uint64_t hash = 0;
  inox_status status = inox_hash_value(value, &hash);

  if (status != INOX_OK) {
    return status;
  }

  size_t index = 0;
  bool found = false;
  status = inox_set_find(instance, value, hash, &index, &found);

  if (status != INOX_OK) {
    return status;
  }

  if (!found) {
    *out = false;
    return INOX_OK;
  }

  inox_set_entry* entry = &instance->entries[index];
  inox_release(entry->value);
  entry->value = inox_undefined_value();
  entry->hash = 0;
  entry->state = INOX_SET_SLOT_TOMBSTONE;
  instance->len -= 1;
  instance->tombstones += 1;
  *out = true;

  return INOX_OK;
}

void inox_set_dispose(inox_set* set) {
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

inox_status inox_set_has(inox_value set, inox_value value, bool* out) {
  if (out == 0 || set.tag != INOX_TAG_SET || set.as.ref == 0) {
    return INOX_ERR_TYPE;
  }

  inox_set* instance = (inox_set*)set.as.ref;
  uint64_t hash = 0;
  inox_status status = inox_hash_value(value, &hash);

  if (status != INOX_OK) {
    return status;
  }

  size_t index = 0;

  return inox_set_find(instance, value, hash, &index, out);
}

inox_status inox_set_new(inox_allocator* allocator, inox_value* out) {
  if (allocator == 0 || allocator->alloc == 0 || out == 0) {
    return INOX_ERR_TYPE;
  }

  inox_set* set = (inox_set*)allocator->alloc(allocator->user, sizeof(inox_set), alignof(inox_set));

  if (set == 0) {
    *out = inox_undefined_value();
    return INOX_ERR_OOM;
  }

  set->header.kind = INOX_REF_SET;
  set->header.ref_count = 1;
  set->header.flags = 0;
  set->header.size = sizeof(inox_set);
  set->header.align = alignof(inox_set);
  set->header.allocator = allocator;
  set->header.dispose = inox_set_dispose_ref;
  inox_ref_init_weak(&set->header);
  set->len = 0;
  set->cap = 0;
  set->tombstones = 0;
  set->entries = 0;

  out->tag = INOX_TAG_SET;
  out->as.ref = &set->header;
#ifdef INOX_DEBUG_MEMORY
  inox_debug_memory_record_ref_created(INOX_REF_SET);
#endif

  return INOX_OK;
}

inox_status inox_set_size(inox_value set, size_t* out) {
  if (out == 0 || set.tag != INOX_TAG_SET || set.as.ref == 0) {
    return INOX_ERR_TYPE;
  }

  inox_set* instance = (inox_set*)set.as.ref;
  *out = instance->len;

  return INOX_OK;
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

extern "C" uint64_t inox_hash_mix(uint64_t hash, const void* bytes, size_t len) {
  const unsigned char* data = (const unsigned char*)bytes;

  for (size_t index = 0; index < len; index += 1) {
    hash ^= data[index];
    hash *= 1099511628211ULL;
  }

  return hash;
}

extern "C" inox_status inox_hash_value(inox_value value, uint64_t* out) {
  if (out == 0) {
    return INOX_ERR_TYPE;
  }

  uint64_t hash = 1469598103934665603ULL;
  uint8_t tag = (uint8_t)value.tag;

  hash = inox_hash_mix(hash, &tag, sizeof(tag));

  if (value.tag == INOX_TAG_STRING) {
    if (value.as.ref == 0) {
      return INOX_ERR_TYPE;
    }

    inox_string* string = (inox_string*)value.as.ref;
    *out = inox_hash_mix(hash, string->bytes, string->len);
    return INOX_OK;
  }

  if (value.tag == INOX_TAG_NUMBER) {
    double number = value.as.number;

    if (number != number) {
      uint64_t nan_bits = 0x7ff8000000000000ULL;
      *out = inox_hash_mix(hash, &nan_bits, sizeof(nan_bits));
      return INOX_OK;
    }

    if (number == 0) {
      number = 0;
    }

    uint64_t bits = 0;
    memcpy(&bits, &number, sizeof(bits));
    *out = inox_hash_mix(hash, &bits, sizeof(bits));
    return INOX_OK;
  }

  if (value.tag == INOX_TAG_BOOL) {
    uint8_t boolean = value.as.boolean ? 1 : 0;
    *out = inox_hash_mix(hash, &boolean, sizeof(boolean));
    return INOX_OK;
  }

  if (inox_is_ref_value(value)) {
    if (value.as.ref == 0) {
      return INOX_ERR_TYPE;
    }

    uintptr_t ref = (uintptr_t)value.as.ref;
    *out = inox_hash_mix(hash, &ref, sizeof(ref));
    return INOX_OK;
  }

  if (value.tag == INOX_TAG_NULL || value.tag == INOX_TAG_UNDEFINED) {
    *out = hash;
    return INOX_OK;
  }

  return INOX_ERR_TYPE;
}

extern "C" bool inox_hash_value_equal(inox_value left, inox_value right) {
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

static inox_status inox_array_reserve(inox_array* array, size_t cap) {
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

  inox_array* array = (inox_array*)ref;

  for (size_t index = 0; index < array->length; index += 1) {
    inox_release(array->items[index]);
  }

  if (array->header.allocator != 0 && array->header.allocator->free != 0 && array->items != 0) {
    array->header.allocator->free(
      array->header.allocator->user, array->items, sizeof(inox_value) * array->cap, alignof(inox_value)
    );
  }
}

static inox_status array_make(inox_allocator* allocator, size_t len, inox_value* out) {
  if (allocator == 0 || allocator->alloc == 0 || out == 0) {
    return INOX_ERR_TYPE;
  }

  inox_array* array = (inox_array*)allocator->alloc(allocator->user, sizeof(inox_array), alignof(inox_array));

  if (array == 0) {
    *out = inox_undefined_value();
    return INOX_ERR_OOM;
  }

  array->items =
    len == 0 ? 0 : (inox_value*)allocator->alloc(allocator->user, sizeof(inox_value) * len, alignof(inox_value));

  if (len > 0 && array->items == 0) {
    *out = inox_undefined_value();
    if (allocator->free != 0) {
      allocator->free(allocator->user, array, sizeof(inox_array), alignof(inox_array));
    }
    return INOX_ERR_OOM;
  }

  array->header.kind = INOX_REF_ARRAY;
  array->header.ref_count = 1;
  array->header.flags = 0;
  array->header.size = sizeof(inox_array);
  array->header.align = alignof(inox_array);
  array->header.allocator = allocator;
  array->header.dispose = inox_array_dispose_ref;
  inox_ref_init_weak(&array->header);
  array->length = len;
  array->cap = len;

  for (size_t index = 0; index < len; index += 1) {
    array->items[index] = inox_undefined_value();
  }

  out->tag = INOX_TAG_ARRAY;
  out->as.ref = &array->header;
#ifdef INOX_DEBUG_MEMORY
  inox_debug_memory_record_ref_created(INOX_REF_ARRAY);
#endif

  return INOX_OK;
}

static inox_status array_push(inox_value array, inox_value value) {
  if (array.tag != INOX_TAG_ARRAY || array.as.ref == 0) {
    return INOX_ERR_TYPE;
  }

  inox_array* instance = (inox_array*)array.as.ref;
  inox_status status = inox_array_reserve(instance, instance->length + 1);

  if (status != INOX_OK) {
    return status;
  }

  inox_retain(value);
  instance->items[instance->length] = value;
  instance->length += 1;

  return INOX_OK;
}

static inox_status array_unshift(inox_value array, inox_value value, size_t* out) {
  if (out == 0 || array.tag != INOX_TAG_ARRAY || array.as.ref == 0) {
    return INOX_ERR_TYPE;
  }

  inox_array* instance = (inox_array*)array.as.ref;
  inox_status status = inox_array_reserve(instance, instance->length + 1);

  if (status != INOX_OK) {
    return status;
  }

  for (size_t index = instance->length; index > 0; index -= 1) {
    instance->items[index] = instance->items[index - 1];
  }

  inox_retain(value);
  instance->items[0] = value;
  instance->length += 1;
  *out = instance->length;

  return INOX_OK;
}

static inox_status array_get(inox_value array, size_t index, inox_value* out) {
  if (out == 0 || array.tag != INOX_TAG_ARRAY || array.as.ref == 0) {
    return INOX_ERR_TYPE;
  }

  inox_array* instance = (inox_array*)array.as.ref;

  if (index >= instance->length) {
    *out = inox_undefined_value();
    return INOX_ERR_FIELD;
  }

  *out = instance->items[index];
  inox_retain(*out);

  return INOX_OK;
}

static inox_status array_length(inox_value array, size_t* out) {
  if (out == 0 || array.tag != INOX_TAG_ARRAY || array.as.ref == 0) {
    return INOX_ERR_TYPE;
  }

  inox_array* instance = (inox_array*)array.as.ref;
  *out = instance->length;

  return INOX_OK;
}

static inox_status array_pop(inox_value array, inox_value* out) {
  if (out == 0 || array.tag != INOX_TAG_ARRAY || array.as.ref == 0) {
    return INOX_ERR_TYPE;
  }

  inox_array* instance = (inox_array*)array.as.ref;

  if (instance->length == 0) {
    *out = inox_null_value();
    return INOX_OK;
  }

  instance->length -= 1;
  *out = instance->items[instance->length];
  instance->items[instance->length] = inox_undefined_value();

  return INOX_OK;
}

static inox_status array_set(inox_value array, size_t index, inox_value value) {
  if (array.tag != INOX_TAG_ARRAY || array.as.ref == 0) {
    return INOX_ERR_TYPE;
  }

  inox_array* instance = (inox_array*)array.as.ref;

  if (index >= instance->length) {
    return INOX_ERR_FIELD;
  }

  inox_retain(value);
  inox_release(instance->items[index]);
  instance->items[index] = value;

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

static inox::String array_join_string(inox_value array, inox::StringView separator_view) {
  if (
    inox_default_allocator.alloc == 0 || inox_default_allocator.free == 0 ||
    array.tag != INOX_TAG_ARRAY || array.as.ref == 0 || (separator_view.bytes == 0 && separator_view.len != 0)
  ) {
    return inox::String();
  }

  inox_array* instance = (inox_array*)array.as.ref;
  const char* separator = separator_view.bytes == 0 ? "" : separator_view.bytes;
  const size_t separator_len = separator_view.len;
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
      memcpy(joined + offset, separator, separator_len);
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

static inox_status array_slice(inox_allocator* allocator, inox_value array, size_t start, size_t end, inox_value* out) {
  if (allocator == 0 || out == 0 || array.tag != INOX_TAG_ARRAY || array.as.ref == 0) {
    return INOX_ERR_TYPE;
  }

  inox_array* source = (inox_array*)array.as.ref;

  if (start > source->length) {
    start = source->length;
  }

  if (end > source->length) {
    end = source->length;
  }

  if (end < start) {
    end = start;
  }

  inox_status status = array_make(allocator, end - start, out);

  if (status != INOX_OK) {
    return status;
  }

  inox_array* target = (inox_array*)out->as.ref;

  for (size_t index = 0; index < target->length; index += 1) {
    inox_value value = source->items[start + index];

    inox_retain(value);
    inox_release(target->items[index]);
    target->items[index] = value;
  }

  return INOX_OK;
}

static inox_status array_sort(inox_value array) {
  if (array.tag != INOX_TAG_ARRAY || array.as.ref == 0) {
    return INOX_ERR_TYPE;
  }

  inox_array* instance = (inox_array*)array.as.ref;

  if (instance->length < 2) {
    return INOX_OK;
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

  return INOX_OK;
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

inox_status Array::make(inox_allocator* allocator, size_t len, inox_value* out) const {
  if (allocator == 0 || allocator->alloc == 0 || out == 0) {
    return INOX_ERR_TYPE;
  }

  inox_array* array = (inox_array*)allocator->alloc(allocator->user, sizeof(inox_array), alignof(inox_array));

  if (array == 0) {
    *out = inox_undefined_value();
    return INOX_ERR_OOM;
  }

  array->items =
    len == 0 ? 0 : (inox_value*)allocator->alloc(allocator->user, sizeof(inox_value) * len, alignof(inox_value));

  if (len > 0 && array->items == 0) {
    *out = inox_undefined_value();
    if (allocator->free != 0) {
      allocator->free(allocator->user, array, sizeof(inox_array), alignof(inox_array));
    }
    return INOX_ERR_OOM;
  }

  array->header.kind = INOX_REF_ARRAY;
  array->header.ref_count = 1;
  array->header.flags = 0;
  array->header.size = sizeof(inox_array);
  array->header.align = alignof(inox_array);
  array->header.allocator = allocator;
  array->header.dispose = inox_array_dispose_ref;
  inox_ref_init_weak(&array->header);
  array->length = len;
  array->cap = len;

  for (size_t index = 0; index < len; index += 1) {
    array->items[index] = inox_undefined_value();
  }

  out->tag = INOX_TAG_ARRAY;
  out->as.ref = &array->header;
#ifdef INOX_DEBUG_MEMORY
  inox_debug_memory_record_ref_created(INOX_REF_ARRAY);
#endif

  return INOX_OK;
}

inox_status Array::get(inox_value array, size_t index, inox_value* out) const {
  if (out == 0 || array.tag != INOX_TAG_ARRAY || array.as.ref == 0) {
    return INOX_ERR_TYPE;
  }

  inox_array* instance = (inox_array*)array.as.ref;

  if (index >= instance->length) {
    *out = inox_undefined_value();
    return INOX_ERR_FIELD;
  }

  *out = instance->items[index];
  inox_retain(*out);

  return INOX_OK;
}

inox_status Array::length(inox_value array, size_t* out) const {
  if (out == 0 || array.tag != INOX_TAG_ARRAY || array.as.ref == 0) {
    return INOX_ERR_TYPE;
  }

  inox_array* instance = (inox_array*)array.as.ref;
  *out = instance->length;

  return INOX_OK;
}

inox_status Array::pop(inox_value array, inox_value* out) const {
  if (out == 0 || array.tag != INOX_TAG_ARRAY || array.as.ref == 0) {
    return INOX_ERR_TYPE;
  }

  inox_array* instance = (inox_array*)array.as.ref;

  if (instance->length == 0) {
    *out = inox_null_value();
    return INOX_OK;
  }

  instance->length -= 1;
  *out = instance->items[instance->length];
  instance->items[instance->length] = inox_undefined_value();

  return INOX_OK;
}

inox_status Array::push(inox_value array, inox_value value) const {
  if (array.tag != INOX_TAG_ARRAY || array.as.ref == 0) {
    return INOX_ERR_TYPE;
  }

  inox_array* instance = (inox_array*)array.as.ref;
  inox_status status = inox_array_reserve(instance, instance->length + 1);

  if (status != INOX_OK) {
    return status;
  }

  inox_retain(value);
  instance->items[instance->length] = value;
  instance->length += 1;

  return INOX_OK;
}

inox_status Array::set(inox_value array, size_t index, inox_value value) const {
  if (array.tag != INOX_TAG_ARRAY || array.as.ref == 0) {
    return INOX_ERR_TYPE;
  }

  inox_array* instance = (inox_array*)array.as.ref;

  if (index >= instance->length) {
    return INOX_ERR_FIELD;
  }

  inox_retain(value);
  inox_release(instance->items[index]);
  instance->items[index] = value;

  return INOX_OK;
}

inox_status Array::slice(inox_allocator* allocator, inox_value array, size_t start, size_t end, inox_value* out) const {
  if (allocator == 0 || out == 0 || array.tag != INOX_TAG_ARRAY || array.as.ref == 0) {
    return INOX_ERR_TYPE;
  }

  inox_array* source = (inox_array*)array.as.ref;

  if (start > source->length) {
    start = source->length;
  }

  if (end > source->length) {
    end = source->length;
  }

  if (end < start) {
    end = start;
  }

  inox_status status = make(allocator, end - start, out);

  if (status != INOX_OK) {
    return status;
  }

  inox_array* target = (inox_array*)out->as.ref;

  for (size_t index = 0; index < target->length; index += 1) {
    inox_value value = source->items[start + index];

    inox_retain(value);
    inox_release(target->items[index]);
    target->items[index] = value;
  }

  return INOX_OK;
}

inox_status Array::sort(inox_value array) const {
  if (array.tag != INOX_TAG_ARRAY || array.as.ref == 0) {
    return INOX_ERR_TYPE;
  }

  inox_array* instance = (inox_array*)array.as.ref;

  if (instance->length < 2) {
    return INOX_OK;
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

  return INOX_OK;
}

inox_status Array::unshift(inox_value array, inox_value value, size_t* out) const {
  if (out == 0 || array.tag != INOX_TAG_ARRAY || array.as.ref == 0) {
    return INOX_ERR_TYPE;
  }

  inox_array* instance = (inox_array*)array.as.ref;
  inox_status status = inox_array_reserve(instance, instance->length + 1);

  if (status != INOX_OK) {
    return status;
  }

  for (size_t index = instance->length; index > 0; index -= 1) {
    instance->items[index] = instance->items[index - 1];
  }

  inox_retain(value);
  instance->items[0] = value;
  instance->length += 1;
  *out = instance->length;

  return INOX_OK;
}

inox::String Array::join(inox::StringView separator) const {
  if (!valid()) {
    return inox::String();
  }

  return array_join_string(inox::Value::raw(), separator);
}

bool Array::isArray(inox_value value) const {
  return value.tag == INOX_TAG_ARRAY;
}

bool Array::isArray(const inox::Value& value) const {
  return value.raw().tag == INOX_TAG_ARRAY;
}

inox_array* Array::raw(inox_value value) const {
  if (value.tag != INOX_TAG_ARRAY || value.as.ref == 0) {
    return 0;
  }

  return (inox_array*)value.as.ref;
}

inox_array* Array::raw(const inox::Value& value) const {
  inox_value raw_value = value.raw();

  if (raw_value.tag != INOX_TAG_ARRAY || raw_value.as.ref == 0) {
    return 0;
  }

  return (inox_array*)raw_value.as.ref;
}

void Array::throwNotIterable() const {
  inox::throw_value(inox::String("TypeError: value is not iterable"));
}

class Array Array;
