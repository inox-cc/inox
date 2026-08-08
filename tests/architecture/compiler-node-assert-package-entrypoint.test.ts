import assert from 'node:assert/strict'
import { test } from 'node:test'

import { discoverCompilerLibraries } from '../../scripts/lib/compiler-library-discovery.ts'

test('node:assert и node:assert/strict владеют strict API и native plan', async () => {
  const discovered = await discoverCompilerLibraries()
  const base = discovered.find((library) => library.id === 'node:assert')
  const strict = discovered.find((library) => library.id === 'node:assert/strict')

  assert.ok(base?.compilerPackage)
  assert.ok(strict?.compilerPackage)
  assert.equal(base.compilerEntrypoint, 'stdlib/node/assert/compiler/index.ts')
  assert.equal(strict.compilerEntrypoint, 'stdlib/node/assert/strict/compiler/index.ts')
  assert.deepEqual(base.compilerPackage.dependencies, [
    'global:binary',
    'global:collections',
    'global:error',
    'global:strings'
  ])
  assert.deepEqual(strict.compilerPackage.dependencies, ['node:assert'])
  assert.deepEqual(base.nativeSources, ['stdlib/node/assert/src/assert.cc'])
  assert.deepEqual(base.nativeIncludeDirs, ['stdlib/node/assert/include'])
  assert.deepEqual(strict.nativeSources, [])

  const direct = base.compilerPackage.operations.find((operation) => operation.operationId === 'node:assert#default')
  const deep = base.compilerPackage.operations.find(
    (operation) => operation.operationId === 'node:assert#deepStrictEqual'
  )
  const strictDeep = strict.compilerPackage.operations.find(
    (operation) => operation.operationId === 'node:assert/strict#deepStrictEqual'
  )

  assert.equal(direct?.bindingId, 'node:assert#module:node:assert:default')
  assert.equal(direct?.cExpression, 'nodeAssert')
  assert.equal(deep?.cExpression, 'nodeAssert.deepStrictEqual')
  assert.equal(strictDeep?.cExpression, 'nodeAssert.deepStrictEqual')
  assert.deepEqual(strictDeep?.runtimeRequirements, ['node:assert'])

  const runtime = base.compilerPackage.runtimeRequirements[0]

  assert.equal(runtime.id, 'node:assert')
  assert.deepEqual(runtime.cPreludeIncludes, ['inox/assert.h'])
  assert.deepEqual(runtime.capabilities, [])
})
