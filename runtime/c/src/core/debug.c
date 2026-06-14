#include <stdbool.h>
#include <string.h>
#include "ccjs/debug.h"

#ifdef CCJS_DEBUG_MEMORY
static ccjs_debug_memory_stats ccjs_debug_stats;
static bool ccjs_debug_oom_enabled = false;

static void ccjs_debug_update_peak(void) {
  if (ccjs_debug_stats.live_bytes > ccjs_debug_stats.peak_live_bytes) {
    ccjs_debug_stats.peak_live_bytes = ccjs_debug_stats.live_bytes;
  }
}

static bool ccjs_debug_should_fail_allocation(void) {
  if (!ccjs_debug_oom_enabled) {
    return false;
  }

  size_t successful_allocations = ccjs_debug_stats.alloc_count + ccjs_debug_stats.realloc_count;

  if (successful_allocations >= ccjs_debug_stats.oom_fail_after) {
    ccjs_debug_stats.oom_failure_count += 1;
    return true;
  }

  return false;
}

static ccjs_allocator* ccjs_debug_inner_allocator(void* user) {
  return (ccjs_allocator*)user;
}

static void* ccjs_debug_alloc(void* user, size_t size, size_t align) {
  ccjs_allocator* inner = ccjs_debug_inner_allocator(user);

  if (inner == 0 || inner->alloc == 0 || ccjs_debug_should_fail_allocation()) {
    return 0;
  }

  void* ptr = inner->alloc(inner->user, size, align);

  if (ptr != 0) {
    ccjs_debug_stats.alloc_count += 1;
    ccjs_debug_stats.live_alloc_count += 1;
    ccjs_debug_stats.live_bytes += size;
    ccjs_debug_update_peak();
  }

  return ptr;
}

static void* ccjs_debug_realloc(void* user, void* ptr, size_t old_size, size_t new_size, size_t align) {
  ccjs_allocator* inner = ccjs_debug_inner_allocator(user);

  if (inner == 0 || inner->realloc == 0 || ccjs_debug_should_fail_allocation()) {
    return 0;
  }

  void* next = inner->realloc(inner->user, ptr, old_size, new_size, align);

  if (next != 0) {
    ccjs_debug_stats.realloc_count += 1;

    if (new_size >= old_size) {
      ccjs_debug_stats.live_bytes += new_size - old_size;
    } else {
      ccjs_debug_stats.live_bytes -= old_size - new_size;
    }

    ccjs_debug_update_peak();
  }

  return next;
}

static void ccjs_debug_free(void* user, void* ptr, size_t size, size_t align) {
  ccjs_allocator* inner = ccjs_debug_inner_allocator(user);

  if (inner == 0 || inner->free == 0) {
    return;
  }

  inner->free(inner->user, ptr, size, align);

  if (ptr != 0) {
    ccjs_debug_stats.free_count += 1;

    if (ccjs_debug_stats.live_alloc_count > 0) {
      ccjs_debug_stats.live_alloc_count -= 1;
    }

    if (ccjs_debug_stats.live_bytes >= size) {
      ccjs_debug_stats.live_bytes -= size;
    } else {
      ccjs_debug_stats.live_bytes = 0;
    }
  }
}
#endif

ccjs_allocator ccjs_debug_allocator(ccjs_allocator* inner) {
#ifdef CCJS_DEBUG_MEMORY
  ccjs_allocator allocator = { inner, ccjs_debug_alloc, ccjs_debug_realloc, ccjs_debug_free };

  return allocator;
#else
  if (inner != 0) {
    return *inner;
  }

  ccjs_allocator allocator = { 0, 0, 0, 0 };

  return allocator;
#endif
}

void ccjs_debug_memory_snapshot(ccjs_debug_memory_stats* out) {
  if (out == 0) {
    return;
  }

#ifdef CCJS_DEBUG_MEMORY
  *out = ccjs_debug_stats;
#else
  memset(out, 0, sizeof(*out));
#endif
}

void ccjs_debug_memory_reset(void) {
#ifdef CCJS_DEBUG_MEMORY
  memset(&ccjs_debug_stats, 0, sizeof(ccjs_debug_stats));
  ccjs_debug_oom_enabled = false;
#endif
}

void ccjs_debug_memory_reset_peak(void) {
#ifdef CCJS_DEBUG_MEMORY
  ccjs_debug_stats.peak_live_bytes = ccjs_debug_stats.live_bytes;
#endif
}

void ccjs_debug_memory_set_oom_after(size_t successful_allocations) {
#ifdef CCJS_DEBUG_MEMORY
  ccjs_debug_stats.oom_fail_after = successful_allocations;
  ccjs_debug_oom_enabled = true;
#else
  (void)successful_allocations;
#endif
}

void ccjs_debug_memory_clear_oom(void) {
#ifdef CCJS_DEBUG_MEMORY
  ccjs_debug_oom_enabled = false;
  ccjs_debug_stats.oom_fail_after = 0;
#endif
}

void ccjs_debug_memory_record_ref_created(ccjs_ref_kind kind) {
#ifdef CCJS_DEBUG_MEMORY
  if ((size_t)kind < CCJS_REF_KIND_COUNT) {
    ccjs_debug_stats.live_refs_by_kind[kind] += 1;

    if (kind == CCJS_REF_FUNCTION) {
      ccjs_debug_stats.live_callbacks += 1;
    }
  }
#else
  (void)kind;
#endif
}

void ccjs_debug_memory_record_ref_destroyed(ccjs_ref_kind kind) {
#ifdef CCJS_DEBUG_MEMORY
  if ((size_t)kind < CCJS_REF_KIND_COUNT) {
    if (ccjs_debug_stats.live_refs_by_kind[kind] > 0) {
      ccjs_debug_stats.live_refs_by_kind[kind] -= 1;
    }

    if (kind == CCJS_REF_FUNCTION && ccjs_debug_stats.live_callbacks > 0) {
      ccjs_debug_stats.live_callbacks -= 1;
    }
  }
#else
  (void)kind;
#endif
}

void ccjs_debug_memory_record_retain(void) {
#ifdef CCJS_DEBUG_MEMORY
  ccjs_debug_stats.retain_count += 1;
#endif
}

void ccjs_debug_memory_record_release(void) {
#ifdef CCJS_DEBUG_MEMORY
  ccjs_debug_stats.release_count += 1;
#endif
}

void ccjs_debug_memory_record_promise_created(void) {
#ifdef CCJS_DEBUG_MEMORY
  ccjs_debug_stats.live_promises += 1;
#endif
}

void ccjs_debug_memory_record_promise_destroyed(void) {
#ifdef CCJS_DEBUG_MEMORY
  if (ccjs_debug_stats.live_promises > 0) {
    ccjs_debug_stats.live_promises -= 1;
  }
#endif
}

void ccjs_debug_memory_record_weak_cell_created(void) {
#ifdef CCJS_DEBUG_MEMORY
  ccjs_debug_stats.live_weak_cells += 1;
#endif
}

void ccjs_debug_memory_record_weak_cell_destroyed(void) {
#ifdef CCJS_DEBUG_MEMORY
  if (ccjs_debug_stats.live_weak_cells > 0) {
    ccjs_debug_stats.live_weak_cells -= 1;
  }
#endif
}
