import type {
  CompilerLibraryPackageDescriptor,
  LibraryResultShapeFieldDescriptor
} from '../../../../compiler/extensions/types.ts'

const libraryId = 'global:debug'
const runtimeRequirement = libraryId
const memoryStatsTypeId = `${libraryId}#MemoryStats`

const memoryStatsFields: LibraryResultShapeFieldDescriptor[] = [
  memoryField('allocCount', 'alloc_count'),
  memoryField('reallocCount', 'realloc_count'),
  memoryField('freeCount', 'free_count'),
  memoryField('liveAllocCount', 'live_alloc_count'),
  memoryField('liveBytes', 'live_bytes'),
  memoryField('peakLiveBytes', 'peak_live_bytes'),
  memoryField('retainCount', 'retain_count'),
  memoryField('releaseCount', 'release_count'),
  memoryField('livePromises', 'live_promises'),
  memoryField('liveCallbacks', 'live_callbacks'),
  memoryField('liveWeakCells', 'live_weak_cells'),
  memoryField('oomFailureCount', 'oom_failure_count')
]

export const compilerLibraryPackage: CompilerLibraryPackageDescriptor = {
  id: libraryId,
  dependencies: [],
  runtimeInitializers: [
    {
      libraryId,
      initializerId: `${libraryId}#allocator`,
      runtimeRequirement,
      cType: 'inox::DebugMemoryRuntime',
      cName: 'debugMemoryRuntime',
      arguments: []
    }
  ],
  operations: [
    {
      libraryId,
      bindingId: 'global:inox.__debug.memory',
      operationId: `${libraryId}#memory`,
      kind: 'call',
      runtimeRequirements: [runtimeRequirement],
      cExpression: 'inox::debugMemory.snapshot',
      cArgumentKinds: [],
      resultTypeId: memoryStatsTypeId,
      resultShapeFields: memoryStatsFields,
      cppType: 'inox::DebugMemoryStats',
      valueType: 'object',
      nullable: false,
      owned: false
    }
  ],
  intrinsicBindings: [],
  runtimeRequirements: [
    {
      id: runtimeRequirement,
      dependencies: ['managed-values', 'objects'],
      cPreludeIncludes: ['inox/debug.h'],
      capabilities: []
    }
  ]
}

function memoryField(name: string, cMember: string): LibraryResultShapeFieldDescriptor {
  return {
    name,
    valueType: 'number',
    readonly: true,
    cMember,
    cppType: 'size_t'
  }
}
