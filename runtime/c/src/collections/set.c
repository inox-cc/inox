#include "ccjs/hash.h"
#include "ccjs/set.h"

static void ccjs_set_init_entries(ccjs_set_entry* entries, size_t cap) {
  for (size_t index = 0; index < cap; index += 1) {
    entries[index].value = ccjs_undefined_value();
    entries[index].hash = 0;
    entries[index].state = CCJS_SET_SLOT_EMPTY;
  }
}

static ccjs_status ccjs_set_insert_existing(ccjs_set_entry* entries, size_t cap, ccjs_value value, uint64_t hash) {
  if (entries == 0 || cap == 0) {
    return CCJS_ERR_TYPE;
  }

  size_t mask = cap - 1;
  size_t index = (size_t)hash & mask;

  for (size_t probe = 0; probe < cap; probe += 1) {
    ccjs_set_entry* entry = &entries[index];

    if (entry->state != CCJS_SET_SLOT_OCCUPIED) {
      entry->value = value;
      entry->hash = hash;
      entry->state = CCJS_SET_SLOT_OCCUPIED;
      return CCJS_OK;
    }

    index = (index + 1) & mask;
  }

  return CCJS_ERR_TYPE;
}

static ccjs_status ccjs_set_rehash(ccjs_set* set, size_t next_cap) {
  if (set == 0 || set->header.allocator == 0 || set->header.allocator->alloc == 0) {
    return CCJS_ERR_TYPE;
  }

  ccjs_allocator* allocator = set->header.allocator;
  ccjs_set_entry* entries = allocator->alloc(allocator->user, sizeof(ccjs_set_entry) * next_cap, _Alignof(ccjs_set_entry));

  if (entries == 0) {
    return CCJS_ERR_OOM;
  }

  ccjs_set_init_entries(entries, next_cap);

  for (size_t index = 0; index < set->cap; index += 1) {
    ccjs_set_entry* entry = &set->entries[index];

    if (entry->state != CCJS_SET_SLOT_OCCUPIED) {
      continue;
    }

    ccjs_status status = ccjs_set_insert_existing(entries, next_cap, entry->value, entry->hash);

    if (status != CCJS_OK) {
      if (allocator->free != 0) {
        allocator->free(allocator->user, entries, sizeof(ccjs_set_entry) * next_cap, _Alignof(ccjs_set_entry));
      }

      return status;
    }
  }

  if (allocator->free != 0 && set->entries != 0) {
    allocator->free(allocator->user, set->entries, sizeof(ccjs_set_entry) * set->cap, _Alignof(ccjs_set_entry));
  }

  set->entries = entries;
  set->cap = next_cap;
  set->tombstones = 0;

  return CCJS_OK;
}

static ccjs_status ccjs_set_reserve(ccjs_set* set, size_t min_len) {
  if (set == 0) {
    return CCJS_ERR_TYPE;
  }

  if (set->cap > 0 && (set->len + set->tombstones + 1) * 4 < set->cap * 3 && min_len * 2 <= set->cap) {
    return CCJS_OK;
  }

  size_t next_cap = set->cap == 0 ? 8 : set->cap;

  while (next_cap < min_len * 2 || next_cap < 8) {
    next_cap *= 2;
  }

  if (next_cap == set->cap && set->tombstones > 0) {
    return ccjs_set_rehash(set, next_cap);
  }

  return ccjs_set_rehash(set, next_cap);
}

static ccjs_status ccjs_set_find(ccjs_set* set, ccjs_value value, uint64_t hash, size_t* index, bool* found) {
  if (set == 0 || index == 0 || found == 0) {
    return CCJS_ERR_TYPE;
  }

  if (set->cap == 0) {
    *index = 0;
    *found = false;
    return CCJS_OK;
  }

  size_t mask = set->cap - 1;
  size_t current = (size_t)hash & mask;
  size_t first_tombstone = (size_t)-1;

  for (size_t probe = 0; probe < set->cap; probe += 1) {
    ccjs_set_entry* entry = &set->entries[current];

    if (entry->state == CCJS_SET_SLOT_EMPTY) {
      *index = first_tombstone == (size_t)-1 ? current : first_tombstone;
      *found = false;
      return CCJS_OK;
    }

    if (entry->state == CCJS_SET_SLOT_TOMBSTONE) {
      if (first_tombstone == (size_t)-1) {
        first_tombstone = current;
      }
    } else if (entry->hash == hash && ccjs_hash_value_equal(entry->value, value)) {
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

ccjs_status ccjs_set_add(ccjs_value set, ccjs_value value) {
  if (set.tag != CCJS_TAG_SET || set.as.ref == 0) {
    return CCJS_ERR_TYPE;
  }

  ccjs_set* instance = (ccjs_set*)set.as.ref;
  uint64_t hash = 0;
  ccjs_status status = ccjs_hash_value(value, &hash);

  if (status != CCJS_OK) {
    return status;
  }

  status = ccjs_set_reserve(instance, instance->len + 1);

  if (status != CCJS_OK) {
    return status;
  }

  size_t index = 0;
  bool found = false;
  status = ccjs_set_find(instance, value, hash, &index, &found);

  if (status != CCJS_OK || found) {
    return status;
  }

  ccjs_set_entry* entry = &instance->entries[index];

  if (entry->state == CCJS_SET_SLOT_TOMBSTONE) {
    instance->tombstones -= 1;
  }

  ccjs_retain(value);
  entry->value = value;
  entry->hash = hash;
  entry->state = CCJS_SET_SLOT_OCCUPIED;
  instance->len += 1;

  return CCJS_OK;
}

ccjs_status ccjs_set_clear(ccjs_value set) {
  if (set.tag != CCJS_TAG_SET || set.as.ref == 0) {
    return CCJS_ERR_TYPE;
  }

  ccjs_set* instance = (ccjs_set*)set.as.ref;

  for (size_t index = 0; index < instance->cap; index += 1) {
    ccjs_set_entry* entry = &instance->entries[index];

    if (entry->state == CCJS_SET_SLOT_OCCUPIED) {
      ccjs_release(entry->value);
    }

    entry->value = ccjs_undefined_value();
    entry->hash = 0;
    entry->state = CCJS_SET_SLOT_EMPTY;
  }

  instance->len = 0;
  instance->tombstones = 0;

  return CCJS_OK;
}

ccjs_status ccjs_set_delete(ccjs_value set, ccjs_value value, bool* out) {
  if (out == 0 || set.tag != CCJS_TAG_SET || set.as.ref == 0) {
    return CCJS_ERR_TYPE;
  }

  ccjs_set* instance = (ccjs_set*)set.as.ref;
  uint64_t hash = 0;
  ccjs_status status = ccjs_hash_value(value, &hash);

  if (status != CCJS_OK) {
    return status;
  }

  size_t index = 0;
  bool found = false;
  status = ccjs_set_find(instance, value, hash, &index, &found);

  if (status != CCJS_OK) {
    return status;
  }

  if (!found) {
    *out = false;
    return CCJS_OK;
  }

  ccjs_set_entry* entry = &instance->entries[index];
  ccjs_release(entry->value);
  entry->value = ccjs_undefined_value();
  entry->hash = 0;
  entry->state = CCJS_SET_SLOT_TOMBSTONE;
  instance->len -= 1;
  instance->tombstones += 1;
  *out = true;

  return CCJS_OK;
}

void ccjs_set_dispose(ccjs_set* set) {
  if (set == 0) {
    return;
  }

  for (size_t index = 0; index < set->cap; index += 1) {
    ccjs_set_entry* entry = &set->entries[index];

    if (entry->state == CCJS_SET_SLOT_OCCUPIED) {
      ccjs_release(entry->value);
    }
  }

  if (set->header.allocator != 0 && set->header.allocator->free != 0 && set->entries != 0) {
    set->header.allocator->free(
      set->header.allocator->user, set->entries, sizeof(ccjs_set_entry) * set->cap, _Alignof(ccjs_set_entry)
    );
  }
}

ccjs_status ccjs_set_has(ccjs_value set, ccjs_value value, bool* out) {
  if (out == 0 || set.tag != CCJS_TAG_SET || set.as.ref == 0) {
    return CCJS_ERR_TYPE;
  }

  ccjs_set* instance = (ccjs_set*)set.as.ref;
  uint64_t hash = 0;
  ccjs_status status = ccjs_hash_value(value, &hash);

  if (status != CCJS_OK) {
    return status;
  }

  size_t index = 0;

  return ccjs_set_find(instance, value, hash, &index, out);
}

ccjs_status ccjs_set_new(ccjs_allocator* allocator, ccjs_value* out) {
  if (allocator == 0 || allocator->alloc == 0 || out == 0) {
    return CCJS_ERR_TYPE;
  }

  ccjs_set* set = allocator->alloc(allocator->user, sizeof(ccjs_set), _Alignof(ccjs_set));

  if (set == 0) {
    *out = ccjs_undefined_value();
    return CCJS_ERR_OOM;
  }

  set->header.kind = CCJS_REF_SET;
  set->header.ref_count = 1;
  set->header.flags = 0;
  set->header.size = sizeof(ccjs_set);
  set->header.align = _Alignof(ccjs_set);
  set->header.allocator = allocator;
  set->len = 0;
  set->cap = 0;
  set->tombstones = 0;
  set->entries = 0;

  out->tag = CCJS_TAG_SET;
  out->as.ref = &set->header;

  return CCJS_OK;
}

ccjs_status ccjs_set_size(ccjs_value set, size_t* out) {
  if (out == 0 || set.tag != CCJS_TAG_SET || set.as.ref == 0) {
    return CCJS_ERR_TYPE;
  }

  ccjs_set* instance = (ccjs_set*)set.as.ref;
  *out = instance->len;

  return CCJS_OK;
}
