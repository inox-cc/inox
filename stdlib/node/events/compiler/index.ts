import type {
  CompilerLibraryPackageDescriptor,
  LibraryOperationDescriptor,
  LibraryOperationKind,
  PrimitiveTypeRef,
  TypeRef,
  UnknownTypeRef
} from '../../../../compiler/extensions/types.ts'

const libraryId = 'node:events'
const runtimeRequirement = libraryId
const runtimeRequirements = [runtimeRequirement]
const eventEmitterTypeId = `${libraryId}#EventEmitter`
const eventEmitterTypeRef = nominalTypeRef('value')
const eventEmitterBorrowedTypeRef = nominalTypeRef('borrowed')
const booleanTypeRef = primitiveTypeRef('boolean')
const numberTypeRef = primitiveTypeRef('number')
const eventRuntimeReason = 'this EventEmitter API is not implemented by the current C++ backend'
const asyncListenerReason = 'async event iterator/listener helpers are not implemented by the current C++ backend'
const operations: LibraryOperationDescriptor[] = [
  eventEmitterConstructor(),
  listenerOperation('addListener'),
  emitOperation(),
  listenerCountOperation(),
  listenerOperation('off'),
  listenerOperation('on'),
  listenerOperation('once'),
  removeAllListenersOperation(),
  listenerOperation('removeListener'),
  receiverDiagnosticOperation('eventNames'),
  receiverDiagnosticOperation('listeners')
]

pushDiagnosticOperations('EventEmitter', ['member-read'], eventRuntimeReason)
pushDiagnosticOperations('EventEmitterAsyncResource', ['member-read', 'construct'], eventRuntimeReason)
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
  nativeTypes: [
    {
      libraryId,
      typeId: eventEmitterTypeId,
      declarationNames: ['EventEmitter'],
      valueType: 'object',
      cppType: 'EventEmitter',
      baseTypeIds: [],
      runtimeRequirements,
      cValueAdapter: 'EventEmitter(inox::Value($value))',
      cValueAdapterFailureMode: 'thrown',
      cValueAdapterPreservesPendingException: true,
      cRuntimeValueExpression: '$value.raw()',
      cRuntimeValueValidExpression: '$value.valid()',
      cValidExpression: '$value.valid()'
    }
  ],
  operations,
  intrinsicBindings: [],
  runtimeRequirements: [
    {
      id: runtimeRequirement,
      dependencies: ['callback-values', 'managed-values', 'objects', 'string-bytes'],
      cPreludeIncludes: ['inox/events.h'],
      capabilities: []
    }
  ]
}

function eventEmitterConstructor(): LibraryOperationDescriptor {
  return {
    libraryId,
    bindingId: namedBinding('EventEmitter'),
    bindingAliases: [defaultBinding('EventEmitter')],
    operationId: `${eventEmitterTypeId}.construct`,
    kind: 'construct',
    runtimeRequirements,
    cExpression: 'EventEmitter::create',
    cArgumentKinds: [],
    cCallStyle: 'function',
    cFailureMode: 'thrown',
    minArgs: 0,
    maxArgs: 0,
    argumentChecks: [],
    resultTypeRef: eventEmitterTypeRef
  }
}

function listenerOperation(
  name: 'addListener' | 'off' | 'on' | 'once' | 'removeListener'
): LibraryOperationDescriptor {
  const canThrow = name === 'addListener' || name === 'on' || name === 'once'

  return {
    ...receiverOperation(name, canThrow),
    cArgumentKinds: ['receiver', 'string-view', 'runtime-callback'],
    cArgumentSources: [null, null, { argumentIndex: 1 }],
    cResultMode: 'borrowed',
    minArgs: 2,
    maxArgs: 2,
    argumentChecks: [stringArgument(), callbackArgument()],
    resultTypeRef: eventEmitterBorrowedTypeRef,
    callbackLifetime: 'event-loop'
  }
}

function emitOperation(): LibraryOperationDescriptor {
  return {
    ...receiverOperation('emit'),
    cArgumentKinds: ['receiver', 'variadic-runtime-value-array', 'variadic-count'],
    minArgs: 1,
    maxArgs: null,
    argumentChecks: [stringArgument(), unknownArgument()],
    resultTypeRef: booleanTypeRef
  }
}

function listenerCountOperation(): LibraryOperationDescriptor {
  return {
    ...receiverOperation('listenerCount', false),
    cArgumentKinds: ['receiver', 'string-view'],
    minArgs: 1,
    maxArgs: 1,
    argumentChecks: [stringArgument()],
    resultTypeRef: numberTypeRef
  }
}

function removeAllListenersOperation(): LibraryOperationDescriptor {
  return {
    ...receiverOperation('removeAllListeners', false),
    cArgumentKinds: ['receiver', 'optional-string-view', 'argument-presence'],
    cResultMode: 'borrowed',
    minArgs: 0,
    maxArgs: 1,
    argumentChecks: [stringArgument()],
    resultTypeRef: eventEmitterBorrowedTypeRef
  }
}

function receiverOperation(name: string, canThrow: boolean = true): LibraryOperationDescriptor {
  return {
    libraryId,
    bindingId: `${eventEmitterTypeId}.${name}`,
    operationId: `${eventEmitterTypeId}.${name}`,
    kind: 'call',
    runtimeRequirements,
    receiverTypeId: eventEmitterTypeId,
    cExpression: name,
    cCallStyle: 'member',
    cFailureMode: canThrow ? 'thrown' : null
  }
}

function receiverDiagnosticOperation(name: string): LibraryOperationDescriptor {
  return {
    libraryId,
    bindingId: `${eventEmitterTypeId}.${name}`,
    operationId: `${eventEmitterTypeId}.${name}`,
    kind: 'call',
    runtimeRequirements: [],
    receiverTypeId: eventEmitterTypeId,
    cExpression: null,
    diagnosticCode: 'INOX_NOT_IMPLEMENTED',
    diagnosticMessage: `${libraryId} EventEmitter.${name} is not implemented by the current C++ backend`
  }
}

function stringArgument(): { valueTypes: string[] } {
  return { valueTypes: ['string'] }
}

function callbackArgument(): { valueTypes: string[] } {
  return { valueTypes: ['function'] }
}

function unknownArgument(): { valueTypes: string[]; typeRef: UnknownTypeRef } {
  return { valueTypes: [], typeRef: unknownTypeRef() }
}

function nominalTypeRef(ownership: 'borrowed' | 'value'): TypeRef {
  return {
    kind: 'nominal',
    typeId: eventEmitterTypeId,
    args: [],
    nullable: false,
    ownership,
    traits: []
  }
}

function primitiveTypeRef(name: 'boolean' | 'number'): PrimitiveTypeRef {
  return {
    kind: 'primitive',
    name,
    nullable: false,
    ownership: 'value',
    traits: []
  }
}

function unknownTypeRef(): UnknownTypeRef {
  return {
    kind: 'unknown',
    nullable: true,
    ownership: 'value',
    traits: []
  }
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
    bindingId: namedBinding(name),
    bindingAliases: [defaultBinding(name)],
    operationId: `${libraryId}#${name}.${operationKindSuffix(kind)}`,
    kind,
    runtimeRequirements: [],
    cExpression: null,
    diagnosticCode: 'INOX_NOT_IMPLEMENTED',
    diagnosticMessage: `${libraryId} ${name} is not implemented by the current C++ backend: ${reason}`
  }
}

function namedBinding(name: string): string {
  return `${libraryId}#module:${libraryId}:${name}`
}

function defaultBinding(name: string): string {
  return `${libraryId}#module:${libraryId}:default.${name}`
}

function operationKindSuffix(kind: LibraryOperationKind): string {
  if (kind === 'member-read') return 'read'
  if (kind === 'member-write') return 'write'
  return kind
}
