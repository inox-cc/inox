import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSource } from '../../compiler/core.ts'
import { CompileError } from '../../compiler/diagnostics.ts'
import { discoverCompilerLibraries } from '../../scripts/lib/compiler-library-discovery.ts'
import { createCompilerLibrarySetFromDiscovered } from '../../scripts/lib/compiler-library-registry.ts'

test('global:collections владеет Map declarations, operations, iteration и runtime plan', async () => {
  const discovered = await discoverCompilerLibraries()
  const collections = discovered.find((library) => library.id === 'global:collections')

  assert.ok(collections)
  assert.equal(collections.compilerEntrypoint, 'stdlib/global/collections/compiler/index.ts')
  assert.deepEqual(collections.nativeSources, ['stdlib/global/collections/src/collections.cc'])
  assert.deepEqual(collections.nativeIncludeDirs, ['stdlib/global/collections/include'])
  assert.match(collections.declarationSource ?? '', /class Map<K, V>/)

  const libraries = createCompilerLibrarySetFromDiscovered(discovered)
  const result = compileSource(
    `
      const values = new Map<string, number>([['a', 1]])
      values.set('b', 2)
      const present = values.has('a')
      const found = values.get('a')
      const removed = values.delete('b')
      const size = values.size
      for (const entry of values) {}
      values.clear()
      const flags = new Map<string, boolean>()
      const optionalFlag = flags.get('enabled')
      if (optionalFlag) {}
    `,
    { libraries, target: 'cc' }
  )

  assert.equal(result.ir.body[0].init.libraryOperationId, 'global:collections#Map.construct')
  assert.equal(result.ir.body[0].init.typeRef?.typeId, 'global:collections#Map')
  assert.equal(result.ir.body[1].expression.libraryOperationId, 'global:collections#Map.set')
  assert.equal(result.ir.body[2].init.libraryOperationId, 'global:collections#Map.has')
  assert.equal(result.ir.body[2].init.libraryCFailureMode, undefined)
  assert.equal(result.ir.body[2].init.libraryCPreservesPendingException, true)
  assert.equal(result.ir.body[3].init.libraryOperationId, 'global:collections#Map.get')
  assert.equal(result.ir.body[4].init.libraryOperationId, 'global:collections#Map.delete')
  assert.equal(result.ir.body[5].init.libraryOperationId, 'global:collections#Map.size')
  assert.equal(result.ir.body[5].init.libraryCFailureMode, undefined)
  assert.equal(result.ir.body[6].libraryCIteratorMethod, 'entries')
  assert.equal(result.ir.body[7].expression.libraryOperationId, 'global:collections#Map.clear')
  assert.match(result.code, /Map::from\(/)
  assert.match(result.code, /\.entries\(\)/)
  assert.doesNotMatch(result.code, /MapStorage|Map::create|deleteKey/)
  assert.doesNotMatch(result.code, /inox_nullable_value_\d+ = inox_library_result_\d+\.as\.boolean/)
  assert.throws(
    () => compileSource("const values = new Map<string, number>()\nvalues.set(1, 2)\n", { libraries }),
    (error: unknown) => error instanceof CompileError && error.diagnostics[0].code === 'INOX_TYPE_MISMATCH'
  )
})
