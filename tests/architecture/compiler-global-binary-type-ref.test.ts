import assert from 'node:assert/strict'
import { test } from 'node:test'

import { discoverCompilerLibraries } from '../../scripts/lib/compiler-library-discovery.ts'

const nominalUint8Array = {
  kind: 'nominal',
  typeId: 'global:binary#Uint8Array',
  args: [],
  nullable: false,
  ownership: 'value',
  traits: []
}

test('global:binary operations describe results only through TypeRef', async () => {
  const discovered = await discoverCompilerLibraries()
  const binary = discovered.find((library) => library.id === 'global:binary')
  const operations = binary?.compilerPackage?.operations ?? []

  assert.deepEqual(
    operations.map((operation) => operation.operationId),
    [
      'global:binary#Uint8Array#construct',
      'global:binary#Uint8Array#read:length',
      'global:binary#Uint8Array#index-read',
      'global:binary#Uint8Array#index-write',
      'global:binary#Uint8Array#at',
      'global:binary#Uint8Array#fill',
      'global:binary#Uint8Array#set',
      'global:binary#Uint8Array#slice',
      'global:binary#Uint8Array#subarray',
      'global:binary#Uint8Array#toString'
    ]
  )

  assert.deepEqual(operations[0]?.resultTypeRef, nominalUint8Array)
  assert.deepEqual(operations[1]?.resultTypeRef, primitiveTypeRef('number'))
  assert.deepEqual(operations[2]?.resultTypeRef, nullablePrimitiveTypeRef('number'))
  assert.deepEqual(operations[3]?.resultTypeRef, primitiveTypeRef('number'))
  assert.deepEqual(operations[4]?.resultTypeRef, nullablePrimitiveTypeRef('number'))
  assert.deepEqual(operations[5]?.resultTypeRef, nominalUint8Array)
  assert.deepEqual(operations[6]?.resultTypeRef, primitiveTypeRef('void'))
  assert.deepEqual(operations[7]?.resultTypeRef, nominalUint8Array)
  assert.deepEqual(operations[8]?.resultTypeRef, nominalUint8Array)
  assert.deepEqual(operations[9]?.resultTypeRef, primitiveTypeRef('string'))
  assert.deepEqual(operations[9]?.cResultMapping, {
    cppType: 'inox::String',
    fields: []
  })

  const variants = operations[0]?.variants ?? []
  assert.equal(variants.length, 2)

  for (const variant of variants) {
    assert.equal(variant.resultTypeRef, undefined)
  }
})

function primitiveTypeRef(name: 'number' | 'string' | 'void') {
  return {
    kind: 'primitive',
    name,
    nullable: false,
    ownership: 'value',
    traits: []
  }
}

function nullablePrimitiveTypeRef(name: 'number' | 'string' | 'void') {
  return {
    ...primitiveTypeRef(name),
    nullable: true
  }
}
