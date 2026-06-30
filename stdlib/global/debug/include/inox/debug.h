#ifndef INOX_DEBUG_H
#define INOX_DEBUG_H

#include <stddef.h>
#include "inox/allocator.h"
#include "inox/value.h"

#ifdef __cplusplus
extern "C" {
#endif

typedef struct inox_debug_memory_stats {
  size_t alloc_count;
  size_t realloc_count;
  size_t free_count;
  size_t live_alloc_count;
  size_t live_bytes;
  size_t peak_live_bytes;
  size_t retain_count;
  size_t release_count;
  size_t live_refs_by_kind[INOX_REF_KIND_COUNT];
  size_t live_promises;
  size_t live_callbacks;
  size_t live_weak_cells;
  size_t oom_fail_after;
  size_t oom_failure_count;
} inox_debug_memory_stats;

inox_allocator inox_debug_allocator(inox_allocator* inner);
void inox_debug_memory_snapshot(inox_debug_memory_stats* out);
void inox_debug_memory_reset(void);
void inox_debug_memory_reset_peak(void);
void inox_debug_memory_set_oom_after(size_t successful_allocations);
void inox_debug_memory_clear_oom(void);

void inox_debug_memory_record_ref_created(inox_ref_kind kind);
void inox_debug_memory_record_ref_destroyed(inox_ref_kind kind);
void inox_debug_memory_record_retain(void);
void inox_debug_memory_record_release(void);
void inox_debug_memory_record_promise_created(void);
void inox_debug_memory_record_promise_destroyed(void);
void inox_debug_memory_record_weak_cell_created(void);
void inox_debug_memory_record_weak_cell_destroyed(void);

#ifdef __cplusplus
}
#endif

#endif
