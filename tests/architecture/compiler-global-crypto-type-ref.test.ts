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
})
