#ifndef INOX_WEAK_H
#define INOX_WEAK_H

#include <stdbool.h>
#include <stdint.h>
#include "inox/value.h"

#ifdef __cplusplus
extern "C" {
#endif

struct inox_weak_cell {
  inox_ref* target;
  uint32_t weak_count;
  inox_allocator* allocator;
};

typedef struct inox_weak_ref {
  inox_weak_cell* cell;
} inox_weak_ref;

static inline inox_weak_ref inox_weak_null(void) {
  inox_weak_ref weak = { 0 };

  return weak;
}

static inline bool inox_weak_is_empty(inox_weak_ref weak) {
  return weak.cell == 0;
}

inox_status inox_weak_from_value(inox_value value, inox_weak_ref* out);
void inox_weak_retain(inox_weak_ref weak);
void inox_weak_release(inox_weak_ref weak);
inox_status inox_weak_upgrade(inox_weak_ref weak, inox_value* out);
void inox_weak_clear_target(inox_ref* ref);

#ifdef __cplusplus
}
#endif

#endif
