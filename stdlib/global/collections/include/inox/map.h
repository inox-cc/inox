#ifndef INOX_MAP_H
#define INOX_MAP_H

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>
#include "inox/allocator.h"
#include "inox/value.h"

#ifdef __cplusplus
extern "C" {
#endif

typedef enum inox_map_slot_state { INOX_MAP_SLOT_EMPTY, INOX_MAP_SLOT_OCCUPIED, INOX_MAP_SLOT_TOMBSTONE } inox_map_slot_state;

typedef struct inox_map_entry {
  inox_value key;
  inox_value value;
  uint64_t hash;
  inox_map_slot_state state;
} inox_map_entry;

typedef struct inox_map {
  inox_ref header;
  size_t len;
  size_t cap;
  size_t tombstones;
  inox_map_entry* entries;
} inox_map;

inox_status inox_map_new(inox_allocator* allocator, inox_value* out);
inox_status inox_map_clear(inox_value map);
inox_status inox_map_delete(inox_value map, inox_value key, bool* out);
void inox_map_dispose(inox_map* map);
inox_status inox_map_get(inox_value map, inox_value key, inox_value* out);
inox_status inox_map_has(inox_value map, inox_value key, bool* out);
inox_status inox_map_set(inox_value map, inox_value key, inox_value value);
inox_status inox_map_size(inox_value map, size_t* out);

#ifdef __cplusplus
}
#endif

#endif
