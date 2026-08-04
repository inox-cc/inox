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
  'node:http#IncomingMessage.headers',
  'node:http#IncomingMessage.httpVersion',
  'node:http#IncomingMessage.method',
  'node:http#IncomingMessage.socket',
  'node:http#IncomingMessage.url',
  'node:http#ServerResponse.headersSent',
  'node:http#ServerResponse.statusCode.read',
  'node:http#ServerResponse.statusCode.write',
  'node:http#ServerResponse.writableEnded',
  'node:http#ServerResponse.end',
  'node:http#ServerResponse.getHeader',
  'node:http#ServerResponse.getHeaderNames',
  'node:http#ServerResponse.hasHeader',
  'node:http#ServerResponse.removeHeader',
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

  assertResult(operations[4], {
    kind: 'object',
    fields: [],
    dynamic: true,
    dynamicField: primitiveTypeRef('string', true),
    nullable: false,
    ownership: 'value',
    traits: []
  }, 'inox::Value')

  for (const operation of [operations[5], operations[6], operations[8]]) {
    assertResult(operation, primitiveTypeRef('string'), 'inox::String')
  }

  assertResult(operations[7], nominalTypeRef('node:net#Socket', 'value'))
  assertResult(operations[9], primitiveTypeRef('boolean'))
  assertResult(operations[10], primitiveTypeRef('number'))
  assertResult(operations[11], primitiveTypeRef('number'), 'void')
  assertResult(operations[12], primitiveTypeRef('boolean'))
  assertResult(operations[13], primitiveTypeRef('void'))
  assertResult(operations[14], primitiveTypeRef('string', true), 'inox::Value')
  assertResult(operations[15], arrayTypeRef(primitiveTypeRef('string')))
  assertResult(operations[16], primitiveTypeRef('boolean'))
  assertResult(operations[17], primitiveTypeRef('void'))
  assertResult(operations[18], nominalTypeRef('node:http#ServerResponse', 'borrowed'))
  assertResult(operations[19], primitiveTypeRef('boolean'))
  assertResult(operations[20], nominalTypeRef('node:http#ServerResponse', 'borrowed'))

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

function primitiveTypeRef(name: 'boolean' | 'number' | 'string' | 'void', nullable = false): TypeRef {
  return {
    kind: 'primitive',
    name,
    nullable,
    ownership: 'value',
    traits: []
  }
}

function arrayTypeRef(elementType: TypeRef): TypeRef {
  return {
    kind: 'nominal',
    typeId: 'global:collections#Array',
    args: [elementType],
    nullable: false,
    ownership: 'value',
    traits: [{ traitId: 'iterable', args: [elementType] }]
  }
}

function assertLegacyResultMetadataIsAbsent(
  value: LibraryOperationDescriptor | LibraryOperationVariantDescriptor
): void {
  assert.equal(Object.prototype.hasOwnProperty.call(value, 'promiseValueType'), false)
  assert.equal(Object.prototype.hasOwnProperty.call(value, 'promiseRejectionValueType'), false)
}
