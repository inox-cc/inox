#ifndef CCJS_MAP_H
#define CCJS_MAP_H

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>
#include "ccjs/allocator.h"
#include "ccjs/value.h"

typedef enum ccjs_map_slot_state {
  CCJS_MAP_SLOT_EMPTY,
  CCJS_MAP_SLOT_OCCUPIED,
  CCJS_MAP_SLOT_TOMBSTONE
} ccjs_map_slot_state;

typedef struct ccjs_map_entry {
  ccjs_value key;
  ccjs_value value;
  uint64_t hash;
  ccjs_map_slot_state state;
} ccjs_map_entry;

typedef struct ccjs_map {
  ccjs_ref header;
  size_t len;
  size_t cap;
  size_t tombstones;
  ccjs_map_entry* entries;
} ccjs_map;

ccjs_status ccjs_map_new(ccjs_allocator* allocator, ccjs_value* out);
ccjs_status ccjs_map_clear(ccjs_value map);
ccjs_status ccjs_map_delete(ccjs_value map, ccjs_value key, bool* out);
void ccjs_map_dispose(ccjs_map* map);
ccjs_status ccjs_map_get(ccjs_value map, ccjs_value key, ccjs_value* out);
ccjs_status ccjs_map_has(ccjs_value map, ccjs_value key, bool* out);
ccjs_status ccjs_map_set(ccjs_value map, ccjs_value key, ccjs_value value);
ccjs_status ccjs_map_size(ccjs_value map, size_t* out);

#endif
