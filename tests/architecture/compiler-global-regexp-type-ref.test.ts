import assert from 'node:assert/strict'
import { test } from 'node:test'

import { discoverCompilerLibraries } from '../../scripts/lib/compiler-library-discovery.ts'

test('global:regexp operations describe results only through TypeRef', async () => {
  const discovered = await discoverCompilerLibraries()
  const regexp = discovered.find((library) => library.id === 'global:regexp')
  const literal = regexp?.compilerPackage?.operations.find(
    (operation) => operation.operationId === 'global:regexp#literal.construct'
  )
  const matches = regexp?.compilerPackage?.operations.find(
    (operation) => operation.operationId === 'global:regexp#test'
  )

  assert.deepEqual(literal?.resultTypeRef, {
    kind: 'nominal',
    typeId: 'global:regexp#RegExp',
    args: [],
    nullable: false,
    ownership: 'value',
    traits: []
  })
  assert.deepEqual(matches?.resultTypeRef, {
    kind: 'primitive',
    name: 'boolean',
    nullable: false,
    ownership: 'value',
    traits: []
  })

  for (const operation of [literal, matches]) {
    assert.ok(operation)
  }
})
