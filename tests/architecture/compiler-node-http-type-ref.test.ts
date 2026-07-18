import assert from 'node:assert/strict'
import { test } from 'node:test'

import type {
  LibraryOperationDescriptor,
  LibraryOperationVariantDescriptor,
  TypeRef
} from '../../compiler/extensions/types.ts'
import { discoverCompilerLibraries } from '../../scripts/lib/compiler-library-discovery.ts'

const operationIds = [
  'node:http#createServer',
  'node:http#Server.close',
  'node:http#Server.listen',
  'node:http#Server.on',
  'node:http#IncomingMessage.method',
  'node:http#IncomingMessage.url',
  'node:http#ServerResponse.statusCode.read',
  'node:http#ServerResponse.statusCode.write',
  'node:http#ServerResponse.end',
  'node:http#ServerResponse.setHeader',
  'node:http#ServerResponse.write',
  'node:http#ServerResponse.writeHead'
]

test('node:http operations describe results only through TypeRef', async () => {
  const discovered = await discoverCompilerLibraries()
  const http = discovered.find((library) => library.id === 'node:http')
  const operations = http?.compilerPackage?.operations ?? []

  assert.deepEqual(
    operations.map((operation) => operation.operationId),
    operationIds
  )

  assertResult(operations[0], nominalTypeRef('node:http#Server', 'value'))

  for (const operation of operations.slice(1, 4)) {
    assertResult(operation, nominalTypeRef('node:http#Server', 'borrowed'))
  }

  for (const operation of operations.slice(4, 6)) {
    assertResult(operation, primitiveTypeRef('string'), 'inox::String')
  }

  assertResult(operations[6], primitiveTypeRef('number'))
  assertResult(operations[7], primitiveTypeRef('number'), 'void')
  assertResult(operations[8], primitiveTypeRef('void'))
  assertResult(operations[9], primitiveTypeRef('void'))
  assertResult(operations[10], primitiveTypeRef('boolean'))
  assertResult(operations[11], nominalTypeRef('node:http#ServerResponse', 'borrowed'))

  const variants = operations.flatMap((operation) => operation.variants ?? [])

  for (const variant of variants) {
    assert.equal(variant.resultTypeRef, undefined)
    assertLegacyResultMetadataIsAbsent(variant)
  }
})

function assertResult(operation: LibraryOperationDescriptor, resultTypeRef: TypeRef, cppType?: string): void {
  assert.deepEqual(operation.resultTypeRef, resultTypeRef)
  assert.deepEqual(operation.cResultMapping, typeof cppType === 'string' ? { cppType, fields: [] } : undefined)
  assertLegacyResultMetadataIsAbsent(operation)
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

function primitiveTypeRef(name: 'boolean' | 'number' | 'string' | 'void'): TypeRef {
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
