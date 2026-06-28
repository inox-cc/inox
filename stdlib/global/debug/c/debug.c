#include <stdbool.h>
#include <string.h>
#include "inox/debug.h"

#ifdef INOX_DEBUG_MEMORY
static inox_debug_memory_stats inox_debug_stats;
static bool inox_debug_oom_enabled = false;

static void inox_debug_update_peak(void) {
  if (inox_debug_stats.live_bytes > inox_debug_stats.peak_live_bytes) {
    inox_debug_stats.peak_live_bytes = inox_debug_stats.live_bytes;
  }
}

static bool inox_debug_should_fail_allocation(void) {
  if (!inox_debug_oom_enabled) {
    return false;
  }

  size_t successful_allocations = inox_debug_stats.alloc_count + inox_debug_stats.realloc_count;

  if (successful_allocations >= inox_debug_stats.oom_fail_after) {
    inox_debug_stats.oom_failure_count += 1;
    return true;
  }

  return false;
}

static inox_allocator* inox_debug_inner_allocator(void* user) {
  return (inox_allocator*)user;
}

static void* inox_debug_alloc(void* user, size_t size, size_t align) {
  inox_allocator* inner = inox_debug_inner_allocator(user);

  if (inner == 0 || inner->alloc == 0 || inox_debug_should_fail_allocation()) {
    return 0;
  }

  void* ptr = inner->alloc(inner->user, size, align);

  if (ptr != 0) {
    inox_debug_stats.alloc_count += 1;
    inox_debug_stats.live_alloc_count += 1;
    inox_debug_stats.live_bytes += size;
    inox_debug_update_peak();
  }

  return ptr;
}

static void* inox_debug_realloc(void* user, void* ptr, size_t old_size, size_t new_size, size_t align) {
  inox_allocator* inner = inox_debug_inner_allocator(user);

  if (inner == 0 || inner->realloc == 0 || inox_debug_should_fail_allocation()) {
    return 0;
  }

  void* next = inner->realloc(inner->user, ptr, old_size, new_size, align);

  if (next != 0) {
    inox_debug_stats.realloc_count += 1;

    if (new_size >= old_size) {
      inox_debug_stats.live_bytes += new_size - old_size;
    } else {
      inox_debug_stats.live_bytes -= old_size - new_size;
    }

    inox_debug_update_peak();
  }

  return next;
}

static void inox_debug_free(void* user, void* ptr, size_t size, size_t align) {
  inox_allocator* inner = inox_debug_inner_allocator(user);

  if (inner == 0 || inner->free == 0) {
    return;
  }

  inner->free(inner->user, ptr, size, align);

  if (ptr != 0) {
    inox_debug_stats.free_count += 1;

    if (inox_debug_stats.live_alloc_count > 0) {
      inox_debug_stats.live_alloc_count -= 1;
    }

    if (inox_debug_stats.live_bytes >= size) {
      inox_debug_stats.live_bytes -= size;
    } else {
      inox_debug_stats.live_bytes = 0;
    }
  }
}
#endif

inox_allocator inox_debug_allocator(inox_allocator* inner) {
#ifdef INOX_DEBUG_MEMORY
  inox_allocator allocator = { inner, inox_debug_alloc, inox_debug_realloc, inox_debug_free };

  return allocator;
#else
  if (inner != 0) {
    return *inner;
  }

  inox_allocator allocator = { 0, 0, 0, 0 };

  return allocator;
#endif
}

void inox_debug_memory_snapshot(inox_debug_memory_stats* out) {
  if (out == 0) {
    return;
  }

#ifdef INOX_DEBUG_MEMORY
  *out = inox_debug_stats;
#else
  memset(out, 0, sizeof(*out));
#endif
}

void inox_debug_memory_reset(void) {
#ifdef INOX_DEBUG_MEMORY
  memset(&inox_debug_stats, 0, sizeof(inox_debug_stats));
  inox_debug_oom_enabled = false;
#endif
}

void inox_debug_memory_reset_peak(void) {
#ifdef INOX_DEBUG_MEMORY
  inox_debug_stats.peak_live_bytes = inox_debug_stats.live_bytes;
#endif
}

void inox_debug_memory_set_oom_after(size_t successful_allocations) {
#ifdef INOX_DEBUG_MEMORY
  inox_debug_stats.oom_fail_after = successful_allocations;
  inox_debug_oom_enabled = true;
#else
  (void)successful_allocations;
#endif
}

void inox_debug_memory_clear_oom(void) {
#ifdef INOX_DEBUG_MEMORY
  inox_debug_oom_enabled = false;
  inox_debug_stats.oom_fail_after = 0;
#endif
}

void inox_debug_memory_record_ref_created(inox_ref_kind kind) {
#ifdef INOX_DEBUG_MEMORY
  if ((size_t)kind < INOX_REF_KIND_COUNT) {
    inox_debug_stats.live_refs_by_kind[kind] += 1;

    if (kind == INOX_REF_FUNCTION) {
      inox_debug_stats.live_callbacks += 1;
    }
  }
#else
  (void)kind;
#endif
}

void inox_debug_memory_record_ref_destroyed(inox_ref_kind kind) {
#ifdef INOX_DEBUG_MEMORY
  if ((size_t)kind < INOX_REF_KIND_COUNT) {
    if (inox_debug_stats.live_refs_by_kind[kind] > 0) {
      inox_debug_stats.live_refs_by_kind[kind] -= 1;
    }

    if (kind == INOX_REF_FUNCTION && inox_debug_stats.live_callbacks > 0) {
      inox_debug_stats.live_callbacks -= 1;
    }
  }
#else
  (void)kind;
#endif
}

void inox_debug_memory_record_retain(void) {
#ifdef INOX_DEBUG_MEMORY
  inox_debug_stats.retain_count += 1;
#endif
}

void inox_debug_memory_record_release(void) {
#ifdef INOX_DEBUG_MEMORY
  inox_debug_stats.release_count += 1;
#endif
}

void inox_debug_memory_record_promise_created(void) {
#ifdef INOX_DEBUG_MEMORY
  inox_debug_stats.live_promises += 1;
#endif
}

void inox_debug_memory_record_promise_destroyed(void) {
#ifdef INOX_DEBUG_MEMORY
  if (inox_debug_stats.live_promises > 0) {
    inox_debug_stats.live_promises -= 1;
  }
#endif
}

void inox_debug_memory_record_weak_cell_created(void) {
#ifdef INOX_DEBUG_MEMORY
  inox_debug_stats.live_weak_cells += 1;
#endif
}

void inox_debug_memory_record_weak_cell_destroyed(void) {
#ifdef INOX_DEBUG_MEMORY
  if (inox_debug_stats.live_weak_cells > 0) {
    inox_debug_stats.live_weak_cells -= 1;
  }
#endif
}
