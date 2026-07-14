#ifndef INOX_DEBUG_H
#define INOX_DEBUG_H

#include <stddef.h>
#include "inox/allocator.h"
#include "inox/value.h"

#ifdef __cplusplus
namespace inox {

struct DebugMemoryStats {
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
};

class DebugMemory {
public:
  inox_allocator allocator(inox_allocator* inner) const;
  DebugMemoryStats snapshot() const;
  void reset() const;
  void resetPeak() const;
  void setOomAfter(size_t successful_allocations) const;
  void clearOom() const;

  void recordRefCreated(inox_ref_kind kind) const;
  void recordRefDestroyed(inox_ref_kind kind) const;
  void recordRetain() const;
  void recordRelease() const;
  void recordPromiseCreated() const;
  void recordPromiseDestroyed() const;
  void recordWeakCellCreated() const;
  void recordWeakCellDestroyed() const;
};

extern DebugMemory debugMemory;

class DebugMemoryRuntime final {
public:
  DebugMemoryRuntime();
};

} // namespace inox
#endif

#endif
