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
