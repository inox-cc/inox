import assert from 'node:assert/strict'
import { test } from 'node:test'

import type {
  LibraryOperationDescriptor,
  LibraryOperationKind
} from '../../compiler/extensions/types.ts'
import { discoverCompilerLibraries } from '../../scripts/lib/compiler-library-discovery.ts'

const libraryId = 'node:events'
const eventRuntimeReason = 'node:events runtime support is not implemented by the current C++ backend'
const listenerReason = 'event dispatch and listener lifetime support are not implemented by the current C++ backend'
const asyncListenerReason = 'async event iterator/listener helpers need EventEmitter runtime support'

test('node:events exhaustive diagnostics принадлежат package operations', async () => {
  const discovered = await discoverCompilerLibraries()
  const eventsPackage = discovered.find((library) => library.id === libraryId)

  assert.ok(eventsPackage?.compilerPackage)
  const operations = eventsPackage.compilerPackage.operations

  assert.equal(operations.length, 22)

  assertDiagnosticOperation(operations, 'EventEmitter', 'member-read', listenerReason)
  assertDiagnosticOperation(operations, 'EventEmitter', 'construct', listenerReason)
  assertDiagnosticOperation(operations, 'EventEmitterAsyncResource', 'member-read', listenerReason)
  assertDiagnosticOperation(operations, 'EventEmitterAsyncResource', 'construct', listenerReason)

  for (const name of ['addAbortListener', 'on', 'once']) {
    assertDiagnosticOperation(operations, name, 'member-read', asyncListenerReason)
    assertDiagnosticOperation(operations, name, 'call', asyncListenerReason)
  }

  for (const name of [
    'getEventListeners',
    'getMaxListeners',
    'listenerCount',
    'setMaxListeners'
  ]) {
    assertDiagnosticOperation(operations, name, 'member-read', eventRuntimeReason)
    assertDiagnosticOperation(operations, name, 'call', eventRuntimeReason)
  }

  assertDiagnosticOperation(operations, 'captureRejectionSymbol', 'member-read', eventRuntimeReason)
  assertDiagnosticOperation(operations, 'defaultMaxListeners', 'member-read', eventRuntimeReason)
  assertDiagnosticOperation(operations, 'defaultMaxListeners', 'member-write', eventRuntimeReason)
  assertDiagnosticOperation(operations, 'errorMonitor', 'member-read', eventRuntimeReason)

  assert.equal(operations.every((operation) => operation.libraryId === libraryId), true)
  assert.equal(operations.every((operation) => operation.runtimeRequirements.length === 0), true)
  assert.equal(operations.every((operation) => operation.cExpression === null), true)
})

function assertDiagnosticOperation(
  operations: LibraryOperationDescriptor[],
  name: string,
  kind: LibraryOperationKind,
  reason: string
): void {
  const bindingId = `${libraryId}#module:${libraryId}:${name}`
  const operation = operations.find(
    (candidate) => candidate.bindingId === bindingId && candidate.kind === kind
  )

  assert.ok(operation, `missing ${kind} diagnostic operation for ${name}`)
  assert.equal(operation.operationId, `${libraryId}#${name}.${operationKindSuffix(kind)}`)
  assert.deepEqual(operation.bindingAliases, [`${libraryId}#module:${libraryId}:default.${name}`])
  assert.equal(operation.diagnosticCode, 'INOX_NOT_IMPLEMENTED')
  assert.equal(
    operation.diagnosticMessage,
    `${libraryId} ${name} is not implemented by the current C++ backend: ${reason}`
  )
}

function operationKindSuffix(kind: LibraryOperationKind): string {
  if (kind === 'member-read') {
    return 'read'
  }

  if (kind === 'member-write') {
    return 'write'
  }

  return kind
}
