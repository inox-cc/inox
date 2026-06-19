export type DebugMemoryStatsField = {
  name: string
  cField: string
}

export const debugMemoryStatsFields: DebugMemoryStatsField[] = [
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
]

export function debugRuntimeMethodNameFromPath(path: string[]): string | null {
  if (!isDebugRuntimeMethodPath(path)) {
    return null
  }

  return debugRuntimeMethodNameFromKnownPath(path)
}

export function debugRuntimeMethodNameFromKnownPath(_path: string[]): string {
  return 'memory'
}

export function isDebugRuntimeMethodPath(path: string[]): boolean {
  if (path.length !== 3 || (path[0] !== 'inox' && path[0] !== 'ccjs') || path[1] !== '__debug') {
    return false
  }

  return path[2] === 'memory'
}
