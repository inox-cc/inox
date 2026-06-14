#ifndef CCJS_DEBUG_H
#define CCJS_DEBUG_H

#include <stddef.h>
#include "ccjs/allocator.h"
#include "ccjs/value.h"

typedef struct ccjs_debug_memory_stats {
  size_t alloc_count;
  size_t realloc_count;
  size_t free_count;
  size_t live_alloc_count;
  size_t live_bytes;
  size_t peak_live_bytes;
  size_t retain_count;
  size_t release_count;
  size_t live_refs_by_kind[CCJS_REF_KIND_COUNT];
  size_t live_promises;
  size_t live_callbacks;
  size_t live_weak_cells;
  size_t oom_fail_after;
  size_t oom_failure_count;
} ccjs_debug_memory_stats;

ccjs_allocator ccjs_debug_allocator(ccjs_allocator* inner);
void ccjs_debug_memory_snapshot(ccjs_debug_memory_stats* out);
void ccjs_debug_memory_reset(void);
void ccjs_debug_memory_reset_peak(void);
void ccjs_debug_memory_set_oom_after(size_t successful_allocations);
void ccjs_debug_memory_clear_oom(void);

void ccjs_debug_memory_record_ref_created(ccjs_ref_kind kind);
void ccjs_debug_memory_record_ref_destroyed(ccjs_ref_kind kind);
void ccjs_debug_memory_record_retain(void);
void ccjs_debug_memory_record_release(void);
void ccjs_debug_memory_record_promise_created(void);
void ccjs_debug_memory_record_promise_destroyed(void);
void ccjs_debug_memory_record_weak_cell_created(void);
void ccjs_debug_memory_record_weak_cell_destroyed(void);

#endif
