import type {
  CompilerLibraryPackageDescriptor,
  LibraryArgumentCheckDescriptor,
  LibraryCArgumentKind,
  LibraryCResultMappingDescriptor,
  LibraryOperationDescriptor,
  LibraryOperationKind,
  LibraryOperationVariantDescriptor,
  NominalTypeRef,
  PrimitiveTypeRef,
  TypeRef
} from '../../../../compiler/extensions/types.ts'

const libraryId = 'node:buffer'
const binaryLibraryId = 'global:binary'
const runtimeRequirement = libraryId
const uint8ArrayTypeId = `${binaryLibraryId}#Uint8Array`
const bufferTypeId = `${libraryId}#Buffer`
const bufferTypeRef: NominalTypeRef = {
  kind: 'nominal',
  typeId: bufferTypeId,
  args: [],
  nullable: false,
  ownership: 'value',
  traits: []
}
const booleanTypeRef: PrimitiveTypeRef = primitiveTypeRef('boolean')
const numberTypeRef: PrimitiveTypeRef = primitiveTypeRef('number')
const nullableNumberTypeRef: PrimitiveTypeRef = {
  ...numberTypeRef,
  nullable: true
}
const stringTypeRef: PrimitiveTypeRef = primitiveTypeRef('string')
const stringCResultMapping: LibraryCResultMappingDescriptor = {
  cppType: 'inox::String',
  fields: []
}

const operations: LibraryOperationDescriptor[] = [
  bufferFromOperation(),
  staticCall('alloc', ['number'], 'Buffer::alloc', bufferTypeRef, null, 1, 1, [numberArgument()]),
  {
    ...staticCall('isBuffer', ['value'], 'Buffer::isBuffer', booleanTypeRef, null, 1, 1, []),
    cFailureMode: null
  },
  constantOperation(),
  receiverMemberRead('length', 'length', numberTypeRef, null),
  receiverIndexRead(),
  receiverIndexWrite(),
  receiverCall('slice', ['receiver', 'number', 'optional-number'], 'slice', bufferTypeRef, null, 1, 2, [
    numberArgument(),
    numberArgument()
  ]),
  bufferToStringOperation(),
  ...unsupportedCalls().map((name) => unsupportedOperation(name, 'call')),
  ...unsupportedConstructors().map((name) => unsupportedOperation(name, 'construct')),
  ...unsupportedProperties().map((name) => unsupportedOperation(name, 'member-read'))
]

export const compilerLibraryPackage: CompilerLibraryPackageDescriptor = {
  id: libraryId,
  dependencies: [binaryLibraryId],
  nativeTypes: [
    {
      libraryId,
      typeId: bufferTypeId,
      declarationNames: ['Buffer'],
      valueType: 'bytes',
      cppType: 'Buffer',
      baseTypeIds: [uint8ArrayTypeId],
      runtimeRequirements: [binaryLibraryId, runtimeRequirement],
      cValueAdapter: 'Buffer($value)',
      cRuntimeValueExpression: '$value.raw()',
      cRuntimeValueValidExpression: 'Buffer(inox::Value($value)).valid()'
    }
  ],
  operations,
  intrinsicBindings: [],
  runtimeRequirements: [
    {
      id: runtimeRequirement,
      dependencies: [binaryLibraryId],
      cPreludeIncludes: ['inox/buffer.h'],
      capabilities: []
    }
  ]
}

function bufferFromOperation(): LibraryOperationDescriptor {
  return {
    ...staticCall('from', ['string-view'], 'Buffer::from', bufferTypeRef, null, 1, 2, [
      stringArgument(),
      utf8Argument('Buffer.from')
    ]),
    variants: [staticVariant(1, 1, ['string-view']), staticVariant(2, 2, ['string-view', 'string-view'])]
  }
}

function bufferToStringOperation(): LibraryOperationDescriptor {
  return {
    ...receiverCall('toString', ['receiver'], 'toString', stringTypeRef, stringCResultMapping, 0, 1, [
      utf8Argument('Buffer.toString')
    ]),
    variants: [receiverVariant(0, 0, ['receiver']), receiverVariant(1, 1, ['receiver', 'string-view'])]
  }
}

function staticCall(
  name: string,
  cArgumentKinds: LibraryCArgumentKind[],
  cExpression: string,
  resultTypeRef: TypeRef,
  cResultMapping: LibraryCResultMappingDescriptor | null,
  minArgs: number,
  maxArgs: number,
  argumentChecks: LibraryArgumentCheckDescriptor[]
): LibraryOperationDescriptor {
  return {
    libraryId,
    bindingId: `global:Buffer.${name}`,
    bindingAliases: staticBindingAliases(name),
    operationId: `${libraryId}#Buffer.${name}`,
    kind: 'call',
    runtimeRequirements: [runtimeRequirement],
    cExpression,
    cArgumentKinds,
    cResultMode: resultTypeRef.kind === 'nominal' ? 'value' : null,
    cFailureMode: 'thrown',
    minArgs,
    maxArgs,
    argumentChecks,
    resultTypeRef,
    cResultMapping
  }
}

function staticVariant(
  minArgs: number,
  maxArgs: number,
  cArgumentKinds: LibraryCArgumentKind[]
): LibraryOperationVariantDescriptor {
  return {
    minArgs,
    maxArgs,
    cExpression: 'Buffer::from',
    cArgumentKinds,
    cResultMode: 'value'
  }
}

function receiverMemberRead(
  name: string,
  cExpression: string,
  resultTypeRef: TypeRef,
  cResultMapping: LibraryCResultMappingDescriptor | null
): LibraryOperationDescriptor {
  return {
    libraryId,
    bindingId: receiverBinding(name),
    operationId: `${bufferTypeId}#read:${name}`,
    kind: 'member-read',
    runtimeRequirements: [runtimeRequirement],
    receiverTypeId: bufferTypeId,
    cExpression,
    cArgumentKinds: ['receiver'],
    cReceiverAdapter: 'Buffer($value)',
    cCallStyle: 'member',
    cFailureMode: null,
    resultTypeRef,
    cResultMapping
  }
}

function receiverCall(
  name: string,
  cArgumentKinds: LibraryCArgumentKind[],
  cExpression: string,
  resultTypeRef: TypeRef,
  cResultMapping: LibraryCResultMappingDescriptor | null,
  minArgs: number,
  maxArgs: number,
  argumentChecks: LibraryArgumentCheckDescriptor[]
): LibraryOperationDescriptor {
  return {
    libraryId,
    bindingId: receiverBinding(name),
    operationId: `${bufferTypeId}#${name}`,
    kind: 'call',
    runtimeRequirements: [runtimeRequirement],
    receiverTypeId: bufferTypeId,
    cExpression,
    cArgumentKinds,
    cReceiverAdapter: 'Buffer($value)',
    cResultMode: resultTypeRef.kind === 'nominal' ? 'value' : null,
    cCallStyle: 'member',
    cFailureMode: 'thrown',
    minArgs,
    maxArgs,
    argumentChecks,
    resultTypeRef,
    cResultMapping
  }
}

function receiverVariant(
  minArgs: number,
  maxArgs: number,
  cArgumentKinds: LibraryCArgumentKind[]
): LibraryOperationVariantDescriptor {
  return {
    minArgs,
    maxArgs,
    cExpression: 'toString',
    cArgumentKinds,
    cReceiverAdapter: 'Buffer($value)'
  }
}

function receiverIndexRead(): LibraryOperationDescriptor {
  return {
    libraryId,
    bindingId: receiverBinding('*'),
    operationId: `${bufferTypeId}#index-read`,
    kind: 'index-read',
    runtimeRequirements: [runtimeRequirement],
    receiverTypeId: bufferTypeId,
    cExpression: 'get',
    cArgumentKinds: ['receiver', 'number'],
    cReceiverAdapter: 'Buffer($value)',
    cCallStyle: 'member',
    cFailureMode: null,
    cResultMapping: { cppType: 'inox::Value', fields: [] },
    minArgs: 1,
    maxArgs: 1,
    argumentChecks: [numberArgument()],
    resultTypeRef: nullableNumberTypeRef
  }
}

function receiverIndexWrite(): LibraryOperationDescriptor {
  return {
    libraryId,
    bindingId: receiverBinding('*'),
    operationId: `${bufferTypeId}#index-write`,
    kind: 'index-write',
    runtimeRequirements: [runtimeRequirement],
    receiverTypeId: bufferTypeId,
    cExpression: 'set',
    cArgumentKinds: ['receiver', 'number', 'number'],
    cReceiverAdapter: 'Buffer($value)',
    cCallStyle: 'member',
    cFailureMode: null,
    minArgs: 2,
    maxArgs: 2,
    argumentChecks: [numberArgument(), numberArgument()],
    resultTypeRef: numberTypeRef
  }
}

function constantOperation(): LibraryOperationDescriptor {
  return {
    libraryId,
    bindingId: moduleBinding('constants.MAX_LENGTH'),
    bindingAliases: [defaultBinding('constants.MAX_LENGTH'), namedModuleObjectBinding('constants.MAX_LENGTH')],
    operationId: `${libraryId}#constants.MAX_LENGTH`,
    kind: 'member-read',
    runtimeRequirements: [runtimeRequirement],
    cExpression: 'buffer.constants.MAX_LENGTH',
    resultTypeRef: numberTypeRef
  }
}

function unsupportedOperation(name: string, kind: LibraryOperationKind): LibraryOperationDescriptor {
  return {
    libraryId,
    bindingId: moduleBinding(name),
    bindingAliases: [defaultBinding(name), namedModuleObjectBinding(name)],
    operationId: `${libraryId}#unsupported:${name}`,
    kind,
    runtimeRequirements: [],
    cExpression: null,
    diagnosticCode: 'INOX_NOT_IMPLEMENTED',
    diagnosticMessage: `node:buffer ${name} is not implemented by the current C++ backend`
  }
}

function numberArgument(): LibraryArgumentCheckDescriptor {
  return { valueTypes: ['number'] }
}

function stringArgument(): LibraryArgumentCheckDescriptor {
  return { valueTypes: ['string'] }
}

function utf8Argument(label: string): LibraryArgumentCheckDescriptor {
  return {
    valueTypes: ['string'],
    stringLiterals: ['utf8'],
    literalDiagnosticCode: 'INOX_TYPE_MISMATCH',
    literalDiagnosticMessage: `${label} encoding must be 'utf8' in the MVP`
  }
}

function primitiveTypeRef(name: 'boolean' | 'number' | 'string'): PrimitiveTypeRef {
  return {
    kind: 'primitive',
    name,
    nullable: false,
    ownership: 'value',
    traits: []
  }
}

function staticBindingAliases(name: string): string[] {
  return [moduleBinding(`Buffer.${name}`), defaultBinding(`Buffer.${name}`), namedModuleObjectBinding(`Buffer.${name}`)]
}

function moduleBinding(path: string): string {
  return `${libraryId}#module:${libraryId}:${path}`
}

function defaultBinding(path: string): string {
  return `${libraryId}#module:${libraryId}:default.${path}`
}

function namedModuleObjectBinding(path: string): string {
  return `${libraryId}#module:${libraryId}:buffer.${path}`
}

function receiverBinding(name: string): string {
  return `${bufferTypeId}.${name}`
}

function unsupportedCalls(): string[] {
  return ['atob', 'btoa', 'isAscii', 'isUtf8', 'resolveObjectURL', 'transcode']
}

function unsupportedConstructors(): string[] {
  return ['Blob', 'File']
}

function unsupportedProperties(): string[] {
  return ['constants.MAX_STRING_LENGTH', 'kMaxLength', 'kStringMaxLength']
}
