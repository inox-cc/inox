#include <string.h>
#include "ccjs/map.h"
#include "ccjs/string.h"

static bool ccjs_map_key_equal(ccjs_value left, ccjs_value right) {
  if (left.tag != right.tag) {
    return false;
  }

  if (left.tag == CCJS_TAG_STRING) {
    if (left.as.ref == 0 || right.as.ref == 0) {
      return left.as.ref == right.as.ref;
    }

    ccjs_string* left_string = (ccjs_string*)left.as.ref;
    ccjs_string* right_string = (ccjs_string*)right.as.ref;

    return left_string->len == right_string->len
      && memcmp(left_string->bytes, right_string->bytes, left_string->len) == 0;
  }

  if (left.tag == CCJS_TAG_NUMBER) {
    return left.as.number == right.as.number;
  }

  if (left.tag == CCJS_TAG_BOOL) {
    return left.as.boolean == right.as.boolean;
  }

  if (left.tag == CCJS_TAG_NULL || left.tag == CCJS_TAG_UNDEFINED) {
    return true;
  }

  return left.as.ref == right.as.ref;
}

static ccjs_status ccjs_map_find(ccjs_map* map, ccjs_value key, size_t* index, bool* found) {
  if (map == 0 || index == 0 || found == 0) {
    return CCJS_ERR_TYPE;
  }

  for (size_t current = 0; current < map->len; current += 1) {
    if (ccjs_map_key_equal(map->entries[current].key, key)) {
      *index = current;
      *found = true;
      return CCJS_OK;
    }
  }

  *index = map->len;
  *found = false;

  return CCJS_OK;
}

static ccjs_status ccjs_map_reserve(ccjs_map* map, size_t min_cap) {
  if (map == 0 || map->header.allocator == 0 || map->header.allocator->realloc == 0) {
    return CCJS_ERR_TYPE;
  }

  if (map->cap >= min_cap) {
    return CCJS_OK;
  }

  size_t next_cap = map->cap == 0 ? 4 : map->cap * 2;

  while (next_cap < min_cap) {
    next_cap *= 2;
  }

  ccjs_allocator* allocator = map->header.allocator;
  ccjs_map_entry* entries = allocator->realloc(
    allocator->user,
    map->entries,
    sizeof(ccjs_map_entry) * map->cap,
    sizeof(ccjs_map_entry) * next_cap,
    _Alignof(ccjs_map_entry)
  );

  if (entries == 0) {
    return CCJS_ERR_OOM;
  }

  for (size_t index = map->cap; index < next_cap; index += 1) {
    entries[index].key = ccjs_undefined_value();
    entries[index].value = ccjs_undefined_value();
  }

  map->entries = entries;
  map->cap = next_cap;

  return CCJS_OK;
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

  for (size_t index = 0; index < instance->len; index += 1) {
    ccjs_release(instance->entries[index].key);
    ccjs_release(instance->entries[index].value);
    instance->entries[index].key = ccjs_undefined_value();
    instance->entries[index].value = ccjs_undefined_value();
  }

  instance->len = 0;

  return CCJS_OK;
}

ccjs_status ccjs_map_delete(ccjs_value map, ccjs_value key, bool* out) {
  if (out == 0 || map.tag != CCJS_TAG_MAP || map.as.ref == 0) {
    return CCJS_ERR_TYPE;
  }

  ccjs_map* instance = (ccjs_map*)map.as.ref;
  size_t index = 0;
  bool found = false;
  ccjs_status status = ccjs_map_find(instance, key, &index, &found);

  if (status != CCJS_OK) {
    return status;
  }

  if (!found) {
    *out = false;
    return CCJS_OK;
  }

  ccjs_release(instance->entries[index].key);
  ccjs_release(instance->entries[index].value);

  size_t last = instance->len - 1;

  if (index != last) {
    instance->entries[index] = instance->entries[last];
  }

  instance->entries[last].key = ccjs_undefined_value();
  instance->entries[last].value = ccjs_undefined_value();
  instance->len -= 1;
  *out = true;

  return CCJS_OK;
}

void ccjs_map_dispose(ccjs_map* map) {
  if (map == 0) {
    return;
  }

  for (size_t index = 0; index < map->len; index += 1) {
    ccjs_release(map->entries[index].key);
    ccjs_release(map->entries[index].value);
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
  size_t index = 0;
  bool found = false;
  ccjs_status status = ccjs_map_find(instance, key, &index, &found);

  if (status != CCJS_OK) {
    return status;
  }

  if (!found) {
    *out = ccjs_undefined_value();
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
  size_t index = 0;

  return ccjs_map_find(instance, key, &index, out);
}

ccjs_status ccjs_map_set(ccjs_value map, ccjs_value key, ccjs_value value) {
  if (map.tag != CCJS_TAG_MAP || map.as.ref == 0) {
    return CCJS_ERR_TYPE;
  }

  ccjs_map* instance = (ccjs_map*)map.as.ref;
  size_t index = 0;
  bool found = false;
  ccjs_status status = ccjs_map_find(instance, key, &index, &found);

  if (status != CCJS_OK) {
    return status;
  }

  if (found) {
    ccjs_retain(value);
    ccjs_release(instance->entries[index].value);
    instance->entries[index].value = value;
    return CCJS_OK;
  }

  status = ccjs_map_reserve(instance, instance->len + 1);

  if (status != CCJS_OK) {
    return status;
  }

  ccjs_retain(key);
  ccjs_retain(value);
  instance->entries[instance->len].key = key;
  instance->entries[instance->len].value = value;
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
