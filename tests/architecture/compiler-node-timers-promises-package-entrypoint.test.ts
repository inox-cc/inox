import assert from 'node:assert/strict'
import { test } from 'node:test'

import { discoverCompilerLibraries } from '../../scripts/lib/compiler-library-discovery.ts'

test('node:timers/promises целиком описывает API и native plan в package entrypoint', async () => {
  const discovered = await discoverCompilerLibraries()
  const library = discovered.find((item) => item.id === 'node:timers/promises')

  assert.ok(library?.compilerPackage)
  assert.equal(library.compilerEntrypoint, 'stdlib/node/timers/promises/compiler/index.ts')
  assert.deepEqual(library.compilerPackage.dependencies, ['global:promise'])
  assert.deepEqual(library.nativeSources, ['stdlib/node/timers/promises/src/promises.cc'])
  assert.deepEqual(library.nativeIncludeDirs, ['stdlib/node/timers/promises/include'])
  assert.deepEqual(library.compilerPackage.operations.map((operation) => operation.operationId).sort(), [
    'node:timers/promises#setImmediate',
    'node:timers/promises#setTimeout'
  ])

  for (const operation of library.compilerPackage.operations) {
    assert.deepEqual(operation.runtimeRequirements, ['node:timers/promises'])
    assert.equal(operation.cFailureMode, null)
    assert.equal(operation.resultTypeRef?.kind, 'nominal')

    if (operation.resultTypeRef?.kind === 'nominal') {
      assert.equal(operation.resultTypeRef.typeId, 'global:promise#Promise')
      assert.equal(operation.resultTypeRef.traits[0]?.traitId, 'awaitable')
    }
  }

  assert.deepEqual(library.compilerPackage.runtimeRequirements, [
    {
      id: 'node:timers/promises',
      dependencies: ['global:promise#promise'],
      cPreludeIncludes: ['inox/timers_promises.h'],
      capabilities: ['timers']
    }
  ])
})
