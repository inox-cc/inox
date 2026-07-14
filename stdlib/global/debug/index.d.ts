export {};

declare global {
  interface InoxDebugMemoryStats {
    readonly allocCount: number;
    readonly reallocCount: number;
    readonly freeCount: number;
    readonly liveAllocCount: number;
    readonly liveBytes: number;
    readonly peakLiveBytes: number;
    readonly retainCount: number;
    readonly releaseCount: number;
    readonly livePromises: number;
    readonly liveCallbacks: number;
    readonly liveWeakCells: number;
    readonly oomFailureCount: number;
  }

  namespace inox {
    namespace __debug {
      function memory(): InoxDebugMemoryStats;
    }
  }
}
