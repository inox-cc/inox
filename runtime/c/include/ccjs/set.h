#ifndef CCJS_SET_H
#define CCJS_SET_H

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>
#include "ccjs/allocator.h"
#include "ccjs/value.h"

typedef enum ccjs_set_slot_state {
  CCJS_SET_SLOT_EMPTY,
  CCJS_SET_SLOT_OCCUPIED,
  CCJS_SET_SLOT_TOMBSTONE
} ccjs_set_slot_state;

typedef struct ccjs_set_entry {
  ccjs_value value;
  uint64_t hash;
  ccjs_set_slot_state state;
} ccjs_set_entry;

typedef struct ccjs_set {
  ccjs_ref header;
  size_t len;
  size_t cap;
  size_t tombstones;
  ccjs_set_entry* entries;
} ccjs_set;

ccjs_status ccjs_set_add(ccjs_value set, ccjs_value value);
ccjs_status ccjs_set_clear(ccjs_value set);
ccjs_status ccjs_set_delete(ccjs_value set, ccjs_value value, bool* out);
void ccjs_set_dispose(ccjs_set* set);
ccjs_status ccjs_set_has(ccjs_value set, ccjs_value value, bool* out);
ccjs_status ccjs_set_new(ccjs_allocator* allocator, ccjs_value* out);
ccjs_status ccjs_set_size(ccjs_value set, size_t* out);

#endif
