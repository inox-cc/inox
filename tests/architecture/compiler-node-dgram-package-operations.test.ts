import assert from 'node:assert/strict'
import { test } from 'node:test'

import type { LibraryOperationDescriptor } from '../../compiler/extensions/types.ts'
import { discoverCompilerLibraries } from '../../scripts/lib/compiler-library-discovery.ts'

test('node:dgram объявляет module и Socket operations через package descriptor', async () => {
  const discovered = await discoverCompilerLibraries()
  const dgramPackage = discovered.find((library) => library.id === 'node:dgram')

  assert.ok(dgramPackage?.compilerPackage)

  const operations = dgramPackage.compilerPackage.operations
  const ids = operations.map((operation) => operation.operationId).sort()

  assert.deepEqual(ids, [
    'node:dgram#Socket.address',
    'node:dgram#Socket.bind',
    'node:dgram#Socket.close',
    'node:dgram#Socket.connect',
    'node:dgram#Socket.disconnect',
    'node:dgram#Socket.getRecvBufferSize',
    'node:dgram#Socket.getSendBufferSize',
    'node:dgram#Socket.on',
    'node:dgram#Socket.ref',
    'node:dgram#Socket.remoteAddress',
    'node:dgram#Socket.send',
    'node:dgram#Socket.setBroadcast',
    'node:dgram#Socket.setRecvBufferSize',
    'node:dgram#Socket.setSendBufferSize',
    'node:dgram#Socket.setTTL',
    'node:dgram#Socket.unref',
    'node:dgram#createSocket'
  ])

  const createSocket = operation(operations, 'node:dgram#createSocket')

  assert.equal(createSocket.bindingId, 'node:dgram#module:node:dgram:createSocket')
  assert.deepEqual(createSocket.bindingAliases, [
    'node:dgram#module:node:dgram:default.createSocket'
  ])
  assert.equal(createSocket.cExpression, 'dgram.createSocket')
  assert.equal(createSocket.resultTypeId, 'node:dgram#Socket')
  assert.deepEqual(createSocket.runtimeRequirements, ['node:dgram'])
  assert.ok(
    createSocket.variants?.some(
      (variant) =>
        variant.argumentValueTypes?.includes('object') &&
        variant.cArgumentAdapters?.includes('DgramSocketOptions($value)') &&
        variant.cArgumentKinds?.includes('runtime-callback')
    )
  )

  const on = operation(operations, 'node:dgram#Socket.on')

  assert.equal(on.receiverTypeId, 'node:dgram#Socket')
  assert.equal(on.cCallStyle, 'member')
  assert.equal(on.cExpression, 'on')
  assert.equal(on.cResultMode, 'borrowed')
  assert.equal(on.callbackLifetime, 'event-loop')
  assert.deepEqual(on.cArgumentKinds, ['receiver', 'string-view', 'runtime-callback'])

  const address = operation(operations, 'node:dgram#Socket.address')
  const remoteAddress = operation(operations, 'node:dgram#Socket.remoteAddress')

  assert.equal(address.resultTypeId, 'node:dgram#AddressInfo')
  assert.equal(remoteAddress.resultTypeId, 'node:dgram#AddressInfo')

  for (const operationId of [
    'node:dgram#Socket.bind',
    'node:dgram#Socket.close',
    'node:dgram#Socket.connect',
    'node:dgram#Socket.send'
  ]) {
    const callbackOperation = operation(operations, operationId)

    assert.ok(
      callbackOperation.variants?.some(
        (variant) =>
          variant.callbackLifetime === 'event-loop' &&
          variant.cArgumentKinds?.includes('runtime-callback')
      )
    )
  }
})

function operation(
  operations: LibraryOperationDescriptor[],
  operationId: string
): LibraryOperationDescriptor {
  const result = operations.find((item) => item.operationId === operationId)

  assert.ok(result, `missing operation ${operationId}`)
  return result
}
