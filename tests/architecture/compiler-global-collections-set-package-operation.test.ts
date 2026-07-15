import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSource } from '../../compiler/core.ts'
import { CompileError } from '../../compiler/diagnostics.ts'
import { discoverCompilerLibraries } from '../../scripts/lib/compiler-library-discovery.ts'
import { createCompilerLibrarySetFromDiscovered } from '../../scripts/lib/compiler-library-registry.ts'

test('global:collections владеет Set declarations, operations, iteration и runtime plan', async () => {
  const discovered = await discoverCompilerLibraries()
  const collections = discovered.find((library) => library.id === 'global:collections')

  assert.ok(collections)
  assert.equal(collections.compilerEntrypoint, 'stdlib/global/collections/compiler/index.ts')
  assert.deepEqual(collections.nativeSources, ['stdlib/global/collections/src/collections.cc'])
  assert.deepEqual(collections.nativeIncludeDirs, ['stdlib/global/collections/include'])
  assert.match(collections.declarationSource ?? '', /class Set<T>/)

  const libraries = createCompilerLibrarySetFromDiscovered(discovered)
  const result = compileSource(
    `
      const values = new Set<string>(['a'])
      values.add('b')
      const present = values.has('a')
      const removed = values.delete('b')
      const size = values.size
      for (const value of values) {}
      values.clear()
    `,
    { libraries, target: 'cc' }
  )

  assert.equal(result.ir.body[0].init.libraryOperationId, 'global:collections#Set.construct')
  assert.equal(result.ir.body[0].init.typeRef?.typeId, 'global:collections#Set')
  assert.equal(result.ir.body[1].expression.libraryOperationId, 'global:collections#Set.add')
  assert.equal(result.ir.body[2].init.libraryOperationId, 'global:collections#Set.has')
  assert.equal(result.ir.body[3].init.libraryOperationId, 'global:collections#Set.delete')
  assert.equal(result.ir.body[4].init.libraryOperationId, 'global:collections#Set.size')
  assert.equal(result.ir.body[5].libraryCIteratorMethod, 'values')
  assert.equal(result.ir.body[6].expression.libraryOperationId, 'global:collections#Set.clear')
  assert.match(result.code, /Set::from\(/)
  assert.match(result.code, /\.values\(\)/)
  assert.doesNotMatch(result.code, /SetStorage|Set::create|deleteValue/)
  assert.throws(
    () => compileSource('const values = new Set<string>()\nvalues.add(1)\n', { libraries }),
    (error: unknown) => error instanceof CompileError && error.diagnostics[0].code === 'INOX_TYPE_MISMATCH'
  )
})
