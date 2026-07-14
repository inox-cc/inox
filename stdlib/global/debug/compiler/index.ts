import type {
  CompilerLibraryPackageDescriptor,
  LibraryCResultFieldMappingDescriptor,
  ObjectTypeRef,
  ObjectTypeRefField,
  PrimitiveTypeRef
} from '../../../../compiler/extensions/types.ts'

const libraryId = 'global:debug'
const runtimeRequirement = libraryId
const memoryStatsFieldDefinitions = [
  { name: 'allocCount', cMember: 'alloc_count' },
  { name: 'reallocCount', cMember: 'realloc_count' },
  { name: 'freeCount', cMember: 'free_count' },
  { name: 'liveAllocCount', cMember: 'live_alloc_count' },
  { name: 'liveBytes', cMember: 'live_bytes' },
  { name: 'peakLiveBytes', cMember: 'peak_live_bytes' },
  { name: 'retainCount', cMember: 'retain_count' },
  { name: 'releaseCount', cMember: 'release_count' },
  { name: 'livePromises', cMember: 'live_promises' },
  { name: 'liveCallbacks', cMember: 'live_callbacks' },
  { name: 'liveWeakCells', cMember: 'live_weak_cells' },
  { name: 'oomFailureCount', cMember: 'oom_failure_count' }
]
const numberTypeRef: PrimitiveTypeRef = {
  kind: 'primitive',
  name: 'number',
  nullable: false,
  ownership: 'value',
  traits: []
}
const memoryStatsTypeFields: ObjectTypeRefField[] = []
const memoryStatsCFields: LibraryCResultFieldMappingDescriptor[] = []

for (let index = 0; index < memoryStatsFieldDefinitions.length; index = index + 1) {
  const field = memoryStatsFieldDefinitions[index]
  memoryStatsTypeFields.push({
    name: field.name,
    typeRef: numberTypeRef,
    readonly: true
  })
  memoryStatsCFields.push({
    name: field.name,
    cMember: field.cMember,
    cppType: 'size_t'
  })
}

const memoryStatsTypeRef: ObjectTypeRef = {
  kind: 'object',
  fields: memoryStatsTypeFields,
  nullable: false,
  ownership: 'value',
  traits: []
}

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
      resultTypeRef: memoryStatsTypeRef,
      cResultMapping: {
        cppType: 'inox::DebugMemoryStats',
        fields: memoryStatsCFields
      }
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
