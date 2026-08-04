import assert from 'node:assert/strict'
import { test } from 'node:test'

import { discoverCompilerLibraries } from '../../scripts/lib/compiler-library-discovery.ts'

const bufferOperationIds = [
  'node:buffer#Buffer.from',
  'node:buffer#Buffer.alloc',
  'node:buffer#Buffer.byteLength',
  'node:buffer#Buffer.compare',
  'node:buffer#Buffer.concat',
  'node:buffer#Buffer.isBuffer',
  'node:buffer#constants.MAX_LENGTH',
  'node:buffer#Buffer#read:length',
  'node:buffer#Buffer#index-read',
  'node:buffer#Buffer#index-write',
  'node:buffer#Buffer#compare',
  'node:buffer#Buffer#copy',
  'node:buffer#Buffer#equals',
  'node:buffer#Buffer#slice',
  'node:buffer#Buffer#subarray',
  'node:buffer#Buffer#toString'
]
const nominalResultIds = [
  'node:buffer#Buffer.from',
  'node:buffer#Buffer.alloc',
  'node:buffer#Buffer.concat',
  'node:buffer#Buffer#slice',
  'node:buffer#Buffer#subarray'
]
const numberResultIds = [
  'node:buffer#Buffer.byteLength',
  'node:buffer#Buffer.compare',
  'node:buffer#constants.MAX_LENGTH',
  'node:buffer#Buffer#read:length',
  'node:buffer#Buffer#index-write',
  'node:buffer#Buffer#compare',
  'node:buffer#Buffer#copy'
]
const booleanResultIds = [
  'node:buffer#Buffer.isBuffer',
  'node:buffer#Buffer#equals'
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
    } else if (operation.operationId === 'node:buffer#Buffer#index-read') {
      assert.deepEqual(operation.resultTypeRef, nullablePrimitiveTypeRef('number'))
    } else if (numberResultIds.includes(operation.operationId)) {
      assert.deepEqual(operation.resultTypeRef, primitiveTypeRef('number'))
    } else if (booleanResultIds.includes(operation.operationId)) {
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
  assert.equal(variants.length, 9)

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

function nullablePrimitiveTypeRef(name: 'boolean' | 'number' | 'string') {
  return {
    ...primitiveTypeRef(name),
    nullable: true
  }
}
