import type {
  CompilerLibraryPackageDescriptor,
  LibraryOperationDescriptor,
  LibraryOperationKind
} from '../../../../compiler/extensions/types.ts'

const libraryId = 'node:stream'
const classNames = ['Duplex', 'PassThrough', 'Readable', 'Stream', 'Transform', 'Writable']
const functionNames = ['finished', 'pipeline']
const promiseFunctionNames = ['promises.finished', 'promises.pipeline']
const operations: LibraryOperationDescriptor[] = []

for (const name of classNames) {
  operations.push(unsupportedOperation(name, 'member-read'))
  operations.push(unsupportedOperation(name, 'construct'))
}

for (const name of functionNames) {
  operations.push(unsupportedOperation(name, 'member-read'))
  operations.push(unsupportedOperation(name, 'call'))
}

operations.push(unsupportedOperation('promises', 'member-read'))

for (const name of promiseFunctionNames) {
  operations.push(unsupportedOperation(name, 'member-read'))
  operations.push(unsupportedOperation(name, 'call'))
}

export const compilerLibraryPackage: CompilerLibraryPackageDescriptor = {
  id: libraryId,
  dependencies: [],
  nativeTypes: [],
  operations,
  intrinsicBindings: [],
  runtimeRequirements: []
}

function unsupportedOperation(name: string, kind: LibraryOperationKind): LibraryOperationDescriptor {
  return {
    libraryId,
    bindingId: namedBinding(name),
    bindingAliases: [defaultBinding(name)],
    operationId: operationId(name, kind),
    kind,
    runtimeRequirements: [],
    cExpression: null,
    diagnosticCode: 'INOX_NOT_IMPLEMENTED',
    diagnosticMessage:
      `${libraryId} ${name} is not implemented by the current C++ backend: ${unsupportedReason(name)}`
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

function unsupportedReason(name: string): string {
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
