import assert from 'node:assert/strict'
import { test } from 'node:test'

import type {
  LibraryOperationDescriptor,
  LibraryOperationKind
} from '../../compiler/extensions/types.ts'
import { discoverCompilerLibraries } from '../../scripts/lib/compiler-library-discovery.ts'

const libraryId = 'node:events'
const eventEmitterTypeId = `${libraryId}#EventEmitter`

test('node:events отделяет native EventEmitter от честных diagnostics', async () => {
  const discovered = await discoverCompilerLibraries()
  const eventsPackage = discovered.find((library) => library.id === libraryId)

  assert.ok(eventsPackage?.compilerPackage)
  const operations = eventsPackage.compilerPackage.operations

  const constructor = operation(operations, `${eventEmitterTypeId}.construct`)
  assert.equal(constructor?.kind, 'construct')
  assert.equal(constructor?.cExpression, 'EventEmitter::create')
  assert.deepEqual(constructor?.runtimeRequirements, [libraryId])

  for (const name of [
    'addListener',
    'emit',
    'listenerCount',
    'off',
    'on',
    'once',
    'removeListener'
  ]) {
    const item = operations.find((candidate) => candidate.bindingId === `${eventEmitterTypeId}.${name}`)
    assert.equal(item?.cExpression, name)
    assert.deepEqual(item?.runtimeRequirements, [libraryId])
    assert.equal(item?.diagnosticCode ?? null, null)
  }

  for (const name of ['listenerCount', 'off', 'removeAllListeners', 'removeListener']) {
    const item = operations.find((candidate) => candidate.bindingId === `${eventEmitterTypeId}.${name}`)
    assert.equal(item?.cFailureMode ?? null, null)
  }

  for (const name of ['addListener', 'emit', 'on', 'once']) {
    const item = operations.find((candidate) => candidate.bindingId === `${eventEmitterTypeId}.${name}`)
    assert.equal(item?.cFailureMode, 'thrown')
  }

  assert.equal(
    operations.filter((candidate) => candidate.bindingId === `${eventEmitterTypeId}.removeAllListeners`).length,
    1
  )

  for (const name of ['eventNames', 'listeners']) {
    const item = operations.find((candidate) => candidate.bindingId === `${eventEmitterTypeId}.${name}`)
    assert.equal(item?.diagnosticCode, 'INOX_NOT_IMPLEMENTED')
    assert.equal(item?.cExpression, null)
  }

  assertDiagnosticOperation(operations, 'EventEmitter', 'member-read')
  assertDiagnosticOperation(operations, 'EventEmitterAsyncResource', 'construct')
  assertDiagnosticOperation(operations, 'once', 'call')
  assertDiagnosticOperation(operations, 'defaultMaxListeners', 'member-write')
  assert.equal(operations.every((item) => item.libraryId === libraryId), true)
})

function operation(
  operations: LibraryOperationDescriptor[],
  operationId: string
): LibraryOperationDescriptor | undefined {
  return operations.find((candidate) => candidate.operationId === operationId)
}

function assertDiagnosticOperation(
  operations: LibraryOperationDescriptor[],
  name: string,
  kind: LibraryOperationKind
): void {
  const bindingId = `${libraryId}#module:${libraryId}:${name}`
  const item = operations.find((candidate) => candidate.bindingId === bindingId && candidate.kind === kind)

  assert.ok(item, `missing ${kind} diagnostic operation for ${name}`)
  assert.equal(item.diagnosticCode, 'INOX_NOT_IMPLEMENTED')
  assert.equal(item.cExpression, null)
  assert.deepEqual(item.runtimeRequirements, [])
}
