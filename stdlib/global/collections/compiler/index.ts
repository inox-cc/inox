import type {
  CompilerLibraryPackageDescriptor,
  LibraryOperationDescriptor,
  LibraryOperationTypeParameterDescriptor,
  NominalTypeRef,
  TypeRef
} from '../../../../compiler/extensions/types.ts'

const libraryId = 'global:collections'
export const arrayRuntimeRequirement = `${libraryId}#array`
const mapRuntimeRequirement = `${libraryId}#map`
const setRuntimeRequirement = `${libraryId}#set`

export const arrayNativeTypeId = `${libraryId}#Array`
export const mapNativeTypeId = `${libraryId}#Map`
export const setNativeTypeId = `${libraryId}#Set`
const mapEntryIteratorNativeTypeId = `${libraryId}#MapEntryIterator`
const mapKeyIteratorNativeTypeId = `${libraryId}#MapKeyIterator`
const mapValueIteratorNativeTypeId = `${libraryId}#MapValueIterator`

const parameterTypeRef: TypeRef = { kind: 'parameter', name: 'T' }
const keyParameterTypeRef: TypeRef = { kind: 'parameter', name: 'K' }
const valueParameterTypeRef: TypeRef = { kind: 'parameter', name: 'V' }
const nullableValueParameterTypeRef: TypeRef = { kind: 'parameter', name: 'V', nullable: true }
const arrayIntrinsicBindingId = `${arrayNativeTypeId}.intrinsic`
const booleanTypeRef = primitiveTypeRef('boolean')
const numberTypeRef = primitiveTypeRef('number')
const unknownTypeRef: TypeRef = {
  kind: 'unknown',
  nullable: false,
  ownership: 'value',
  traits: []
}
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

/** Creates the package-owned semantic reference for Map<K, V>. */
export function mapTypeRef(keyType: TypeRef, valueType: TypeRef): NominalTypeRef {
  return {
    kind: 'nominal',
    typeId: mapNativeTypeId,
    args: [keyType, valueType],
    nullable: false,
    ownership: 'value',
    traits: [
      {
        traitId: 'indexable',
        args: [keyType, valueType]
      },
      {
        traitId: 'iterable',
        args: [mapEntryTypeRef()]
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

const arrayIntrinsicOperation: LibraryOperationDescriptor = {
  libraryId,
  bindingId: arrayIntrinsicBindingId,
  operationId: arrayIntrinsicBindingId,
  kind: 'construct',
  runtimeRequirements: [arrayRuntimeRequirement],
  typeParameters: [{ name: 'T', sources: [{ source: 'contextual-type-argument', argumentIndex: 0 }] }],
  resultTypeRef: arrayTypeRef(parameterTypeRef),
  minArgs: 0,
  maxArgs: 0,
  argumentChecks: []
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

const mapOperations: LibraryOperationDescriptor[] = [
  {
    libraryId,
    bindingId: 'global:Map',
    operationId: `${mapNativeTypeId}.construct`,
    kind: 'construct',
    runtimeRequirements: [mapRuntimeRequirement],
    typeParameters: [
      {
        name: 'K',
        sources: [
          { source: 'explicit-type-argument', argumentIndex: 0 },
          { source: 'contextual-type-argument', argumentIndex: 0 },
          { source: 'argument-array-literal-column', argumentIndex: 0, elementIndex: 0 }
        ]
      },
      {
        name: 'V',
        sources: [
          { source: 'explicit-type-argument', argumentIndex: 1 },
          { source: 'contextual-type-argument', argumentIndex: 1 },
          { source: 'argument-array-literal-column', argumentIndex: 0, elementIndex: 1 }
        ]
      }
    ],
    variants: [
      { minArgs: 0, maxArgs: 0, cExpression: 'Map', cArgumentKinds: [] },
      {
        minArgs: 1,
        maxArgs: 1,
        cExpression: 'Map::from',
        cArgumentKinds: ['runtime-value'],
        argumentChecks: [{ valueTypes: ['array', 'object'] }]
      }
    ],
    cCallStyle: 'function',
    cFailureMode: 'thrown',
    cResultMode: 'value',
    resultTypeRef: mapTypeRef(keyParameterTypeRef, valueParameterTypeRef),
    minArgs: 0,
    maxArgs: 1
  },
  mapReceiverCall('clear', 'clear', voidTypeRef, []),
  mapReceiverCall('delete', 'erase', booleanTypeRef, [keyParameterTypeRef]),
  mapReceiverCall('entries', 'entries', mapIteratorTypeRef(mapEntryIteratorNativeTypeId, []), []),
  mapIndexRead(),
  mapIndexWrite(),
  {
    ...mapReceiverCall('get', 'get', nullableValueParameterTypeRef, [keyParameterTypeRef]),
    cResultMapping: { cppType: 'inox::Value', fields: [] }
  },
  mapReceiverCall('has', 'has', booleanTypeRef, [keyParameterTypeRef]),
  mapReceiverCall('keys', 'keys', mapIteratorTypeRef(mapKeyIteratorNativeTypeId, [keyParameterTypeRef]), []),
  mapReceiverCall('set', 'set', mapTypeRef(keyParameterTypeRef, valueParameterTypeRef), [
    keyParameterTypeRef,
    valueParameterTypeRef
  ]),
  {
    libraryId,
    bindingId: `${mapNativeTypeId}.size`,
    operationId: `${mapNativeTypeId}.size`,
    kind: 'member-read',
    runtimeRequirements: [mapRuntimeRequirement],
    receiverTypeId: mapNativeTypeId,
    cExpression: 'size',
    cArgumentKinds: ['receiver'],
    cCallStyle: 'member',
    cFailureMode: 'thrown',
    resultTypeRef: numberTypeRef
  },
  mapReceiverCall('values', 'values', mapIteratorTypeRef(mapValueIteratorNativeTypeId, [valueParameterTypeRef]), [])
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
      runtimeRequirements: [arrayRuntimeRequirement],
      cRuntimeValueExpression: '$value.raw()',
      typeParameters: ['T'],
      traits: [{ traitId: 'iterable', args: [parameterTypeRef] }]
    },
    {
      libraryId,
      typeId: mapNativeTypeId,
      declarationNames: ['Map'],
      valueType: 'object',
      cppType: 'Map',
      baseTypeIds: [],
      runtimeRequirements: [mapRuntimeRequirement],
      cValueAdapter: 'Map($value)',
      cRuntimeValueExpression: '$value.raw()',
      typeParameters: ['K', 'V'],
      traits: [
        { traitId: 'indexable', args: [keyParameterTypeRef, valueParameterTypeRef] },
        { traitId: 'iterable', args: [mapEntryTypeRef()] }
      ],
      cIteration: {
        iteratorMethod: 'entries',
        nextMethod: 'next',
        doneMember: 'done',
        valueMember: 'value',
        receiverAdapter: 'Map($value)',
        valueAdapter: '$value.raw()',
        failureMode: 'thrown'
      }
    },
    mapIteratorNativeType(mapEntryIteratorNativeTypeId, [], mapEntryTypeRef()),
    mapIteratorNativeType(mapKeyIteratorNativeTypeId, ['K'], keyParameterTypeRef),
    mapIteratorNativeType(mapValueIteratorNativeTypeId, ['V'], valueParameterTypeRef),
    {
      libraryId,
      typeId: setNativeTypeId,
      declarationNames: ['Set'],
      valueType: 'object',
      cppType: 'Set',
      baseTypeIds: [],
      runtimeRequirements: [setRuntimeRequirement],
      cValueAdapter: 'Set($value)',
      cRuntimeValueExpression: '$value.raw()',
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
  operations: [arrayIntrinsicOperation, ...mapOperations, ...setOperations],
  intrinsicBindings: [{ role: 'array-literal', bindingId: arrayIntrinsicBindingId }],
  runtimeRequirements: [
    {
      id: arrayRuntimeRequirement,
      dependencies: ['collections', 'managed-values'],
      cPreludeIncludes: ['inox/array.h'],
      capabilities: []
    },
    {
      id: mapRuntimeRequirement,
      dependencies: ['collections', 'managed-values'],
      cPreludeIncludes: ['inox/map.h'],
      capabilities: []
    },
    {
      id: setRuntimeRequirement,
      dependencies: ['collections', 'managed-values'],
      cPreludeIncludes: ['inox/set.h'],
      capabilities: []
    }
  ]
}

function mapEntryTypeRef(): TypeRef {
  return arrayTypeRef(unknownTypeRef)
}

function mapIteratorTypeRef(typeId: string, args: TypeRef[]): NominalTypeRef {
  return {
    kind: 'nominal',
    typeId,
    args,
    nullable: false,
    ownership: 'value',
    traits: []
  }
}

function mapIteratorNativeType(typeId: string, typeParameters: string[], elementType: TypeRef) {
  return {
    libraryId,
    typeId,
    declarationNames: [],
    valueType: 'object',
    cppType: 'MapIterator',
    baseTypeIds: [],
    runtimeRequirements: [mapRuntimeRequirement],
    typeParameters,
    traits: [{ traitId: 'iterable' as const, args: [elementType] }],
    cIteration: {
      iteratorMethod: null,
      nextMethod: 'next',
      doneMember: 'done',
      valueMember: 'value',
      valueAdapter: '$value.raw()',
      failureMode: 'thrown' as const
    }
  }
}

function mapReceiverCall(
  sourceName: string,
  cName: string,
  resultTypeRef: TypeRef,
  argumentTypeRefs: TypeRef[]
): LibraryOperationDescriptor {
  const typeParameters = [
    { name: 'K', sources: [{ source: 'receiver-type-argument' as const, argumentIndex: 0 }] },
    { name: 'V', sources: [{ source: 'receiver-type-argument' as const, argumentIndex: 1 }] }
  ]
  const argumentChecks = []
  const cArgumentKinds: Array<'receiver' | 'runtime-value'> = ['receiver']

  for (let index = 0; index < argumentTypeRefs.length; index = index + 1) {
    argumentChecks.push({ valueTypes: [], typeRef: argumentTypeRefs[index] })
    cArgumentKinds.push('runtime-value')
  }

  return {
    libraryId,
    bindingId: `${mapNativeTypeId}.${sourceName}`,
    operationId: `${mapNativeTypeId}.${sourceName}`,
    kind: 'call',
    runtimeRequirements: [mapRuntimeRequirement],
    receiverTypeId: mapNativeTypeId,
    typeParameters,
    cExpression: cName,
    cArgumentKinds,
    cCallStyle: 'member',
    cFailureMode: 'thrown',
    resultTypeRef,
    minArgs: argumentChecks.length,
    maxArgs: argumentChecks.length,
    argumentChecks
  }
}

function mapIndexRead(): LibraryOperationDescriptor {
  return {
    libraryId,
    bindingId: `${mapNativeTypeId}.*`,
    operationId: `${mapNativeTypeId}#index-read`,
    kind: 'index-read',
    runtimeRequirements: [mapRuntimeRequirement],
    receiverTypeId: mapNativeTypeId,
    typeParameters: mapReceiverTypeParameters(),
    cExpression: 'get',
    cArgumentKinds: ['receiver', 'runtime-value'],
    cCallStyle: 'member',
    cFailureMode: 'thrown',
    resultTypeRef: nullableValueParameterTypeRef,
    cResultMapping: { cppType: 'inox::Value', fields: [] },
    minArgs: 1,
    maxArgs: 1,
    argumentChecks: [{ valueTypes: [], typeRef: keyParameterTypeRef }]
  }
}

function mapIndexWrite(): LibraryOperationDescriptor {
  return {
    libraryId,
    bindingId: `${mapNativeTypeId}.*`,
    operationId: `${mapNativeTypeId}#index-write`,
    kind: 'index-write',
    runtimeRequirements: [mapRuntimeRequirement],
    receiverTypeId: mapNativeTypeId,
    typeParameters: mapReceiverTypeParameters(),
    cExpression: 'set',
    cArgumentKinds: ['receiver', 'runtime-value', 'runtime-value'],
    cCallStyle: 'member',
    cFailureMode: 'thrown',
    resultTypeRef: mapTypeRef(keyParameterTypeRef, valueParameterTypeRef),
    minArgs: 2,
    maxArgs: 2,
    argumentChecks: [
      { valueTypes: [], typeRef: keyParameterTypeRef },
      { valueTypes: [], typeRef: valueParameterTypeRef }
    ]
  }
}

function mapReceiverTypeParameters(): LibraryOperationTypeParameterDescriptor[] {
  return [
    { name: 'K', sources: [{ source: 'receiver-type-argument' as const, argumentIndex: 0 }] },
    { name: 'V', sources: [{ source: 'receiver-type-argument' as const, argumentIndex: 1 }] }
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
