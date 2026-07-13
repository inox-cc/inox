import type {
  CompilerLibraryPackageDescriptor,
  LibraryArgumentCheckDescriptor,
  LibraryCArgumentKind,
  LibraryOperationDescriptor,
  LibraryOperationVariantDescriptor
} from '../../../../compiler/extensions/types.ts'

const libraryId = 'global:binary'
const runtimeRequirement = libraryId
const uint8ArrayTypeId = `${libraryId}#Uint8Array`

const operations: LibraryOperationDescriptor[] = [
  uint8ArrayConstructor(),
  receiverMemberRead('length', 'length', 'double', 'number'),
  receiverIndexRead(),
  receiverIndexWrite(),
  receiverCall(
    'slice',
    ['receiver', 'number', 'optional-number'],
    'slice',
    'Uint8Array',
    'bytes',
    1,
    2,
    [numberArgument(), numberArgument()],
    uint8ArrayTypeId
  ),
  receiverCall('toString', ['receiver'], 'toString', 'inox::String', 'string', 0, 0, [])
]

export const compilerLibraryPackage: CompilerLibraryPackageDescriptor = {
  id: libraryId,
  dependencies: ['global:collections'],
  nativeTypes: [
    {
      libraryId,
      typeId: uint8ArrayTypeId,
      declarationNames: ['Uint8Array'],
      valueType: 'bytes',
      cppType: 'Uint8Array',
      baseTypeIds: [],
      runtimeRequirements: [runtimeRequirement]
    }
  ],
  operations,
  intrinsicBindings: [],
  runtimeRequirements: [
    {
      id: runtimeRequirement,
      dependencies: ['collections', 'managed-values', 'string-bytes'],
      cPreludeIncludes: ['inox/binary.h'],
      capabilities: []
    }
  ]
}

function uint8ArrayConstructor(): LibraryOperationDescriptor {
  return {
    libraryId,
    bindingId: 'global:Uint8Array',
    operationId: `${uint8ArrayTypeId}#construct`,
    kind: 'construct',
    runtimeRequirements: [runtimeRequirement],
    cFailureMode: 'thrown',
    minArgs: 1,
    maxArgs: 1,
    argumentChecks: [
      {
        valueTypes: ['number', 'array'],
        arrayLiteralRequired: true,
        arrayElementValueTypes: ['number']
      }
    ],
    variants: [
      constructorVariant('number', ['number']),
      constructorVariant('array', ['value'])
    ],
    resultTypeId: uint8ArrayTypeId,
    cppType: 'Uint8Array',
    valueType: 'bytes',
    nullable: false,
    owned: false
  }
}

function constructorVariant(
  valueType: string,
  cArgumentKinds: LibraryCArgumentKind[]
): LibraryOperationVariantDescriptor {
  return {
    minArgs: 1,
    maxArgs: 1,
    argumentIndex: 0,
    argumentValueTypes: [valueType],
    cExpression: 'Uint8Array',
    cArgumentKinds,
    cResultMode: 'value',
    resultTypeId: uint8ArrayTypeId,
    cppType: 'Uint8Array',
    valueType: 'bytes',
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
    operationId: `${uint8ArrayTypeId}#read:${name}`,
    kind: 'member-read',
    runtimeRequirements: [runtimeRequirement],
    receiverTypeId: uint8ArrayTypeId,
    cExpression,
    cArgumentKinds: ['receiver'],
    cReceiverAdapter: 'Uint8Array($value)',
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
    operationId: `${uint8ArrayTypeId}#${name}`,
    kind: 'call',
    runtimeRequirements: [runtimeRequirement],
    receiverTypeId: uint8ArrayTypeId,
    cExpression,
    cArgumentKinds,
    cReceiverAdapter: 'Uint8Array($value)',
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

function receiverIndexRead(): LibraryOperationDescriptor {
  return {
    libraryId,
    bindingId: receiverBinding('*'),
    operationId: `${uint8ArrayTypeId}#index-read`,
    kind: 'index-read',
    runtimeRequirements: [runtimeRequirement],
    receiverTypeId: uint8ArrayTypeId,
    cExpression: 'operator[]',
    cArgumentKinds: ['receiver', 'number'],
    cReceiverAdapter: 'Uint8Array($value)',
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
    operationId: `${uint8ArrayTypeId}#index-write`,
    kind: 'index-write',
    runtimeRequirements: [runtimeRequirement],
    receiverTypeId: uint8ArrayTypeId,
    cExpression: 'operator[]',
    cArgumentKinds: ['receiver', 'number', 'number'],
    cReceiverAdapter: 'Uint8Array($value)',
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

function numberArgument(): LibraryArgumentCheckDescriptor {
  return { valueTypes: ['number'] }
}

function receiverBinding(name: string): string {
  return `${uint8ArrayTypeId}.${name}`
}
