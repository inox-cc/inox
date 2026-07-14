import assert from 'node:assert/strict'
import { test } from 'node:test'

import { discoverCompilerLibraries } from '../../scripts/lib/compiler-library-discovery.ts'

test('global:crypto result uses only a cross-package nominal TypeRef', async () => {
  const discovered = await discoverCompilerLibraries()
  const globalCrypto = discovered.find((library) => library.id === 'global:crypto')
  const operation = globalCrypto?.compilerPackage?.operations.find(
    (item) => item.operationId === 'global:crypto#getRandomValues'
  )

  assert.deepEqual(operation?.resultTypeRef, {
    kind: 'nominal',
    typeId: 'global:binary#Uint8Array',
    args: [],
    nullable: false,
    ownership: 'value',
    traits: []
  })
  assert.equal(operation?.resultTypeId, undefined)
  assert.equal(operation?.cppType, undefined)
  assert.equal(operation?.valueType, undefined)
  assert.equal(operation?.nullable, undefined)
  assert.equal(operation?.owned, undefined)
})
