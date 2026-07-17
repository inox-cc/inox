import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSource } from '../../compiler/core.ts'
import { discoverCompilerLibraries } from '../../scripts/lib/compiler-library-discovery.ts'
import { createCompilerLibrarySetFromDiscovered } from '../../scripts/lib/compiler-library-registry.ts'

test('global:object владеет Object declarations, operations и runtime plan', async () => {
  const discovered = await discoverCompilerLibraries()
  const objectPackage = discovered.find((library) => library.id === 'global:object')

  assert.ok(objectPackage)
  assert.equal(objectPackage.compilerEntrypoint, 'stdlib/global/object/compiler/index.ts')
  assert.deepEqual(objectPackage.nativeSources, ['stdlib/global/object/src/object.cc'])
  assert.deepEqual(objectPackage.nativeIncludeDirs, ['stdlib/global/object/include'])
  assert.match(objectPackage.declarationSource ?? '', /class Object/)

  const result = compileSource(
    `
      const value = { name: 'Ada', score: 7 }
      const keys = Object.keys(value)
      const values = Object.values(value)
      const entries = Object.entries(value)
    `,
    { libraries: createCompilerLibrarySetFromDiscovered(discovered), target: 'cc' }
  )

  assert.equal(result.ast.body[1].init.libraryOperationId, 'global:object#Object.keys')
  assert.equal(result.ast.body[2].init.libraryOperationId, 'global:object#Object.values')
  assert.equal(result.ast.body[3].init.libraryOperationId, 'global:object#Object.entries')
  assert.ok(result.ir.runtimeRequirements.includes('global:object#object'))
  assert.match(result.code, /#include "inox\/object_global\.h"/)
  assert.match(result.code, /Object\.keys\(inox::Value\(value\)\)/)
  assert.match(result.code, /Object\.values\(inox::Value\(value\)\)/)
  assert.match(result.code, /Object\.entries\(inox::Value\(value\)\)/)
})
