import assert from 'node:assert/strict'
import { test } from 'node:test'

import { discoverCompilerLibraries } from '../../scripts/lib/compiler-library-discovery.ts'

const fieldMappings = [
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

test('global:debug memory result separates TypeRef from C++ mapping', async () => {
  const discovered = await discoverCompilerLibraries()
  const debug = discovered.find((library) => library.id === 'global:debug')
  const operation = debug?.compilerPackage?.operations[0]

  assert.deepEqual(operation?.resultTypeRef, {
    kind: 'object',
    fields: fieldMappings.map((field) => ({
      name: field.name,
      typeRef: {
        kind: 'primitive',
        name: 'number',
        nullable: false,
        ownership: 'value',
        traits: []
      },
      readonly: true
    })),
    nullable: false,
    ownership: 'value',
    traits: []
  })
  assert.deepEqual(operation?.cResultMapping, {
    cppType: 'inox::DebugMemoryStats',
    fields: fieldMappings.map((field) => ({
      name: field.name,
      cMember: field.cMember,
      cppType: 'size_t'
    }))
  })
  assert.equal(operation?.resultTypeId, undefined)
  assert.equal(operation?.resultShapeFields, undefined)
  assert.equal(operation?.cppType, undefined)
  assert.equal(operation?.valueType, undefined)
  assert.equal(operation?.nullable, undefined)
  assert.equal(operation?.owned, undefined)
})
