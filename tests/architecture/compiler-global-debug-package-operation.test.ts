import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSource } from '../../compiler/core.ts'
import { discoverCompilerLibraries } from '../../scripts/lib/compiler-library-discovery.ts'
import { createCompilerLibrarySetFromDiscovered } from '../../scripts/lib/compiler-library-registry.ts'

test('global:debug владеет namespace, memory operation и allocator initializer', async () => {
  const discovered = await discoverCompilerLibraries()
  const debug = discovered.find((library) => library.id === 'global:debug')

  assert.ok(debug)
  assert.equal(debug.compilerEntrypoint, 'stdlib/global/debug/compiler/index.ts')
  assert.deepEqual(debug.nativeSources, ['stdlib/global/debug/src/debug.cc'])
  assert.deepEqual(debug.nativeIncludeDirs, ['stdlib/global/debug/include'])
  assert.match(debug.declarationSource ?? '', /namespace inox/)
  assert.equal(debug.compilerPackage?.operations.length, 1)
  assert.equal(debug.compilerPackage?.runtimeInitializers?.length, 1)

  const libraries = createCompilerLibrarySetFromDiscovered(discovered)
  const result = compileSource(
    `
    const stats = inox.__debug.memory()
    const count = stats.allocCount
  `,
    { libraries }
  )
  const stats = result.ir.body[0].init

  assert.equal(stats.libraryOperationId, 'global:debug#memory')
  assert.equal(stats.typeRef?.kind, 'object')
  assert.equal(stats.shape?.libraryTypeId, undefined)
  assert.equal(stats.shape?.libraryCppType, 'inox::DebugMemoryStats')
  assert.equal(stats.shape?.fields[0].libraryCMember, 'alloc_count')
  assert.match(result.code, /#include "inox\/debug\.h"/)
  assert.match(result.code, /inline inox::DebugMemoryRuntime debugMemoryRuntime\{\};/)
  assert.match(result.code, /inox::debugMemory\.snapshot\(\)/)
  assert.match(result.code, /stats\.alloc_count/)
  assert.doesNotMatch(result.code, /inox_ensure_debug_memory_allocator/)
})
