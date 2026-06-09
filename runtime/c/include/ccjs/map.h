#ifndef CCJS_MAP_H
#define CCJS_MAP_H

#include <stdbool.h>
#include <stddef.h>
#include "ccjs/allocator.h"
#include "ccjs/value.h"

typedef struct ccjs_map_entry {
  ccjs_value key;
  ccjs_value value;
} ccjs_map_entry;

typedef struct ccjs_map {
  ccjs_ref header;
  size_t len;
  size_t cap;
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
