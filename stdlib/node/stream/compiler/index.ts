import type {
  CompilerLibraryPackageDescriptor,
  LibraryArgumentCheckDescriptor,
  LibraryCArgumentKind,
  LibraryOperationDescriptor,
  LibraryOperationKind,
  LibraryOperationVariantDescriptor,
  LibraryResultShapeFieldDescriptor,
  TypeRef
} from '../../../../compiler/extensions/types.ts'

const libraryId = 'node:stream'
const runtimeRequirement = libraryId
const runtimeRequirements = [runtimeRequirement]
const streamTypeId = `${libraryId}#Stream`
const readableTypeId = `${libraryId}#Readable`
const writableTypeId = `${libraryId}#Writable`
const duplexTypeId = `${libraryId}#Duplex`
const transformTypeId = `${libraryId}#Transform`
const passThroughTypeId = `${libraryId}#PassThrough`
const bufferTypeId = 'node:buffer#Buffer'
const uint8ArrayTypeId = 'global:binary#Uint8Array'
const streamBorrowedTypeRef = nominalTypeRef(streamTypeId, 'borrowed')
const readableBorrowedTypeRef = nominalTypeRef(readableTypeId, 'borrowed')
const writableBorrowedTypeRef = nominalTypeRef(writableTypeId, 'borrowed')
const passThroughTypeRef = nominalTypeRef(passThroughTypeId, 'value')
const passThroughBorrowedTypeRef = nominalTypeRef(passThroughTypeId, 'borrowed')
const booleanTypeRef = primitiveTypeRef('boolean')
const numberTypeRef = primitiveTypeRef('number')
const streamFields = [booleanField('destroyed', 'destroyed')]
const readableFields = [
  ...streamFields,
  booleanField('readable', 'readable'),
  booleanField('readableEnded', 'readableEnded'),
  numberField('readableLength', 'readableLength')
]
const writableFields = [
  ...streamFields,
  booleanField('writable', 'writable'),
  booleanField('writableEnded', 'writableEnded'),
  numberField('writableLength', 'writableLength')
]
const operations: LibraryOperationDescriptor[] = [
  passThroughConstructor(),
  streamEventOperation('on'),
  streamEventOperation('once'),
  streamEventOperation('on', passThroughTypeId, passThroughBorrowedTypeRef),
  streamEventOperation('once', passThroughTypeId, passThroughBorrowedTypeRef),
  streamBorrowedOperation(streamTypeId, 'destroy', streamBorrowedTypeRef),
  pipeOperation(),
  streamBorrowedOperation(readableTypeId, 'pause', readableBorrowedTypeRef),
  streamBorrowedOperation(readableTypeId, 'resume', readableBorrowedTypeRef),
  streamResultOperation(readableTypeId, 'isPaused', booleanTypeRef),
  writeOperation(),
  endOperation(),
  unsupportedReceiverOperation(readableTypeId, 'read'),
  ...unsupportedModuleOperations()
]

export const compilerLibraryPackage: CompilerLibraryPackageDescriptor = {
  id: libraryId,
  dependencies: ['node:buffer'],
  nativeTypes: [
    nativeType(streamTypeId, ['Stream'], 'Stream', [], streamFields),
    nativeType(readableTypeId, ['Readable'], 'Readable', [streamTypeId], readableFields.slice(1)),
    nativeType(writableTypeId, ['Writable'], 'Writable', [streamTypeId], writableFields.slice(1)),
    nativeType(duplexTypeId, ['Duplex'], 'Duplex', [readableTypeId, writableTypeId]),
    nativeType(transformTypeId, ['Transform'], 'Transform', [duplexTypeId]),
    nativeType(passThroughTypeId, ['PassThrough'], 'PassThrough', [transformTypeId])
  ],
  operations,
  intrinsicBindings: [],
  runtimeRequirements: [
    {
      id: runtimeRequirement,
      dependencies: ['callback-values', 'managed-values', 'node:buffer', 'objects', 'string-bytes'],
      cPreludeIncludes: ['inox/stream.h'],
      capabilities: []
    }
  ]
}

function passThroughConstructor(): LibraryOperationDescriptor {
  return {
    libraryId,
    bindingId: namedBinding('PassThrough'),
    bindingAliases: [defaultBinding('PassThrough')],
    operationId: `${libraryId}#PassThrough.construct`,
    kind: 'construct',
    runtimeRequirements,
    cExpression: 'PassThrough::create',
    cArgumentKinds: [],
    cCallStyle: 'function',
    cFailureMode: 'thrown',
    minArgs: 0,
    maxArgs: 0,
    argumentChecks: [],
    resultTypeRef: passThroughTypeRef
  }
}

function streamEventOperation(
  name: 'on' | 'once',
  receiverTypeId: string = streamTypeId,
  resultTypeRef: TypeRef = streamBorrowedTypeRef
): LibraryOperationDescriptor {
  return {
    ...receiverOperation(receiverTypeId, name),
    cArgumentKinds: ['receiver', 'string-view', 'runtime-callback'],
    cArgumentSources: [null, null, { argumentIndex: 1 }],
    cResultMode: 'borrowed',
    minArgs: 2,
    maxArgs: 2,
    argumentChecks: [streamEventArgument(), callbackArgument()],
    variants: [
      eventVariant(name, ['data'], dataCallbackArgument()),
      eventVariant(name, ['close', 'drain', 'end', 'finish'], callbackArgument()),
      eventVariant(name, ['error'], errorCallbackArgument())
    ],
    resultTypeRef,
    callbackLifetime: 'event-loop'
  }
}

function pipeOperation(): LibraryOperationDescriptor {
  return {
    ...receiverOperation(streamTypeId, 'pipe'),
    cArgumentKinds: ['receiver', 'value'],
    cArgumentAdapters: ['Stream(inox::Value($value))'],
    cArgumentAdapterTypeIds: [writableTypeId],
    cResultMode: 'value',
    minArgs: 1,
    maxArgs: 1,
    argumentChecks: [{ valueTypes: ['object'], objectTypeIds: [writableTypeId] }],
    resultTypeRef: writableBorrowedTypeRef
  }
}

function writeOperation(): LibraryOperationDescriptor {
  return {
    ...receiverOperation(writableTypeId, 'write'),
    cArgumentKinds: ['receiver', 'string-view'],
    minArgs: 1,
    maxArgs: 2,
    argumentChecks: [chunkArgument(), callbackArgument()],
    variants: [
      chunkVariant('write', 'string', false),
      chunkVariant('write', 'bytes', false),
      chunkVariant('write', 'string', true),
      chunkVariant('write', 'bytes', true)
    ],
    resultTypeRef: booleanTypeRef
  }
}

function endOperation(): LibraryOperationDescriptor {
  return {
    ...receiverOperation(writableTypeId, 'end'),
    cArgumentKinds: ['receiver'],
    cResultMode: 'borrowed',
    minArgs: 0,
    maxArgs: 2,
    argumentChecks: [chunkOrCallbackArgument(), callbackArgument()],
    variants: [
      memberVariant(0, 0, ['receiver'], 'end'),
      memberVariant(1, 1, ['receiver', 'runtime-callback'], 'end', {
        argumentIndex: 0,
        argumentValueTypes: ['function'],
        cArgumentSources: [null, { argumentIndex: 0 }],
        callbackLifetime: 'event-loop'
      }),
      chunkVariant('end', 'string', false),
      chunkVariant('end', 'bytes', false),
      chunkVariant('end', 'string', true),
      chunkVariant('end', 'bytes', true)
    ],
    resultTypeRef: writableBorrowedTypeRef
  }
}

function chunkVariant(
  expression: 'end' | 'write',
  valueType: 'bytes' | 'string',
  callback: boolean
): LibraryOperationVariantDescriptor {
  const cArgumentKinds: LibraryCArgumentKind[] = ['receiver', valueType === 'string' ? 'string-view' : 'value']
  const cArgumentAdapters = [valueType === 'bytes' ? 'Uint8Array(inox::Value($value))' : '']
  const cArgumentAdapterTypeIds = [valueType === 'bytes' ? uint8ArrayTypeId : '']
  const cArgumentSources: Array<{ argumentIndex: number } | null> = [null, null]

  if (callback) {
    cArgumentKinds.push('runtime-callback')
    cArgumentAdapters.push('')
    cArgumentAdapterTypeIds.push('')
    cArgumentSources.push({ argumentIndex: 1 })
  }

  return {
    minArgs: callback ? 2 : 1,
    maxArgs: callback ? 2 : 1,
    argumentIndex: 0,
    argumentValueTypes: [valueType],
    cExpression: expression,
    cArgumentKinds,
    cArgumentAdapters,
    cArgumentAdapterTypeIds,
    cArgumentSources,
    cResultMode: expression === 'end' ? 'borrowed' : null,
    callbackLifetime: callback ? 'event-loop' : null
  }
}

function streamBorrowedOperation(receiverTypeId: string, name: string, resultTypeRef: TypeRef) {
  return {
    ...streamResultOperation(receiverTypeId, name, resultTypeRef),
    cResultMode: 'borrowed' as const
  }
}

function streamResultOperation(
  receiverTypeId: string,
  name: string,
  resultTypeRef: TypeRef
): LibraryOperationDescriptor {
  return {
    ...receiverOperation(receiverTypeId, name),
    cArgumentKinds: ['receiver'],
    minArgs: 0,
    maxArgs: 0,
    argumentChecks: [],
    resultTypeRef
  }
}

function receiverOperation(receiverTypeId: string, name: string): LibraryOperationDescriptor {
  return {
    libraryId,
    bindingId: `${receiverTypeId}.${name}`,
    operationId: `${receiverTypeId}#${name}`,
    kind: 'call',
    runtimeRequirements,
    receiverTypeId,
    cExpression: name,
    cCallStyle: 'member',
    cFailureMode: 'thrown'
  }
}

function eventVariant(
  expression: 'on' | 'once',
  eventNames: string[],
  callback: LibraryArgumentCheckDescriptor
): LibraryOperationVariantDescriptor {
  return memberVariant(2, 2, ['receiver', 'string-view', 'runtime-callback'], expression, {
    argumentIndex: 0,
    stringLiterals: eventNames,
    argumentChecks: [
      {
        valueTypes: ['string'],
        stringLiterals: eventNames,
        literalDiagnosticCode: 'INOX_STREAM_EVENT',
        literalDiagnosticMessage: 'node:stream does not support this event'
      },
      callback
    ],
    cArgumentSources: [null, null, { argumentIndex: 1 }],
    callbackLifetime: 'event-loop'
  })
}

type VariantOptions = {
  argumentChecks?: LibraryArgumentCheckDescriptor[]
  argumentIndex?: number
  argumentValueTypes?: string[]
  stringLiterals?: string[]
  cArgumentSources?: Array<{ argumentIndex: number } | null>
  callbackLifetime?: 'call' | 'event-loop'
}

function memberVariant(
  minArgs: number,
  maxArgs: number,
  cArgumentKinds: LibraryCArgumentKind[],
  cExpression: string,
  options: VariantOptions = {}
): LibraryOperationVariantDescriptor {
  return {
    minArgs,
    maxArgs,
    argumentIndex: options.argumentIndex,
    argumentValueTypes: options.argumentValueTypes,
    stringLiterals: options.stringLiterals,
    argumentChecks: options.argumentChecks,
    cExpression,
    cArgumentKinds,
    cArgumentSources: options.cArgumentSources,
    cResultMode: 'borrowed',
    callbackLifetime: options.callbackLifetime
  }
}

function unsupportedModuleOperations(): LibraryOperationDescriptor[] {
  const operations: LibraryOperationDescriptor[] = []

  for (const name of ['Duplex', 'Readable', 'Stream', 'Transform', 'Writable']) {
    operations.push(unsupportedOperation(name, 'member-read'))
    operations.push(unsupportedOperation(name, 'construct'))
  }

  for (const name of ['finished', 'pipeline']) {
    operations.push(unsupportedOperation(name, 'member-read'))
    operations.push(unsupportedOperation(name, 'call'))
  }

  operations.push(unsupportedOperation('promises', 'member-read'))

  for (const name of ['promises.finished', 'promises.pipeline']) {
    operations.push(unsupportedOperation(name, 'member-read'))
    operations.push(unsupportedOperation(name, 'call'))
  }

  return operations
}

function unsupportedReceiverOperation(receiverTypeId: string, name: string): LibraryOperationDescriptor {
  return {
    libraryId,
    bindingId: `${receiverTypeId}.${name}`,
    operationId: `${receiverTypeId}#${name}.unsupported`,
    kind: 'call',
    runtimeRequirements: [],
    receiverTypeId,
    cExpression: null,
    diagnosticCode: 'INOX_NOT_IMPLEMENTED',
    diagnosticMessage: `node:stream ${name} is not implemented by the current C++ backend`
  }
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
    diagnosticMessage: `${libraryId} ${name} is not implemented by the current C++ backend: ${unsupportedReason(name)}`
  }
}

function nativeType(
  typeId: string,
  declarationNames: string[],
  cppType: string,
  baseTypeIds: string[],
  fields: LibraryResultShapeFieldDescriptor[] = []
) {
  return {
    libraryId,
    typeId,
    declarationNames,
    valueType: 'object',
    cppType,
    baseTypeIds,
    runtimeRequirements,
    cValueAdapter: `${cppType}(inox::Value($value))`,
    cValueAdapterFailureMode: 'thrown' as const,
    cValueAdapterPreservesPendingException: true,
    cRuntimeValueExpression: '$value.raw()',
    cRuntimeValueValidExpression: '$value.valid()',
    cValidExpression: '$value.valid()',
    fields
  }
}

function booleanField(name: string, cGetter: string) {
  return { name, valueType: 'boolean', readonly: true, cGetter, cppType: 'bool' }
}

function numberField(name: string, cGetter: string) {
  return { name, valueType: 'number', readonly: true, cGetter, cppType: 'double' }
}

function streamEventArgument(): LibraryArgumentCheckDescriptor {
  return {
    valueTypes: ['string'],
    stringLiterals: ['close', 'data', 'drain', 'end', 'error', 'finish'],
    literalDiagnosticCode: 'INOX_STREAM_EVENT',
    literalDiagnosticMessage: 'node:stream does not support this event'
  }
}

function chunkArgument(): LibraryArgumentCheckDescriptor {
  return { valueTypes: ['string', 'bytes'], objectTypeIds: [bufferTypeId, uint8ArrayTypeId] }
}

function chunkOrCallbackArgument(): LibraryArgumentCheckDescriptor {
  return { ...chunkArgument(), valueTypes: ['string', 'bytes', 'function'] }
}

function callbackArgument(): LibraryArgumentCheckDescriptor {
  return {
    valueTypes: ['function'],
    functionParameters: [],
    functionReturnType: 'void'
  }
}

function dataCallbackArgument(): LibraryArgumentCheckDescriptor {
  return {
    valueTypes: ['function'],
    functionParameters: [
      {
        name: 'chunk',
        valueType: 'bytes',
        typeRef: nominalTypeRef(bufferTypeId, 'value'),
        resultTypeId: bufferTypeId
      }
    ],
    functionReturnType: 'void'
  }
}

function errorCallbackArgument(): LibraryArgumentCheckDescriptor {
  return {
    valueTypes: ['function'],
    functionParameters: [
      {
        name: 'error',
        valueType: 'object',
        shapeFields: [{ name: 'message', valueType: 'string', readonly: true }]
      }
    ],
    functionReturnType: 'void'
  }
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

function primitiveTypeRef(name: 'boolean' | 'number'): TypeRef {
  return {
    kind: 'primitive',
    name,
    nullable: false,
    ownership: 'value',
    traits: []
  }
}

function operationId(name: string, kind: LibraryOperationKind): string {
  return kind === 'member-read' ? `${libraryId}#${name}.read` : `${libraryId}#${name}.${kind}`
}

function namedBinding(name: string): string {
  return `${libraryId}#module:${libraryId}:${name}`
}

function defaultBinding(name: string): string {
  return `${libraryId}#module:${libraryId}:default.${name}`
}

function unsupportedReason(name: string): string {
  if (name === 'Readable' || name === 'Writable' || name === 'Duplex' || name === 'Transform') {
    return 'custom stream hooks and constructor options are not implemented by the current C++ backend'
  }

  if (name === 'pipeline' || name === 'promises.pipeline') {
    return 'stream pipeline orchestration is not implemented by the current C++ backend'
  }

  if (name === 'finished' || name === 'promises.finished') {
    return 'stream completion tracking is not implemented by the current C++ backend'
  }

  return 'this stream export is not implemented by the current C++ backend'
}
