import assert from 'node:assert/strict'
import { test } from 'node:test'

import { discoverCompilerLibraries } from '../../scripts/lib/compiler-library-discovery.ts'

const bufferOperationIds = [
  'node:buffer#Buffer.from',
  'node:buffer#Buffer.alloc',
  'node:buffer#Buffer.isBuffer',
  'node:buffer#constants.MAX_LENGTH',
  'node:buffer#Buffer#read:length',
  'node:buffer#Buffer#index-read',
  'node:buffer#Buffer#index-write',
  'node:buffer#Buffer#slice',
  'node:buffer#Buffer#toString'
]
const nominalResultIds = [
  'node:buffer#Buffer.from',
  'node:buffer#Buffer.alloc',
  'node:buffer#Buffer#slice'
]
const numberResultIds = [
  'node:buffer#constants.MAX_LENGTH',
  'node:buffer#Buffer#read:length',
  'node:buffer#Buffer#index-read',
  'node:buffer#Buffer#index-write'
]

test('node:buffer operations describe results only through TypeRef', async () => {
  const discovered = await discoverCompilerLibraries()
  const buffer = discovered.find((library) => library.id === 'node:buffer')
  const operations = (buffer?.compilerPackage?.operations ?? []).filter((operation) => !operation.diagnosticCode)

  assert.deepEqual(
    operations.map((operation) => operation.operationId),
    bufferOperationIds
  )

  for (const operation of operations) {
    if (nominalResultIds.includes(operation.operationId)) {
      assert.deepEqual(operation.resultTypeRef, nominalBufferTypeRef())
    } else if (numberResultIds.includes(operation.operationId)) {
      assert.deepEqual(operation.resultTypeRef, primitiveTypeRef('number'))
    } else if (operation.operationId === 'node:buffer#Buffer.isBuffer') {
      assert.deepEqual(operation.resultTypeRef, primitiveTypeRef('boolean'))
    } else {
      assert.equal(operation.operationId, 'node:buffer#Buffer#toString')
      assert.deepEqual(operation.resultTypeRef, primitiveTypeRef('string'))
      assert.deepEqual(operation.cResultMapping, {
        cppType: 'inox::String',
        fields: []
      })
    }

  }

  const variants = operations.flatMap((operation) => operation.variants ?? [])
  assert.equal(variants.length, 4)

  for (const variant of variants) {
    assert.equal(variant.resultTypeRef, undefined)
  }
})

function nominalBufferTypeRef() {
  return {
    kind: 'nominal',
    typeId: 'node:buffer#Buffer',
    args: [],
    nullable: false,
    ownership: 'value',
    traits: []
  }
}

function primitiveTypeRef(name: 'boolean' | 'number' | 'string') {
  return {
    kind: 'primitive',
    name,
    nullable: false,
    ownership: 'value',
    traits: []
  }
}
