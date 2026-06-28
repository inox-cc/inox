#ifndef INOX_SET_H
#define INOX_SET_H

#ifdef __cplusplus
extern "C" {
#endif

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>
#include "inox/allocator.h"
#include "inox/value.h"

typedef enum inox_set_slot_state { INOX_SET_SLOT_EMPTY, INOX_SET_SLOT_OCCUPIED, INOX_SET_SLOT_TOMBSTONE } inox_set_slot_state;

typedef struct inox_set_entry {
  inox_value value;
  uint64_t hash;
  inox_set_slot_state state;
} inox_set_entry;

typedef struct inox_set {
  inox_ref header;
  size_t len;
  size_t cap;
  size_t tombstones;
  inox_set_entry* entries;
} inox_set;

inox_status inox_set_add(inox_value set, inox_value value);
inox_status inox_set_clear(inox_value set);
inox_status inox_set_delete(inox_value set, inox_value value, bool* out);
void inox_set_dispose(inox_set* set);
inox_status inox_set_has(inox_value set, inox_value value, bool* out);
inox_status inox_set_new(inox_allocator* allocator, inox_value* out);
inox_status inox_set_size(inox_value set, size_t* out);

#ifdef __cplusplus
}
#endif

#endif
