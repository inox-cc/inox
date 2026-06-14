export type DebugRuntimeMethod = 'memory'

export const debugMemoryStatsFields = [
  {
    name: 'allocCount',
    cField: 'alloc_count'
  },
  {
    name: 'reallocCount',
    cField: 'realloc_count'
  },
  {
    name: 'freeCount',
    cField: 'free_count'
  },
  {
    name: 'liveAllocCount',
    cField: 'live_alloc_count'
  },
  {
    name: 'liveBytes',
    cField: 'live_bytes'
  },
  {
    name: 'peakLiveBytes',
    cField: 'peak_live_bytes'
  },
  {
    name: 'retainCount',
    cField: 'retain_count'
  },
  {
    name: 'releaseCount',
    cField: 'release_count'
  },
  {
    name: 'livePromises',
    cField: 'live_promises'
  },
  {
    name: 'liveCallbacks',
    cField: 'live_callbacks'
  },
  {
    name: 'liveWeakCells',
    cField: 'live_weak_cells'
  },
  {
    name: 'oomFailureCount',
    cField: 'oom_failure_count'
  }
] as const

export function debugRuntimeMethodNameFromPath(path: readonly string[] | null | undefined): DebugRuntimeMethod | null {
  if (path == null || path.length !== 3 || path[0] !== 'ccjs' || path[1] !== '__debug') {
    return null
  }

  return path[2] === 'memory' ? 'memory' : null
}
