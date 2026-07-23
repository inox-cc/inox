import type {
  CompilerLibraryPackageDescriptor,
  LibraryArgumentCheckDescriptor,
  LibraryCArgumentKind,
  LibraryCResultMappingDescriptor,
  LibraryCResultMode,
  LibraryOperationDescriptor,
  LibraryOperationVariantDescriptor,
  NominalTypeRef,
  PrimitiveTypeRef,
  TypeRef
} from '../../../../compiler/extensions/types.ts'

const libraryId = 'global:binary'
const collectionsLibraryId = 'global:collections'
const arrayRuntimeRequirement = `${collectionsLibraryId}#array`
const runtimeRequirement = libraryId
const uint8ArrayTypeId = `${libraryId}#Uint8Array`
const uint8ArrayTypeRef: NominalTypeRef = {
  kind: 'nominal',
  typeId: uint8ArrayTypeId,
  args: [],
  nullable: false,
  ownership: 'value',
  traits: []
}
const numberTypeRef: PrimitiveTypeRef = primitiveTypeRef('number')
const stringTypeRef: PrimitiveTypeRef = primitiveTypeRef('string')

const operations: LibraryOperationDescriptor[] = [
  uint8ArrayConstructor(),
  receiverMemberRead('length', 'length', numberTypeRef),
  receiverIndexRead(),
  receiverIndexWrite(),
  receiverCall(
    'slice',
    ['receiver', 'number', 'optional-number'],
    'slice',
    uint8ArrayTypeRef,
    null,
    'value',
    1,
    2,
    [numberArgument(), numberArgument()]
  ),
  receiverCall(
    'toString',
    ['receiver'],
    'toString',
    stringTypeRef,
    { cppType: 'inox::String', fields: [] },
    null,
    0,
    0,
    []
  )
]

export const compilerLibraryPackage: CompilerLibraryPackageDescriptor = {
  id: libraryId,
  dependencies: [collectionsLibraryId],
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
      dependencies: [arrayRuntimeRequirement, 'managed-values', 'string-bytes'],
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
        valueTypes: ['number', 'object'],
        arrayLiteralRequired: true,
        arrayElementValueTypes: ['number']
      }
    ],
    variants: [
      constructorVariant('number', ['number']),
      constructorVariant('object', ['value'])
    ],
    resultTypeRef: uint8ArrayTypeRef
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
    cResultMode: 'value'
  }
}

function receiverMemberRead(
  name: string,
  cExpression: string,
  resultTypeRef: TypeRef
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
    resultTypeRef
  }
}

function receiverCall(
  name: string,
  cArgumentKinds: LibraryCArgumentKind[],
  cExpression: string,
  resultTypeRef: TypeRef,
  cResultMapping: LibraryCResultMappingDescriptor | null,
  cResultMode: LibraryCResultMode | null,
  minArgs: number,
  maxArgs: number,
  argumentChecks: LibraryArgumentCheckDescriptor[]
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
    cResultMapping,
    cResultMode,
    cCallStyle: 'member',
    cFailureMode: 'thrown',
    minArgs,
    maxArgs,
    argumentChecks,
    resultTypeRef
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
    cResultAdapter: 'static_cast<double>($value)',
    minArgs: 1,
    maxArgs: 1,
    argumentChecks: [numberArgument()],
    resultTypeRef: numberTypeRef
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
    cResultAdapter: 'static_cast<double>($value)',
    minArgs: 2,
    maxArgs: 2,
    argumentChecks: [numberArgument(), numberArgument()],
    resultTypeRef: numberTypeRef
  }
}

function numberArgument(): LibraryArgumentCheckDescriptor {
  return { valueTypes: ['number'] }
}

function primitiveTypeRef(name: 'number' | 'string'): PrimitiveTypeRef {
  return {
    kind: 'primitive',
    name,
    nullable: false,
    ownership: 'value',
    traits: []
  }
}

function receiverBinding(name: string): string {
  return `${uint8ArrayTypeId}.${name}`
}
