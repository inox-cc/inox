import assert from 'node:assert/strict'
import { test } from 'node:test'

import type {
  LibraryOperationDescriptor,
  LibraryOperationVariantDescriptor,
  TypeRef
} from '../../compiler/extensions/types.ts'
import { discoverCompilerLibraries } from '../../scripts/lib/compiler-library-discovery.ts'

const expectedResults = [
  ['node:dgram#createSocket', nominalTypeRef('node:dgram#Socket', 'value')],
  ['node:dgram#Socket.address', nominalTypeRef('node:dgram#AddressInfo', 'value')],
  ['node:dgram#Socket.bind', socketTypeRef()],
  ['node:dgram#Socket.close', socketTypeRef()],
  ['node:dgram#Socket.connect', socketTypeRef()],
  ['node:dgram#Socket.disconnect', socketTypeRef()],
  ['node:dgram#Socket.getRecvBufferSize', primitiveTypeRef('number')],
  ['node:dgram#Socket.getSendBufferSize', primitiveTypeRef('number')],
  ['node:dgram#Socket.on', socketTypeRef()],
  ['node:dgram#Socket.ref', socketTypeRef()],
  ['node:dgram#Socket.remoteAddress', nominalTypeRef('node:dgram#AddressInfo', 'value')],
  ['node:dgram#Socket.send', primitiveTypeRef('void')],
  ['node:dgram#Socket.setBroadcast', socketTypeRef()],
  ['node:dgram#Socket.setRecvBufferSize', socketTypeRef()],
  ['node:dgram#Socket.setSendBufferSize', socketTypeRef()],
  ['node:dgram#Socket.setTTL', socketTypeRef()],
  ['node:dgram#Socket.unref', socketTypeRef()]
] as const

test('node:dgram operations describe results only through TypeRef', async () => {
  const discovered = await discoverCompilerLibraries()
  const dgram = discovered.find((library) => library.id === 'node:dgram')
  const operations = dgram?.compilerPackage?.operations ?? []

  assert.deepEqual(
    operations.map((operation) => operation.operationId),
    expectedResults.map(([operationId]) => operationId)
  )

  for (let index = 0; index < operations.length; index = index + 1) {
    assert.deepEqual(operations[index].resultTypeRef, expectedResults[index][1])
    assert.equal(operations[index].cResultMapping, undefined)
    assertLegacyResultMetadataIsAbsent(operations[index])
  }

  const variants = operations.flatMap((operation) => operation.variants ?? [])

  for (const variant of variants) {
    assert.equal(variant.resultTypeRef, undefined)
    assert.equal(variant.cResultMapping, undefined)
    assertLegacyResultMetadataIsAbsent(variant)
  }
})

function socketTypeRef(): TypeRef {
  return nominalTypeRef('node:dgram#Socket', 'borrowed')
}

function nominalTypeRef(typeId: string, ownership: 'borrowed' | 'value'): TypeRef {
  return {
    kind: 'nominal',
    typeId,
    args: [],
    nullable: false,
    ownership,
    traits: []
  }
}

function primitiveTypeRef(name: 'number' | 'void'): TypeRef {
  return {
    kind: 'primitive',
    name,
    nullable: false,
    ownership: 'value',
    traits: []
  }
}

function assertLegacyResultMetadataIsAbsent(
  value: LibraryOperationDescriptor | LibraryOperationVariantDescriptor
): void {
  assert.equal(value.resultTypeId, undefined)
  assert.equal(value.resultShapeFields, undefined)
  assert.equal(value.resultArrayElementType, undefined)
  assert.equal(value.resultArrayElementTypeId, undefined)
  assert.equal(value.cppType, undefined)
  assert.equal(value.valueType, undefined)
  assert.equal(Object.prototype.hasOwnProperty.call(value, 'promiseValueType'), false)
  assert.equal(Object.prototype.hasOwnProperty.call(value, 'promiseRejectionValueType'), false)
  assert.equal(value.nullable, undefined)
  assert.equal(value.owned, undefined)
}
