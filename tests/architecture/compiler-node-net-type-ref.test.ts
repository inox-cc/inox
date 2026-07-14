import assert from 'node:assert/strict'
import { test } from 'node:test'

import type {
  LibraryOperationDescriptor,
  LibraryOperationVariantDescriptor,
  TypeRef
} from '../../compiler/extensions/types.ts'
import { discoverCompilerLibraries } from '../../scripts/lib/compiler-library-discovery.ts'

const expectedResults = [
  ['node:net#createServer', nominalTypeRef('node:net#Server', 'value')],
  ['node:net#connect', nominalTypeRef('node:net#Socket', 'value')],
  ['node:net#Server.address', nominalTypeRef('node:net#AddressInfo', 'value')],
  ['node:net#Server.close', serverTypeRef()],
  ['node:net#Server.listen', serverTypeRef()],
  ['node:net#Server.on', serverTypeRef()],
  ['node:net#Socket.address', nominalTypeRef('node:net#AddressInfo', 'value')],
  ['node:net#Socket.bytesRead', primitiveTypeRef('number')],
  ['node:net#Socket.bytesWritten', primitiveTypeRef('number')],
  ['node:net#Socket.destroy', socketTypeRef()],
  ['node:net#Socket.end', socketTypeRef()],
  ['node:net#Socket.localAddress', primitiveTypeRef('string')],
  ['node:net#Socket.localPort', primitiveTypeRef('number')],
  ['node:net#Socket.on', socketTypeRef()],
  ['node:net#Socket.ref', socketTypeRef()],
  ['node:net#Socket.remoteAddress', primitiveTypeRef('string')],
  ['node:net#Socket.remotePort', primitiveTypeRef('number')],
  ['node:net#Socket.setEncoding', socketTypeRef()],
  ['node:net#Socket.setKeepAlive', socketTypeRef()],
  ['node:net#Socket.setNoDelay', socketTypeRef()],
  ['node:net#Socket.unref', socketTypeRef()],
  ['node:net#Socket.write', primitiveTypeRef('boolean')]
] as const

test('node:net operations describe results only through TypeRef', async () => {
  const discovered = await discoverCompilerLibraries()
  const netPackage = discovered.find((library) => library.id === 'node:net')
  const operations = netPackage?.compilerPackage?.operations ?? []

  assert.deepEqual(
    operations.map((operation) => operation.operationId),
    expectedResults.map(([operationId]) => operationId)
  )

  for (let index = 0; index < operations.length; index = index + 1) {
    const operation = operations[index]

    assert.deepEqual(operation.resultTypeRef, expectedResults[index][1])
    if (
      operation.operationId === 'node:net#Socket.localAddress' ||
      operation.operationId === 'node:net#Socket.remoteAddress'
    ) {
      assert.deepEqual(operation.cResultMapping, { cppType: 'inox::String', fields: [] })
    } else {
      assert.equal(operation.cResultMapping, undefined)
    }
    assertLegacyResultMetadataIsAbsent(operation)
  }

  const variants = operations.flatMap((operation) => operation.variants ?? [])

  for (const variant of variants) {
    assert.equal(variant.resultTypeRef, undefined)
    assert.equal(variant.cResultMapping, undefined)
    assertLegacyResultMetadataIsAbsent(variant)
  }
})

function serverTypeRef(): TypeRef {
  return nominalTypeRef('node:net#Server', 'borrowed')
}

function socketTypeRef(): TypeRef {
  return nominalTypeRef('node:net#Socket', 'borrowed')
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

function primitiveTypeRef(name: 'boolean' | 'number' | 'string'): TypeRef {
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
  assert.equal(value.promiseValueType, undefined)
  assert.equal(value.promiseRejectionValueType, undefined)
  assert.equal(value.nullable, undefined)
  assert.equal(value.owned, undefined)
}
