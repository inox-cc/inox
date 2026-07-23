import assert from 'node:assert/strict'
import { test } from 'node:test'

import type {
  LibraryOperationDescriptor,
  LibraryOperationKind
} from '../../compiler/extensions/types.ts'
import { discoverCompilerLibraries } from '../../scripts/lib/compiler-library-discovery.ts'

type ExpectedOperation = {
  aliases: string[]
  binding: string
  id: string
  kind: LibraryOperationKind
  message: string
}

const libraryId = 'node:stream'
const classNames = ['Duplex', 'PassThrough', 'Readable', 'Stream', 'Transform', 'Writable']
const functionNames = ['finished', 'pipeline']
const promiseFunctionNames = ['promises.finished', 'promises.pipeline']

test('node:stream package исчерпывающе владеет diagnostic operations public runtime exports', async () => {
  const discovered = await discoverCompilerLibraries()
  const streamPackage = discovered.find((library) => library.id === libraryId)

  assert.ok(streamPackage?.compilerPackage)

  const actual = streamPackage.compilerPackage.operations
    .map(operationContract)
    .sort(compareOperations)
  const expected = expectedOperations().sort(compareOperations)

  assert.equal(expected.length, 21)
  assert.deepEqual(actual, expected)

  for (const operation of streamPackage.compilerPackage.operations) {
    assert.deepEqual(operation.runtimeRequirements, [])
    assert.equal(operation.diagnosticCode, 'INOX_NOT_IMPLEMENTED')
    assert.equal(operation.cExpression ?? null, null)
  }
})

function expectedOperations(): ExpectedOperation[] {
  const operations: ExpectedOperation[] = []

  for (const name of classNames) {
    operations.push(expectedNamedOperation(name, 'member-read'))
    operations.push(expectedNamedOperation(name, 'construct'))
  }

  for (const name of functionNames) {
    operations.push(expectedNamedOperation(name, 'member-read'))
    operations.push(expectedNamedOperation(name, 'call'))
  }

  operations.push(expectedNamedOperation('promises', 'member-read'))

  for (const name of promiseFunctionNames) {
    operations.push(expectedNamedOperation(name, 'member-read'))
    operations.push(expectedNamedOperation(name, 'call'))
  }

  return operations
}

function expectedNamedOperation(name: string, kind: LibraryOperationKind): ExpectedOperation {
  return {
    aliases: [defaultBinding(name)],
    binding: namedBinding(name),
    id: operationId(name, kind),
    kind,
    message: diagnosticMessage(name)
  }
}

function operationContract(operation: LibraryOperationDescriptor): ExpectedOperation {
  return {
    aliases: (operation.bindingAliases ?? []).slice().sort(),
    binding: operation.bindingId,
    id: operation.operationId,
    kind: operation.kind,
    message: operation.diagnosticMessage ?? ''
  }
}

function operationId(name: string, kind: LibraryOperationKind): string {
  if (kind === 'member-read') {
    return `${libraryId}#${name}.read`
  }

  return `${libraryId}#${name}.${kind}`
}

function namedBinding(name: string): string {
  return `${libraryId}#module:${libraryId}:${name}`
}

function defaultBinding(name: string): string {
  return `${libraryId}#module:${libraryId}:default.${name}`
}

function diagnosticMessage(name: string): string {
  return `${libraryId} ${name} is not implemented by the current C++ backend: ${diagnosticReason(name)}`
}

function diagnosticReason(name: string): string {
  if (
    name === 'Readable' ||
    name === 'Writable' ||
    name === 'Duplex' ||
    name === 'Transform' ||
    name === 'PassThrough'
  ) {
    return 'stream buffering and backpressure support are not implemented by the current C++ backend'
  }

  if (name === 'pipeline' || name === 'promises.pipeline') {
    return 'stream pipeline orchestration needs stream runtime support'
  }

  if (name === 'finished' || name === 'promises.finished') {
    return 'stream completion tracking needs stream runtime support'
  }

  return 'node:stream runtime support is not implemented by the current C++ backend'
}

function compareOperations(left: ExpectedOperation, right: ExpectedOperation): number {
  return `${left.id}:${left.kind}`.localeCompare(`${right.id}:${right.kind}`)
}
