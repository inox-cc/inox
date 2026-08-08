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
  'node:http#get',
  'node:http#request',
  'node:http#Server.address',
  'node:http#Server.close',
  'node:http#Server.listen',
  'node:http#Server.on',
  'node:http#IncomingMessage.headers',
  'node:http#IncomingMessage.httpVersion',
  'node:http#IncomingMessage.method',
  'node:http#IncomingMessage.socket',
  'node:http#IncomingMessage.statusCode',
  'node:http#IncomingMessage.statusMessage',
  'node:http#IncomingMessage.url',
  'node:http#IncomingMessage.isPaused',
  'node:http#IncomingMessage.on',
  'node:http#IncomingMessage.pause',
  'node:http#IncomingMessage.resume',
  'node:http#IncomingMessage.setEncoding',
  'node:http#ClientRequest.headersSent',
  'node:http#ClientRequest.writableEnded',
  'node:http#ClientRequest.destroy',
  'node:http#ClientRequest.end',
  'node:http#ClientRequest.getHeader',
  'node:http#ClientRequest.getHeaderNames',
  'node:http#ClientRequest.hasHeader',
  'node:http#ClientRequest.on',
  'node:http#ClientRequest.removeHeader',
  'node:http#ClientRequest.setHeader',
  'node:http#ClientRequest.write',
  'node:http#ServerResponse.headersSent',
  'node:http#ServerResponse.statusCode.read',
  'node:http#ServerResponse.statusCode.write',
  'node:http#ServerResponse.writableEnded',
  'node:http#ServerResponse.end',
  'node:http#ServerResponse.getHeader',
  'node:http#ServerResponse.getHeaderNames',
  'node:http#ServerResponse.hasHeader',
  'node:http#ServerResponse.on',
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

  assertResult(operation(operations, 'node:http#createServer'), nominalTypeRef('node:http#Server', 'value'))
  assertResult(operation(operations, 'node:http#get'), nominalTypeRef('node:http#ClientRequest', 'value'))
  assertResult(operation(operations, 'node:http#request'), nominalTypeRef('node:http#ClientRequest', 'value'))
  assertResult(operation(operations, 'node:http#Server.address'), nominalTypeRef('node:net#AddressInfo', 'value'))

  for (const operationId of ['node:http#Server.close', 'node:http#Server.listen', 'node:http#Server.on']) {
    assertResult(operation(operations, operationId), nominalTypeRef('node:http#Server', 'borrowed'))
  }

  assertResult(
    operation(operations, 'node:http#IncomingMessage.headers'),
    {
      kind: 'object',
      fields: [],
      dynamic: true,
      dynamicField: primitiveTypeRef('string', true),
      nullable: false,
      ownership: 'value',
      traits: []
    },
    'inox::Value'
  )

  for (const operationId of [
    'node:http#IncomingMessage.httpVersion',
    'node:http#IncomingMessage.method',
    'node:http#IncomingMessage.url'
  ]) {
    assertResult(operation(operations, operationId), primitiveTypeRef('string'), 'inox::String')
  }

  assertResult(operation(operations, 'node:http#IncomingMessage.socket'), nominalTypeRef('node:net#Socket', 'value'))
  assertResult(
    operation(operations, 'node:http#IncomingMessage.statusCode'),
    primitiveTypeRef('number', true),
    'inox::Value'
  )
  assertResult(
    operation(operations, 'node:http#IncomingMessage.statusMessage'),
    primitiveTypeRef('string', true),
    'inox::Value'
  )
  assertResult(
    operation(operations, 'node:http#IncomingMessage.on'),
    nominalTypeRef('node:http#IncomingMessage', 'borrowed')
  )
  assertResult(operation(operations, 'node:http#IncomingMessage.isPaused'), primitiveTypeRef('boolean'))
  assertResult(
    operation(operations, 'node:http#IncomingMessage.pause'),
    nominalTypeRef('node:http#IncomingMessage', 'borrowed')
  )
  assertResult(
    operation(operations, 'node:http#IncomingMessage.resume'),
    nominalTypeRef('node:http#IncomingMessage', 'borrowed')
  )
  assertResult(
    operation(operations, 'node:http#IncomingMessage.setEncoding'),
    nominalTypeRef('node:http#IncomingMessage', 'borrowed')
  )

  for (const operationId of ['node:http#ClientRequest.headersSent', 'node:http#ClientRequest.writableEnded']) {
    assertResult(operation(operations, operationId), primitiveTypeRef('boolean'))
  }

  for (const operationId of [
    'node:http#ClientRequest.destroy',
    'node:http#ClientRequest.end',
    'node:http#ClientRequest.on',
    'node:http#ClientRequest.setHeader'
  ]) {
    assertResult(operation(operations, operationId), nominalTypeRef('node:http#ClientRequest', 'borrowed'))
  }

  assertResult(
    operation(operations, 'node:http#ClientRequest.getHeader'),
    primitiveTypeRef('string', true),
    'inox::Value'
  )
  assertResult(
    operation(operations, 'node:http#ClientRequest.getHeaderNames'),
    arrayTypeRef(primitiveTypeRef('string'))
  )
  assertResult(operation(operations, 'node:http#ClientRequest.hasHeader'), primitiveTypeRef('boolean'))
  assertResult(operation(operations, 'node:http#ClientRequest.removeHeader'), primitiveTypeRef('void'))
  assertResult(operation(operations, 'node:http#ClientRequest.write'), primitiveTypeRef('boolean'))

  assertResult(operation(operations, 'node:http#ServerResponse.headersSent'), primitiveTypeRef('boolean'))
  assertResult(operation(operations, 'node:http#ServerResponse.statusCode.read'), primitiveTypeRef('number'))
  assertResult(operation(operations, 'node:http#ServerResponse.statusCode.write'), primitiveTypeRef('number'), 'void')
  assertResult(operation(operations, 'node:http#ServerResponse.writableEnded'), primitiveTypeRef('boolean'))
  assertResult(operation(operations, 'node:http#ServerResponse.end'), primitiveTypeRef('void'))
  assertResult(
    operation(operations, 'node:http#ServerResponse.getHeader'),
    primitiveTypeRef('string', true),
    'inox::Value'
  )
  assertResult(
    operation(operations, 'node:http#ServerResponse.getHeaderNames'),
    arrayTypeRef(primitiveTypeRef('string'))
  )
  assertResult(operation(operations, 'node:http#ServerResponse.hasHeader'), primitiveTypeRef('boolean'))
  assertResult(
    operation(operations, 'node:http#ServerResponse.on'),
    nominalTypeRef('node:http#ServerResponse', 'borrowed')
  )
  assertResult(operation(operations, 'node:http#ServerResponse.removeHeader'), primitiveTypeRef('void'))
  assertResult(
    operation(operations, 'node:http#ServerResponse.setHeader'),
    nominalTypeRef('node:http#ServerResponse', 'borrowed')
  )
  assertResult(operation(operations, 'node:http#ServerResponse.write'), primitiveTypeRef('boolean'))
  assertResult(
    operation(operations, 'node:http#ServerResponse.writeHead'),
    nominalTypeRef('node:http#ServerResponse', 'borrowed')
  )

  const variants = operations.flatMap((operation) => operation.variants ?? [])

  for (const variant of variants) {
    assert.equal(variant.resultTypeRef, undefined)
    assertLegacyResultMetadataIsAbsent(variant)
  }
})

function operation(operations: LibraryOperationDescriptor[], operationId: string): LibraryOperationDescriptor {
  const result = operations.find((item) => item.operationId === operationId)

  assert.ok(result, `missing operation ${operationId}`)
  return result
}

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
