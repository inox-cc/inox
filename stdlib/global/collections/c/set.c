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
  inox_set_entry* entries = allocator->alloc(allocator->user, sizeof(inox_set_entry) * next_cap, _Alignof(inox_set_entry));

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
        allocator->free(allocator->user, entries, sizeof(inox_set_entry) * next_cap, _Alignof(inox_set_entry));
      }

      return status;
    }
  }

  if (allocator->free != 0 && set->entries != 0) {
    allocator->free(allocator->user, set->entries, sizeof(inox_set_entry) * set->cap, _Alignof(inox_set_entry));
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
      set->header.allocator->user, set->entries, sizeof(inox_set_entry) * set->cap, _Alignof(inox_set_entry)
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

  inox_set* set = allocator->alloc(allocator->user, sizeof(inox_set), _Alignof(inox_set));

  if (set == 0) {
    *out = inox_undefined_value();
    return INOX_ERR_OOM;
  }

  set->header.kind = INOX_REF_SET;
  set->header.ref_count = 1;
  set->header.flags = 0;
  set->header.size = sizeof(inox_set);
  set->header.align = _Alignof(inox_set);
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
