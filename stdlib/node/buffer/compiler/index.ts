import type {
  CompilerLibraryPackageDescriptor,
  LibraryArgumentCheckDescriptor,
  LibraryCArgumentKind,
  LibraryOperationDescriptor,
  LibraryOperationKind,
  LibraryOperationVariantDescriptor
} from '../../../../compiler/extensions/types.ts'

const libraryId = 'node:buffer'
const binaryLibraryId = 'global:binary'
const runtimeRequirement = libraryId
const uint8ArrayTypeId = `${binaryLibraryId}#Uint8Array`
const bufferTypeId = `${libraryId}#Buffer`

const operations: LibraryOperationDescriptor[] = [
  bufferFromOperation(),
  staticCall('alloc', ['number'], 'Buffer::alloc', 'Buffer', 'bytes', 1, 1, [numberArgument()], bufferTypeId),
  staticCall('isBuffer', ['value'], 'Buffer::isBuffer', 'bool', 'boolean', 1, 1, []),
  constantOperation(),
  receiverMemberRead('length', 'length', 'double', 'number'),
  receiverIndexRead(),
  receiverIndexWrite(),
  receiverCall(
    'slice',
    ['receiver', 'number', 'optional-number'],
    'slice',
    'Buffer',
    'bytes',
    1,
    2,
    [numberArgument(), numberArgument()],
    bufferTypeId
  ),
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
      runtimeRequirements: [binaryLibraryId, runtimeRequirement]
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
    ...staticCall(
      'from',
      ['string-view'],
      'Buffer::from',
      'Buffer',
      'bytes',
      1,
      2,
      [stringArgument(), utf8Argument('Buffer.from')],
      bufferTypeId
    ),
    variants: [
      staticVariant(1, 1, ['string-view'], 'Buffer', 'bytes', bufferTypeId),
      staticVariant(2, 2, ['string-view', 'string-view'], 'Buffer', 'bytes', bufferTypeId)
    ]
  }
}

function bufferToStringOperation(): LibraryOperationDescriptor {
  return {
    ...receiverCall(
      'toString',
      ['receiver'],
      'toString',
      'inox::String',
      'string',
      0,
      1,
      [utf8Argument('Buffer.toString')]
    ),
    variants: [
      receiverVariant(0, 0, ['receiver'], 'inox::String', 'string'),
      receiverVariant(1, 1, ['receiver', 'string-view'], 'inox::String', 'string')
    ]
  }
}

function staticCall(
  name: string,
  cArgumentKinds: LibraryCArgumentKind[],
  cExpression: string,
  cppType: string,
  valueType: string,
  minArgs: number,
  maxArgs: number,
  argumentChecks: LibraryArgumentCheckDescriptor[],
  resultTypeId?: string
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
    cResultMode: resultTypeId ? 'value' : null,
    resultTypeId,
    cFailureMode: 'thrown',
    minArgs,
    maxArgs,
    argumentChecks,
    cppType,
    valueType,
    nullable: false,
    owned: false
  }
}

function staticVariant(
  minArgs: number,
  maxArgs: number,
  cArgumentKinds: LibraryCArgumentKind[],
  cppType: string,
  valueType: string,
  resultTypeId?: string
): LibraryOperationVariantDescriptor {
  return {
    minArgs,
    maxArgs,
    cExpression: 'Buffer::from',
    cArgumentKinds,
    cResultMode: resultTypeId ? 'value' : null,
    resultTypeId,
    cppType,
    valueType,
    nullable: false,
    owned: false
  }
}

function receiverMemberRead(
  name: string,
  cExpression: string,
  cppType: string,
  valueType: string
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
    cFailureMode: 'thrown',
    cppType,
    valueType,
    nullable: false,
    owned: false
  }
}

function receiverCall(
  name: string,
  cArgumentKinds: LibraryCArgumentKind[],
  cExpression: string,
  cppType: string,
  valueType: string,
  minArgs: number,
  maxArgs: number,
  argumentChecks: LibraryArgumentCheckDescriptor[],
  resultTypeId?: string
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
    cResultMode: resultTypeId ? 'value' : null,
    resultTypeId,
    cCallStyle: 'member',
    cFailureMode: 'thrown',
    minArgs,
    maxArgs,
    argumentChecks,
    cppType,
    valueType,
    nullable: false,
    owned: false
  }
}

function receiverVariant(
  minArgs: number,
  maxArgs: number,
  cArgumentKinds: LibraryCArgumentKind[],
  cppType: string,
  valueType: string
): LibraryOperationVariantDescriptor {
  return {
    minArgs,
    maxArgs,
    cExpression: 'toString',
    cArgumentKinds,
    cReceiverAdapter: 'Buffer($value)',
    cppType,
    valueType,
    nullable: false,
    owned: false
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
    cExpression: 'operator[]',
    cArgumentKinds: ['receiver', 'number'],
    cReceiverAdapter: 'Buffer($value)',
    cCallStyle: 'index',
    cFailureMode: 'thrown',
    minArgs: 1,
    maxArgs: 1,
    argumentChecks: [numberArgument()],
    cppType: 'double',
    valueType: 'number',
    nullable: false,
    owned: false
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
    cExpression: 'operator[]',
    cArgumentKinds: ['receiver', 'number', 'number'],
    cReceiverAdapter: 'Buffer($value)',
    cCallStyle: 'index-assignment',
    cFailureMode: 'thrown',
    minArgs: 2,
    maxArgs: 2,
    argumentChecks: [numberArgument(), numberArgument()],
    cppType: 'double',
    valueType: 'number',
    nullable: false,
    owned: false
  }
}

function constantOperation(): LibraryOperationDescriptor {
  return {
    libraryId,
    bindingId: moduleBinding('constants.MAX_LENGTH'),
    bindingAliases: [
      defaultBinding('constants.MAX_LENGTH'),
      namedModuleObjectBinding('constants.MAX_LENGTH')
    ],
    operationId: `${libraryId}#constants.MAX_LENGTH`,
    kind: 'member-read',
    runtimeRequirements: [runtimeRequirement],
    cExpression: 'buffer.constants.MAX_LENGTH',
    cppType: 'double',
    valueType: 'number',
    nullable: false,
    owned: false
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
    cppType: null,
    valueType: null,
    owned: false,
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

function staticBindingAliases(name: string): string[] {
  return [
    moduleBinding(`Buffer.${name}`),
    defaultBinding(`Buffer.${name}`),
    namedModuleObjectBinding(`Buffer.${name}`)
  ]
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
  return [
    'atob',
    'btoa',
    'isAscii',
    'isUtf8',
    'resolveObjectURL',
    'transcode'
  ]
}

function unsupportedConstructors(): string[] {
  return ['Blob', 'File']
}

function unsupportedProperties(): string[] {
  return ['constants.MAX_STRING_LENGTH', 'kMaxLength', 'kStringMaxLength']
}
