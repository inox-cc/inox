import assert from 'node:assert/strict'
import { test } from 'node:test'

import type {
  LibraryCallbackParameterDescriptor,
  LibraryOperationDescriptor,
  LibraryOperationVariantDescriptor
} from '../../compiler/extensions/types.ts'
import { discoverCompilerLibraries } from '../../scripts/lib/compiler-library-discovery.ts'

const serverTypeId = 'node:http#Server'
const requestTypeId = 'node:http#IncomingMessage'
const responseTypeId = 'node:http#ServerResponse'
const clientRequestTypeId = 'node:http#ClientRequest'

test('node:http объявляет server и client operations через package descriptor', async () => {
  const discovered = await discoverCompilerLibraries()
  const httpPackage = discovered.find((library) => library.id === 'node:http')

  assert.ok(httpPackage?.compilerPackage)

  const operations = httpPackage.compilerPackage.operations
  const ids = operations.map((operation) => operation.operationId).sort()

  assert.deepEqual(ids, [
    'node:http#ClientRequest.destroy',
    'node:http#ClientRequest.destroyed',
    'node:http#ClientRequest.end',
    'node:http#ClientRequest.getHeader',
    'node:http#ClientRequest.getHeaderNames',
    'node:http#ClientRequest.hasHeader',
    'node:http#ClientRequest.headersSent',
    'node:http#ClientRequest.on',
    'node:http#ClientRequest.removeHeader',
    'node:http#ClientRequest.setHeader',
    'node:http#ClientRequest.setTimeout',
    'node:http#ClientRequest.writableEnded',
    'node:http#ClientRequest.write',
    'node:http#IncomingMessage.headers',
    'node:http#IncomingMessage.httpVersion',
    'node:http#IncomingMessage.isPaused',
    'node:http#IncomingMessage.method',
    'node:http#IncomingMessage.on',
    'node:http#IncomingMessage.pause',
    'node:http#IncomingMessage.resume',
    'node:http#IncomingMessage.setEncoding',
    'node:http#IncomingMessage.socket',
    'node:http#IncomingMessage.statusCode',
    'node:http#IncomingMessage.statusMessage',
    'node:http#IncomingMessage.url',
    'node:http#Server.address',
    'node:http#Server.close',
    'node:http#Server.listen',
    'node:http#Server.on',
    'node:http#Server.setTimeout',
    'node:http#ServerResponse.end',
    'node:http#ServerResponse.getHeader',
    'node:http#ServerResponse.getHeaderNames',
    'node:http#ServerResponse.hasHeader',
    'node:http#ServerResponse.headersSent',
    'node:http#ServerResponse.on',
    'node:http#ServerResponse.removeHeader',
    'node:http#ServerResponse.setHeader',
    'node:http#ServerResponse.statusCode.read',
    'node:http#ServerResponse.statusCode.write',
    'node:http#ServerResponse.writableEnded',
    'node:http#ServerResponse.write',
    'node:http#ServerResponse.writeHead',
    'node:http#createServer',
    'node:http#get',
    'node:http#request'
  ])

  const createServer = operation(operations, 'node:http#createServer')

  assert.equal(createServer.bindingId, 'node:http#module:node:http:createServer')
  assert.deepEqual(createServer.bindingAliases, ['node:http#module:node:http:default.createServer'])
  assert.equal(createServer.cExpression, 'http.createServer')
  assert.deepEqual(callbackParameterTypeIds(callbackVariant(createServer)), [requestTypeId, responseTypeId])

  for (const operationId of ['node:http#get', 'node:http#request']) {
    const createClientRequest = operation(operations, operationId)

    assert.equal(createClientRequest.cExpression, `http.${operationId.slice('node:http#'.length)}`)
    assert.equal(createClientRequest.callbackLifetime, 'event-loop')
    assert.deepEqual(callbackParameterTypeIds(callbackVariant(createClientRequest)), [requestTypeId])
    assert.deepEqual(createClientRequest.resultTypeRef, {
      kind: 'nominal',
      typeId: clientRequestTypeId,
      args: [],
      nullable: false,
      ownership: 'value',
      traits: []
    })
  }

  const close = operation(operations, 'node:http#Server.close')
  const listen = operation(operations, 'node:http#Server.listen')
  const on = operation(operations, 'node:http#Server.on')
  const address = operation(operations, 'node:http#Server.address')

  assert.equal(address.receiverTypeId, serverTypeId)
  assert.equal(address.cExpression, 'address')

  assert.equal(close.receiverTypeId, serverTypeId)
  assert.equal(close.cReceiverAdapter, 'HttpServer($value)')
  assert.ok(hasEventLoopCallbackVariant(close))

  assert.equal(listen.receiverTypeId, serverTypeId)
  assert.equal(listen.cReceiverAdapter, 'HttpServer($value)')
  assert.ok(
    listen.variants?.some(
      (variant) =>
        variant.argumentValueTypes?.includes('object') &&
        variant.cArgumentAdapters?.includes('HttpListenOptions($value)')
    )
  )
  assert.ok(hasEventLoopCallbackVariant(listen))

  assert.equal(on.receiverTypeId, serverTypeId)
  assert.equal(on.cExpression, 'on')
  assert.equal(on.cCallStyle, 'member')
  assert.equal(on.cReceiverAdapter, 'HttpServer($value)')
  assert.equal(on.cResultMode, 'borrowed')
  assert.equal(on.callbackLifetime, 'event-loop')

  const requestVariant = on.variants?.find((variant) => variant.stringLiterals?.includes('request'))

  assert.ok(requestVariant)
  assert.deepEqual(callbackParameterTypeIds(requestVariant), [requestTypeId, responseTypeId])

  for (const operationId of [
    'node:http#IncomingMessage.headers',
    'node:http#IncomingMessage.httpVersion',
    'node:http#IncomingMessage.method',
    'node:http#IncomingMessage.socket',
    'node:http#IncomingMessage.statusCode',
    'node:http#IncomingMessage.statusMessage',
    'node:http#IncomingMessage.url'
  ]) {
    const requestRead = operation(operations, operationId)

    assert.equal(requestRead.kind, 'member-read')
    assert.equal(requestRead.receiverTypeId, requestTypeId)
    assert.equal(requestRead.cReceiverAdapter, 'HttpRequest($value)')
    assert.equal(requestRead.cCallStyle, 'member')
  }

  const requestOn = operation(operations, 'node:http#IncomingMessage.on')
  const requestIsPaused = operation(operations, 'node:http#IncomingMessage.isPaused')
  const requestPause = operation(operations, 'node:http#IncomingMessage.pause')
  const requestResume = operation(operations, 'node:http#IncomingMessage.resume')
  const requestSetEncoding = operation(operations, 'node:http#IncomingMessage.setEncoding')

  assert.equal(requestOn.receiverTypeId, requestTypeId)
  assert.equal(requestOn.callbackLifetime, 'event-loop')
  assert.ok(hasEventLoopCallbackVariant(requestOn))
  assert.deepEqual(requestIsPaused.cArgumentKinds, ['receiver'])
  assert.equal(requestPause.cResultMode, 'borrowed')
  assert.equal(requestResume.cResultMode, 'borrowed')
  assert.equal(requestSetEncoding.receiverTypeId, requestTypeId)
  assert.deepEqual(requestSetEncoding.cArgumentKinds, ['receiver', 'string-view'])

  for (const operationId of [
    'node:http#ClientRequest.destroy',
    'node:http#ClientRequest.destroyed',
    'node:http#ClientRequest.end',
    'node:http#ClientRequest.getHeader',
    'node:http#ClientRequest.getHeaderNames',
    'node:http#ClientRequest.hasHeader',
    'node:http#ClientRequest.headersSent',
    'node:http#ClientRequest.on',
    'node:http#ClientRequest.removeHeader',
    'node:http#ClientRequest.setHeader',
    'node:http#ClientRequest.setTimeout',
    'node:http#ClientRequest.writableEnded',
    'node:http#ClientRequest.write'
  ]) {
    const clientOperation = operation(operations, operationId)

    assert.equal(clientOperation.receiverTypeId, clientRequestTypeId)
    assert.equal(clientOperation.cReceiverAdapter, 'HttpClientRequest($value)')
    assert.equal(clientOperation.cCallStyle, 'member')
  }

  const statusRead = operation(operations, 'node:http#ServerResponse.statusCode.read')
  const statusWrite = operation(operations, 'node:http#ServerResponse.statusCode.write')

  assert.equal(statusRead.kind, 'member-read')
  assert.equal(statusRead.receiverTypeId, responseTypeId)
  assert.equal(statusRead.cReceiverAdapter, 'HttpResponse($value)')
  assert.equal(statusWrite.kind, 'member-write')
  assert.equal(statusWrite.receiverTypeId, responseTypeId)
  assert.equal(statusWrite.cReceiverAdapter, 'HttpResponse($value)')

  const end = operation(operations, 'node:http#ServerResponse.end')
  const getHeader = operation(operations, 'node:http#ServerResponse.getHeader')
  const getHeaderNames = operation(operations, 'node:http#ServerResponse.getHeaderNames')
  const hasHeader = operation(operations, 'node:http#ServerResponse.hasHeader')
  const responseOn = operation(operations, 'node:http#ServerResponse.on')
  const removeHeader = operation(operations, 'node:http#ServerResponse.removeHeader')
  const setHeader = operation(operations, 'node:http#ServerResponse.setHeader')
  const write = operation(operations, 'node:http#ServerResponse.write')
  const writeHead = operation(operations, 'node:http#ServerResponse.writeHead')

  for (const responseOperation of [
    end,
    getHeader,
    getHeaderNames,
    hasHeader,
    responseOn,
    removeHeader,
    setHeader,
    write,
    writeHead
  ]) {
    assert.equal(responseOperation.receiverTypeId, responseTypeId)
    assert.equal(responseOperation.cReceiverAdapter, 'HttpResponse($value)')
    assert.equal(responseOperation.cCallStyle, 'member')
  }

  assertBodyVariants(end)
  assert.deepEqual(setHeader.cArgumentKinds, ['receiver', 'string-view', 'string-view'])
  assert.equal(setHeader.cResultMode, 'borrowed')
  assert.deepEqual(getHeader.cArgumentKinds, ['receiver', 'string-view'])
  assert.deepEqual(getHeaderNames.cArgumentKinds, ['receiver'])
  assert.deepEqual(hasHeader.cArgumentKinds, ['receiver', 'string-view'])
  assert.ok(hasEventLoopCallbackVariant(responseOn))
  assert.deepEqual(removeHeader.cArgumentKinds, ['receiver', 'string-view'])
  assertBodyVariants(write)
  assert.equal(writeHead.cResultMode, 'borrowed')
  assert.ok(
    writeHead.variants?.some(
      (variant) =>
        variant.argumentValueTypes?.includes('object') && variant.cArgumentAdapters?.includes('HttpHeaders($value)')
    )
  )
})

function operation(operations: LibraryOperationDescriptor[], operationId: string): LibraryOperationDescriptor {
  const result = operations.find((item) => item.operationId === operationId)

  assert.ok(result, `missing operation ${operationId}`)
  return result
}

function callbackVariant(operationDescriptor: LibraryOperationDescriptor): LibraryOperationVariantDescriptor {
  const variant = operationDescriptor.variants?.find(
    (item) => item.callbackLifetime === 'event-loop' && item.cArgumentKinds?.includes('runtime-callback')
  )

  assert.ok(variant, `missing callback variant for ${operationDescriptor.operationId}`)
  return variant
}

function callbackParameterTypeIds(variant: LibraryOperationVariantDescriptor): Array<string | null> {
  const callback = variant.argumentChecks?.find(
    (check) => check.functionParameters !== null && typeof check.functionParameters !== 'undefined'
  )

  assert.ok(callback)
  return (callback.functionParameters ?? []).map(callbackParameterTypeId)
}

function callbackParameterTypeId(parameter: LibraryCallbackParameterDescriptor): string | null {
  return parameter.resultTypeId ?? null
}

function hasEventLoopCallbackVariant(operationDescriptor: LibraryOperationDescriptor): boolean {
  return (
    operationDescriptor.variants?.some(
      (variant) => variant.callbackLifetime === 'event-loop' && variant.cArgumentKinds?.includes('runtime-callback')
    ) === true
  )
}

function assertBodyVariants(operationDescriptor: LibraryOperationDescriptor): void {
  assert.ok(
    operationDescriptor.variants?.some(
      (variant) => variant.argumentValueTypes?.includes('string') && variant.cArgumentKinds?.includes('string-view')
    ),
    `${operationDescriptor.operationId} must accept string bodies`
  )
  assert.ok(
    operationDescriptor.variants?.some(
      (variant) =>
        variant.argumentValueTypes?.includes('bytes') &&
        variant.cArgumentKinds?.includes('value') &&
        variant.cArgumentAdapters?.includes('Uint8Array($value)')
    ),
    `${operationDescriptor.operationId} must accept Uint8Array bodies`
  )
}
