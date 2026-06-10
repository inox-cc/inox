#include "ccjs/hash.h"
#include "ccjs/map.h"

static void ccjs_map_init_entries(ccjs_map_entry* entries, size_t cap) {
  for (size_t index = 0; index < cap; index += 1) {
    entries[index].key = ccjs_undefined_value();
    entries[index].value = ccjs_undefined_value();
    entries[index].hash = 0;
    entries[index].state = CCJS_MAP_SLOT_EMPTY;
  }
}

static ccjs_status ccjs_map_insert_existing(ccjs_map_entry* entries, size_t cap, ccjs_value key, ccjs_value value, uint64_t hash) {
  if (entries == 0 || cap == 0) {
    return CCJS_ERR_TYPE;
  }

  size_t mask = cap - 1;
  size_t index = (size_t)hash & mask;

  for (size_t probe = 0; probe < cap; probe += 1) {
    ccjs_map_entry* entry = &entries[index];

    if (entry->state != CCJS_MAP_SLOT_OCCUPIED) {
      entry->key = key;
      entry->value = value;
      entry->hash = hash;
      entry->state = CCJS_MAP_SLOT_OCCUPIED;
      return CCJS_OK;
    }

    index = (index + 1) & mask;
  }

  return CCJS_ERR_TYPE;
}

static ccjs_status ccjs_map_rehash(ccjs_map* map, size_t next_cap) {
  if (map == 0 || map->header.allocator == 0 || map->header.allocator->alloc == 0) {
    return CCJS_ERR_TYPE;
  }

  ccjs_allocator* allocator = map->header.allocator;
  ccjs_map_entry* entries = allocator->alloc(
    allocator->user,
    sizeof(ccjs_map_entry) * next_cap,
    _Alignof(ccjs_map_entry)
  );

  if (entries == 0) {
    return CCJS_ERR_OOM;
  }

  ccjs_map_init_entries(entries, next_cap);

  for (size_t index = 0; index < map->cap; index += 1) {
    ccjs_map_entry* entry = &map->entries[index];

    if (entry->state != CCJS_MAP_SLOT_OCCUPIED) {
      continue;
    }

    ccjs_status status = ccjs_map_insert_existing(entries, next_cap, entry->key, entry->value, entry->hash);

    if (status != CCJS_OK) {
      if (allocator->free != 0) {
        allocator->free(allocator->user, entries, sizeof(ccjs_map_entry) * next_cap, _Alignof(ccjs_map_entry));
      }

      return status;
    }
  }

  if (allocator->free != 0 && map->entries != 0) {
    allocator->free(
      allocator->user,
      map->entries,
      sizeof(ccjs_map_entry) * map->cap,
      _Alignof(ccjs_map_entry)
    );
  }

  map->entries = entries;
  map->cap = next_cap;
  map->tombstones = 0;

  return CCJS_OK;
}

static ccjs_status ccjs_map_reserve(ccjs_map* map, size_t min_len) {
  if (map == 0) {
    return CCJS_ERR_TYPE;
  }

  if (map->cap > 0 && (map->len + map->tombstones + 1) * 4 < map->cap * 3 && min_len * 2 <= map->cap) {
    return CCJS_OK;
  }

  size_t next_cap = map->cap == 0 ? 8 : map->cap;

  while (next_cap < min_len * 2 || next_cap < 8) {
    next_cap *= 2;
  }

  if (next_cap == map->cap && map->tombstones > 0) {
    return ccjs_map_rehash(map, next_cap);
  }

  return ccjs_map_rehash(map, next_cap);
}

static ccjs_status ccjs_map_find(ccjs_map* map, ccjs_value key, uint64_t hash, size_t* index, bool* found) {
  if (map == 0 || index == 0 || found == 0) {
    return CCJS_ERR_TYPE;
  }

  if (map->cap == 0) {
    *index = 0;
    *found = false;
    return CCJS_OK;
  }

  size_t mask = map->cap - 1;
  size_t current = (size_t)hash & mask;
  size_t first_tombstone = (size_t)-1;

  for (size_t probe = 0; probe < map->cap; probe += 1) {
    ccjs_map_entry* entry = &map->entries[current];

    if (entry->state == CCJS_MAP_SLOT_EMPTY) {
      *index = first_tombstone == (size_t)-1 ? current : first_tombstone;
      *found = false;
      return CCJS_OK;
    }

    if (entry->state == CCJS_MAP_SLOT_TOMBSTONE) {
      if (first_tombstone == (size_t)-1) {
        first_tombstone = current;
      }
    } else if (entry->hash == hash && ccjs_hash_value_equal(entry->key, key)) {
      *index = current;
      *found = true;
      return CCJS_OK;
    }

    current = (current + 1) & mask;
  }

  if (first_tombstone != (size_t)-1) {
    *index = first_tombstone;
    *found = false;
    return CCJS_OK;
  }

  return CCJS_ERR_TYPE;
}

ccjs_status ccjs_map_new(ccjs_allocator* allocator, ccjs_value* out) {
  if (allocator == 0 || allocator->alloc == 0 || out == 0) {
    return CCJS_ERR_TYPE;
  }

  ccjs_map* map = allocator->alloc(allocator->user, sizeof(ccjs_map), _Alignof(ccjs_map));

  if (map == 0) {
    *out = ccjs_undefined_value();
    return CCJS_ERR_OOM;
  }

  map->header.kind = CCJS_REF_MAP;
  map->header.ref_count = 1;
  map->header.flags = 0;
  map->header.size = sizeof(ccjs_map);
  map->header.align = _Alignof(ccjs_map);
  map->header.allocator = allocator;
  map->len = 0;
  map->cap = 0;
  map->tombstones = 0;
  map->entries = 0;

  out->tag = CCJS_TAG_MAP;
  out->as.ref = &map->header;

  return CCJS_OK;
}

ccjs_status ccjs_map_clear(ccjs_value map) {
  if (map.tag != CCJS_TAG_MAP || map.as.ref == 0) {
    return CCJS_ERR_TYPE;
  }

  ccjs_map* instance = (ccjs_map*)map.as.ref;

  for (size_t index = 0; index < instance->cap; index += 1) {
    ccjs_map_entry* entry = &instance->entries[index];

    if (entry->state == CCJS_MAP_SLOT_OCCUPIED) {
      ccjs_release(entry->key);
      ccjs_release(entry->value);
    }

    entry->key = ccjs_undefined_value();
    entry->value = ccjs_undefined_value();
    entry->hash = 0;
    entry->state = CCJS_MAP_SLOT_EMPTY;
  }

  instance->len = 0;
  instance->tombstones = 0;

  return CCJS_OK;
}

ccjs_status ccjs_map_delete(ccjs_value map, ccjs_value key, bool* out) {
  if (out == 0 || map.tag != CCJS_TAG_MAP || map.as.ref == 0) {
    return CCJS_ERR_TYPE;
  }

  ccjs_map* instance = (ccjs_map*)map.as.ref;
  uint64_t hash = 0;
  ccjs_status status = ccjs_hash_value(key, &hash);

  if (status != CCJS_OK) {
    return status;
  }

  size_t index = 0;
  bool found = false;
  status = ccjs_map_find(instance, key, hash, &index, &found);

  if (status != CCJS_OK) {
    return status;
  }

  if (!found) {
    *out = false;
    return CCJS_OK;
  }

  ccjs_map_entry* entry = &instance->entries[index];
  ccjs_release(entry->key);
  ccjs_release(entry->value);
  entry->key = ccjs_undefined_value();
  entry->value = ccjs_undefined_value();
  entry->hash = 0;
  entry->state = CCJS_MAP_SLOT_TOMBSTONE;
  instance->len -= 1;
  instance->tombstones += 1;
  *out = true;

  return CCJS_OK;
}

void ccjs_map_dispose(ccjs_map* map) {
  if (map == 0) {
    return;
  }

  for (size_t index = 0; index < map->cap; index += 1) {
    ccjs_map_entry* entry = &map->entries[index];

    if (entry->state == CCJS_MAP_SLOT_OCCUPIED) {
      ccjs_release(entry->key);
      ccjs_release(entry->value);
    }
  }

  if (map->header.allocator != 0 && map->header.allocator->free != 0 && map->entries != 0) {
    map->header.allocator->free(
      map->header.allocator->user,
      map->entries,
      sizeof(ccjs_map_entry) * map->cap,
      _Alignof(ccjs_map_entry)
    );
  }
}

ccjs_status ccjs_map_get(ccjs_value map, ccjs_value key, ccjs_value* out) {
  if (out == 0 || map.tag != CCJS_TAG_MAP || map.as.ref == 0) {
    return CCJS_ERR_TYPE;
  }

  ccjs_map* instance = (ccjs_map*)map.as.ref;
  uint64_t hash = 0;
  ccjs_status status = ccjs_hash_value(key, &hash);

  if (status != CCJS_OK) {
    return status;
  }

  size_t index = 0;
  bool found = false;
  status = ccjs_map_find(instance, key, hash, &index, &found);

  if (status != CCJS_OK) {
    return status;
  }

  if (!found) {
    *out = ccjs_null_value();
    return CCJS_OK;
  }

  *out = instance->entries[index].value;
  ccjs_retain(*out);

  return CCJS_OK;
}

ccjs_status ccjs_map_has(ccjs_value map, ccjs_value key, bool* out) {
  if (out == 0 || map.tag != CCJS_TAG_MAP || map.as.ref == 0) {
    return CCJS_ERR_TYPE;
  }

  ccjs_map* instance = (ccjs_map*)map.as.ref;
  uint64_t hash = 0;
  ccjs_status status = ccjs_hash_value(key, &hash);

  if (status != CCJS_OK) {
    return status;
  }

  size_t index = 0;

  return ccjs_map_find(instance, key, hash, &index, out);
}

ccjs_status ccjs_map_set(ccjs_value map, ccjs_value key, ccjs_value value) {
  if (map.tag != CCJS_TAG_MAP || map.as.ref == 0) {
    return CCJS_ERR_TYPE;
  }

  ccjs_map* instance = (ccjs_map*)map.as.ref;
  uint64_t hash = 0;
  ccjs_status status = ccjs_hash_value(key, &hash);

  if (status != CCJS_OK) {
    return status;
  }

  status = ccjs_map_reserve(instance, instance->len + 1);

  if (status != CCJS_OK) {
    return status;
  }

  size_t index = 0;
  bool found = false;
  status = ccjs_map_find(instance, key, hash, &index, &found);

  if (status != CCJS_OK) {
    return status;
  }

  ccjs_map_entry* entry = &instance->entries[index];

  if (found) {
    ccjs_retain(value);
    ccjs_release(entry->value);
    entry->value = value;
    return CCJS_OK;
  }

  if (entry->state == CCJS_MAP_SLOT_TOMBSTONE) {
    instance->tombstones -= 1;
  }

  ccjs_retain(key);
  ccjs_retain(value);
  entry->key = key;
  entry->value = value;
  entry->hash = hash;
  entry->state = CCJS_MAP_SLOT_OCCUPIED;
  instance->len += 1;

  return CCJS_OK;
}

ccjs_status ccjs_map_size(ccjs_value map, size_t* out) {
  if (out == 0 || map.tag != CCJS_TAG_MAP || map.as.ref == 0) {
    return CCJS_ERR_TYPE;
  }

  ccjs_map* instance = (ccjs_map*)map.as.ref;
  *out = instance->len;

  return CCJS_OK;
}
