import assert from 'node:assert/strict'
import { test } from 'node:test'

import type { LibraryOperationDescriptor } from '../../compiler/extensions/types.ts'
import { discoverCompilerLibraries } from '../../scripts/lib/compiler-library-discovery.ts'

test('node:net объявляет module, Server и Socket operations через package descriptor', async () => {
  const discovered = await discoverCompilerLibraries()
  const netPackage = discovered.find((library) => library.id === 'node:net')

  assert.ok(netPackage?.compilerPackage)

  const operations = netPackage.compilerPackage.operations
  const ids = operations.map((operation) => operation.operationId).sort()

  assert.deepEqual(ids, [
    'node:net#Server.address',
    'node:net#Server.close',
    'node:net#Server.listen',
    'node:net#Server.listening',
    'node:net#Server.on',
    'node:net#Server.ref',
    'node:net#Server.unref',
    'node:net#Socket.address',
    'node:net#Socket.bytesRead',
    'node:net#Socket.bytesWritten',
    'node:net#Socket.connecting',
    'node:net#Socket.destroy',
    'node:net#Socket.destroyed',
    'node:net#Socket.end',
    'node:net#Socket.isPaused',
    'node:net#Socket.localAddress',
    'node:net#Socket.localPort',
    'node:net#Socket.on',
    'node:net#Socket.pause',
    'node:net#Socket.pending',
    'node:net#Socket.readyState',
    'node:net#Socket.ref',
    'node:net#Socket.remoteAddress',
    'node:net#Socket.remotePort',
    'node:net#Socket.resume',
    'node:net#Socket.setEncoding',
    'node:net#Socket.setKeepAlive',
    'node:net#Socket.setNoDelay',
    'node:net#Socket.unref',
    'node:net#Socket.write',
    'node:net#connect',
    'node:net#createServer'
  ])

  const createServer = operation(operations, 'node:net#createServer')

  assert.equal(createServer.bindingId, 'node:net#module:node:net:createServer')
  assert.deepEqual(createServer.bindingAliases, ['node:net#module:node:net:default.createServer'])
  assert.equal(createServer.cExpression, 'net.createServer')
  assert.ok(
    createServer.variants?.some(
      (variant) => variant.callbackLifetime === 'event-loop' && variant.cArgumentKinds?.includes('runtime-callback')
    )
  )

  const connect = operation(operations, 'node:net#connect')

  assert.deepEqual(connect.bindingAliases, [
    'node:net#module:node:net:createConnection',
    'node:net#module:node:net:default.connect',
    'node:net#module:node:net:default.createConnection'
  ])
  assert.equal(connect.cExpression, 'net.connect')
  assert.ok(
    connect.variants?.some(
      (variant) =>
        variant.argumentValueTypes?.includes('object') &&
        variant.cArgumentAdapters?.includes('NetConnectionOptions($value)')
    )
  )

  for (const operationId of [
    'node:net#Server.close',
    'node:net#Server.listen',
    'node:net#Server.on',
    'node:net#Socket.end',
    'node:net#Socket.on',
    'node:net#Socket.write'
  ]) {
    const callbackOperation = operation(operations, operationId)

    assert.ok(
      callbackOperation.variants?.some(
        (variant) =>
          variant.callbackLifetime === 'event-loop' &&
          (variant.cArgumentKinds?.includes('runtime-callback') ||
            variant.cArgumentKinds?.includes('optional-runtime-callback'))
      ) || callbackOperation.callbackLifetime === 'event-loop'
    )
  }

  assert.equal(operation(operations, 'node:net#Server.address').cExpression, 'address')
  assert.equal(operation(operations, 'node:net#Socket.address').cExpression, 'address')

  for (const operationId of [
    'node:net#Server.listening',
    'node:net#Socket.bytesRead',
    'node:net#Socket.bytesWritten',
    'node:net#Socket.connecting',
    'node:net#Socket.destroyed',
    'node:net#Socket.localAddress',
    'node:net#Socket.localPort',
    'node:net#Socket.pending',
    'node:net#Socket.readyState',
    'node:net#Socket.remoteAddress',
    'node:net#Socket.remotePort'
  ]) {
    assert.equal(operation(operations, operationId).kind, 'member-read')
  }
})

function operation(operations: LibraryOperationDescriptor[], operationId: string): LibraryOperationDescriptor {
  const result = operations.find((item) => item.operationId === operationId)

  assert.ok(result, `missing operation ${operationId}`)
  return result
}
