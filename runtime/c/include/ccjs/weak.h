#ifndef CCJS_WEAK_H
#define CCJS_WEAK_H

#include <stdbool.h>
#include <stdint.h>
#include "ccjs/value.h"

struct ccjs_weak_cell {
  ccjs_ref* target;
  uint32_t weak_count;
  ccjs_allocator* allocator;
};

typedef struct ccjs_weak_ref {
  ccjs_weak_cell* cell;
} ccjs_weak_ref;

static inline ccjs_weak_ref ccjs_weak_null(void) {
  ccjs_weak_ref weak = { 0 };

  return weak;
}

static inline bool ccjs_weak_is_empty(ccjs_weak_ref weak) {
  return weak.cell == 0;
}

ccjs_status ccjs_weak_from_value(ccjs_value value, ccjs_weak_ref* out);
void ccjs_weak_retain(ccjs_weak_ref weak);
void ccjs_weak_release(ccjs_weak_ref weak);
ccjs_status ccjs_weak_upgrade(ccjs_weak_ref weak, ccjs_value* out);
void ccjs_weak_clear_target(ccjs_ref* ref);

#endif
