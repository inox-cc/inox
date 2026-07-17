import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSource } from '../../compiler/core.ts'
import { discoverCompilerLibraries } from '../../scripts/lib/compiler-library-discovery.ts'
import { createCompilerLibrarySetFromDiscovered } from '../../scripts/lib/compiler-library-registry.ts'

test('global:promise владеет declarations, operations, async-result provider и runtime plan', async () => {
  const discovered = await discoverCompilerLibraries()
  const promisePackage = discovered.find((library) => library.id === 'global:promise')

  assert.ok(promisePackage)
  assert.equal(promisePackage.compilerEntrypoint, 'stdlib/global/promise/compiler/index.ts')
  assert.deepEqual(promisePackage.nativeSources, ['stdlib/global/promise/src/promise.cc'])
  assert.deepEqual(promisePackage.nativeIncludeDirs, ['stdlib/global/promise/include'])
  assert.match(promisePackage.declarationSource ?? '', /class Promise<T>/)

  const libraries = createCompilerLibrarySetFromDiscovered(discovered)
  const result = compileSource(
    `
      const resolved = Promise.resolve(1)
      const rejected = Promise.reject(2)
      const chained = resolved.then((value) => value + 1)
      const recovered = rejected.catch(() => 3)
      const constructed = new Promise<number>((resolve) => resolve(4))
    `,
    { libraries, target: 'cc' }
  )

  assert.equal(result.ast.body[0].init.libraryOperationId, 'global:promise#Promise.resolve')
  assert.equal(result.ast.body[1].init.libraryOperationId, 'global:promise#Promise.reject')
  assert.equal(result.ast.body[2].init.libraryOperationId, 'global:promise#Promise.then')
  assert.equal(result.ast.body[3].init.libraryOperationId, 'global:promise#Promise.catch')
  assert.equal(result.ast.body[4].init.libraryOperationId, 'global:promise#Promise.construct')
  assert.equal(result.ast.body[0].init.typeRef.typeId, 'global:promise#Promise')
  assert.equal(result.ast.body[2].init.typeRef.typeId, 'global:promise#Promise')
  assert.ok(libraries.intrinsicBindings.find((binding) => binding.role === 'async-result'))
  assert.ok(result.ir.runtimeRequirements.includes('global:promise#promise'))
  assert.match(result.code, /#include "inox\/promise\.h"/)
})
