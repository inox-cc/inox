import type {
  CompilerLibraryPackageDescriptor,
  LibraryOperationDescriptor,
  NominalTypeRef,
  TypeRef
} from '../../../../compiler/extensions/types.ts'

const libraryId = 'global:collections'
const setRuntimeRequirement = `${libraryId}#set`

export const arrayNativeTypeId = `${libraryId}#Array`
export const setNativeTypeId = `${libraryId}#Set`

const parameterTypeRef: TypeRef = { kind: 'parameter', name: 'T' }
const booleanTypeRef = primitiveTypeRef('boolean')
const numberTypeRef = primitiveTypeRef('number')
const voidTypeRef = primitiveTypeRef('void')

/** Creates the package-owned semantic reference for Array<T>. */
export function arrayTypeRef(elementType: TypeRef): NominalTypeRef {
  return {
    kind: 'nominal',
    typeId: arrayNativeTypeId,
    args: [elementType],
    nullable: false,
    ownership: 'value',
    traits: [
      {
        traitId: 'iterable',
        args: [elementType]
      }
    ]
  }
}

/** Creates the package-owned semantic reference for Set<T>. */
export function setTypeRef(elementType: TypeRef): NominalTypeRef {
  return {
    kind: 'nominal',
    typeId: setNativeTypeId,
    args: [elementType],
    nullable: false,
    ownership: 'value',
    traits: [
      {
        traitId: 'iterable',
        args: [elementType]
      }
    ]
  }
}

const setOperations: LibraryOperationDescriptor[] = [
  {
    libraryId,
    bindingId: 'global:Set',
    operationId: `${setNativeTypeId}.construct`,
    kind: 'construct',
    runtimeRequirements: [setRuntimeRequirement],
    typeParameters: [
      {
        name: 'T',
        sources: [
          { source: 'explicit-type-argument', argumentIndex: 0 },
          { source: 'contextual-type-argument', argumentIndex: 0 },
          { source: 'argument-trait', argumentIndex: 0, traitId: 'iterable', traitArgumentIndex: 0 }
        ]
      }
    ],
    variants: [
      { minArgs: 0, maxArgs: 0, cExpression: 'Set', cArgumentKinds: [] },
      {
        minArgs: 1,
        maxArgs: 1,
        cExpression: 'Set::from',
        cArgumentKinds: ['runtime-value'],
        argumentChecks: [{ valueTypes: ['array', 'object'] }]
      }
    ],
    cCallStyle: 'function',
    cFailureMode: 'thrown',
    cResultMode: 'value',
    resultTypeRef: setTypeRef(parameterTypeRef),
    minArgs: 0,
    maxArgs: 1
  },
  setReceiverCall('add', 'add', setTypeRef(parameterTypeRef), true),
  setReceiverCall('clear', 'clear', voidTypeRef, false),
  setReceiverCall('delete', 'erase', booleanTypeRef, true),
  setReceiverCall('has', 'has', booleanTypeRef, true),
  {
    libraryId,
    bindingId: `${setNativeTypeId}.size`,
    operationId: `${setNativeTypeId}.size`,
    kind: 'member-read',
    runtimeRequirements: [setRuntimeRequirement],
    receiverTypeId: setNativeTypeId,
    cExpression: 'size',
    cArgumentKinds: ['receiver'],
    cCallStyle: 'member',
    cFailureMode: 'thrown',
    resultTypeRef: numberTypeRef
  }
]

export const compilerLibraryPackage: CompilerLibraryPackageDescriptor = {
  id: libraryId,
  dependencies: [],
  nativeTypes: [
    {
      libraryId,
      typeId: arrayNativeTypeId,
      declarationNames: ['Array'],
      valueType: 'array',
      cppType: 'ArrayClass',
      baseTypeIds: [],
      runtimeRequirements: ['collections', 'managed-values']
    },
    {
      libraryId,
      typeId: setNativeTypeId,
      declarationNames: ['Set'],
      valueType: 'object',
      cppType: 'Set',
      baseTypeIds: [],
      runtimeRequirements: [setRuntimeRequirement],
      cValueAdapter: 'Set($value)',
      typeParameters: ['T'],
      traits: [{ traitId: 'iterable', args: [parameterTypeRef] }],
      cIteration: {
        iteratorMethod: 'values',
        nextMethod: 'next',
        doneMember: 'done',
        valueMember: 'value',
        receiverAdapter: 'Set($value)',
        valueAdapter: '$value.raw()',
        failureMode: 'thrown'
      }
    }
  ],
  operations: setOperations,
  intrinsicBindings: [],
  runtimeRequirements: [
    {
      id: setRuntimeRequirement,
      dependencies: ['collections', 'managed-values'],
      cPreludeIncludes: ['inox/set.h'],
      capabilities: []
    }
  ]
}

function setReceiverCall(
  sourceName: string,
  cName: string,
  resultTypeRef: TypeRef,
  acceptsValue: boolean
): LibraryOperationDescriptor {
  const typeParameters = acceptsValue
    ? [{ name: 'T', sources: [{ source: 'receiver-type-argument' as const, argumentIndex: 0 }] }]
    : undefined
  const argumentChecks = acceptsValue ? [{ valueTypes: [], typeRef: parameterTypeRef }] : []
  const cArgumentKinds = acceptsValue ? (['receiver', 'runtime-value'] as const) : (['receiver'] as const)

  return {
    libraryId,
    bindingId: `${setNativeTypeId}.${sourceName}`,
    operationId: `${setNativeTypeId}.${sourceName}`,
    kind: 'call',
    runtimeRequirements: [setRuntimeRequirement],
    receiverTypeId: setNativeTypeId,
    typeParameters,
    cExpression: cName,
    cArgumentKinds: [...cArgumentKinds],
    cCallStyle: 'member',
    cFailureMode: 'thrown',
    resultTypeRef,
    minArgs: argumentChecks.length,
    maxArgs: argumentChecks.length,
    argumentChecks
  }
}

function primitiveTypeRef(name: 'boolean' | 'number' | 'void'): TypeRef {
  return {
    kind: 'primitive',
    name,
    nullable: false,
    ownership: 'value',
    traits: []
  }
}
