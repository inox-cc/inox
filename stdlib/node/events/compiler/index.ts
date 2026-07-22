import type {
  CompilerLibraryPackageDescriptor,
  LibraryOperationDescriptor,
  LibraryOperationKind
} from '../../../../compiler/extensions/types.ts'

const libraryId = 'node:events'
const eventRuntimeReason = 'node:events runtime support is not implemented by the current C++ backend'
const listenerReason = 'event dispatch and listener lifetime support are not implemented by the current C++ backend'
const asyncListenerReason = 'async event iterator/listener helpers need EventEmitter runtime support'
const operations: LibraryOperationDescriptor[] = []

pushDiagnosticOperations('EventEmitter', ['member-read', 'construct'], listenerReason)
pushDiagnosticOperations('EventEmitterAsyncResource', ['member-read', 'construct'], listenerReason)
pushDiagnosticOperations('addAbortListener', ['member-read', 'call'], asyncListenerReason)
pushDiagnosticOperations('getEventListeners', ['member-read', 'call'], eventRuntimeReason)
pushDiagnosticOperations('getMaxListeners', ['member-read', 'call'], eventRuntimeReason)
pushDiagnosticOperations('listenerCount', ['member-read', 'call'], eventRuntimeReason)
pushDiagnosticOperations('on', ['member-read', 'call'], asyncListenerReason)
pushDiagnosticOperations('once', ['member-read', 'call'], asyncListenerReason)
pushDiagnosticOperations('setMaxListeners', ['member-read', 'call'], eventRuntimeReason)
pushDiagnosticOperations('captureRejectionSymbol', ['member-read'], eventRuntimeReason)
pushDiagnosticOperations('defaultMaxListeners', ['member-read', 'member-write'], eventRuntimeReason)
pushDiagnosticOperations('errorMonitor', ['member-read'], eventRuntimeReason)

export const compilerLibraryPackage: CompilerLibraryPackageDescriptor = {
  id: libraryId,
  dependencies: [],
  nativeTypes: [],
  operations,
  intrinsicBindings: [],
  runtimeRequirements: []
}

function pushDiagnosticOperations(
  name: string,
  kinds: LibraryOperationKind[],
  reason: string
): void {
  for (const kind of kinds) {
    operations.push(diagnosticOperation(name, kind, reason))
  }
}

function diagnosticOperation(
  name: string,
  kind: LibraryOperationKind,
  reason: string
): LibraryOperationDescriptor {
  return {
    libraryId,
    bindingId: `${libraryId}#module:${libraryId}:${name}`,
    bindingAliases: [`${libraryId}#module:${libraryId}:default.${name}`],
    operationId: `${libraryId}#${name}.${operationKindSuffix(kind)}`,
    kind,
    runtimeRequirements: [],
    cExpression: null,
    diagnosticCode: 'INOX_NOT_IMPLEMENTED',
    diagnosticMessage: `${libraryId} ${name} is not implemented by the current C backend: ${reason}`
  }
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
