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
const arrayTypeId = `${collectionsLibraryId}#Array`
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
const nullableNumberTypeRef: PrimitiveTypeRef = {
  ...numberTypeRef,
  nullable: true
}
const stringTypeRef: PrimitiveTypeRef = primitiveTypeRef('string')

const operations: LibraryOperationDescriptor[] = [
  uint8ArrayConstructor(),
  receiverMemberRead('length', 'length', numberTypeRef),
  receiverIndexRead(),
  receiverIndexWrite(),
  {
    ...receiverCall(
      'at',
      ['receiver', 'number'],
      'at',
      nullableNumberTypeRef,
      valueResultMapping(),
      'value',
      1,
      1,
      [numberArgument()]
    ),
    cFailureMode: null,
    cPreservesPendingException: true
  },
  {
    ...receiverCall(
      'fill',
      ['receiver', 'number', 'optional-number', 'optional-number'],
      'fill',
      uint8ArrayTypeRef,
      null,
      'value',
      1,
      3,
      [numberArgument(), numberArgument(), numberArgument()]
    ),
    cFailureMode: null,
    cPreservesPendingException: true,
    cHasObservableSideEffects: true
  },
  uint8ArraySetOperation(),
  receiverCall('slice', ['receiver', 'number', 'optional-number'], 'slice', uint8ArrayTypeRef, null, 'value', 1, 2, [
    numberArgument(),
    numberArgument()
  ]),
  receiverCall(
    'subarray',
    ['receiver', 'optional-number', 'optional-number'],
    'subarray',
    uint8ArrayTypeRef,
    null,
    'value',
    0,
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
      runtimeRequirements: [runtimeRequirement],
      cValueAdapter: 'Uint8Array($value)',
      cValueAdapterFailureMode: 'thrown',
      cRuntimeValueExpression: '$value.raw()',
      cRuntimeValueValidExpression: 'Uint8Array(inox::Value($value)).valid()'
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
        valueTypes: [],
        typeRefs: [numberTypeRef, uint8ArrayTypeRef, arrayTypeRef(numberTypeRef)]
      }
    ],
    variants: [constructorVariant(['number'], ['number']), constructorVariant(['object', 'bytes'], ['value'])],
    resultTypeRef: uint8ArrayTypeRef
  }
}

function constructorVariant(
  valueTypes: string[],
  cArgumentKinds: LibraryCArgumentKind[]
): LibraryOperationVariantDescriptor {
  return {
    minArgs: 1,
    maxArgs: 1,
    argumentIndex: 0,
    argumentValueTypes: valueTypes,
    cExpression: 'Uint8Array',
    cArgumentKinds,
    cResultMode: 'value'
  }
}

function uint8ArraySetOperation(): LibraryOperationDescriptor {
  return {
    ...receiverCall(
      'set',
      ['receiver', 'runtime-value', 'optional-number'],
      'set',
      primitiveTypeRef('void'),
      null,
      null,
      1,
      2,
      [
        { valueTypes: [], typeRefs: [uint8ArrayTypeRef, arrayTypeRef(numberTypeRef)] },
        numberArgument()
      ]
    ),
    cHasObservableSideEffects: true
  }
}

function receiverMemberRead(name: string, cExpression: string, resultTypeRef: TypeRef): LibraryOperationDescriptor {
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
    cFailureMode: null,
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
    cExpression: 'get',
    cArgumentKinds: ['receiver', 'number'],
    cReceiverAdapter: 'Uint8Array($value)',
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
    operationId: `${uint8ArrayTypeId}#index-write`,
    kind: 'index-write',
    runtimeRequirements: [runtimeRequirement],
    receiverTypeId: uint8ArrayTypeId,
    cExpression: 'set',
    cArgumentKinds: ['receiver', 'number', 'number'],
    cReceiverAdapter: 'Uint8Array($value)',
    cCallStyle: 'member',
    cFailureMode: null,
    minArgs: 2,
    maxArgs: 2,
    argumentChecks: [numberArgument(), numberArgument()],
    resultTypeRef: numberTypeRef
  }
}

function numberArgument(): LibraryArgumentCheckDescriptor {
  return { valueTypes: ['number'] }
}

function arrayTypeRef(elementType: TypeRef): NominalTypeRef {
  return {
    kind: 'nominal',
    typeId: arrayTypeId,
    args: [elementType],
    nullable: false,
    ownership: 'value',
    traits: [{ traitId: 'iterable', args: [elementType] }]
  }
}

function valueResultMapping(): LibraryCResultMappingDescriptor {
  return { cppType: 'inox::Value', fields: [] }
}

function primitiveTypeRef(name: 'number' | 'string' | 'void'): PrimitiveTypeRef {
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
