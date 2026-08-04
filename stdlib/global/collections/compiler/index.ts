import type {
  CompilerLibraryPackageDescriptor,
  LibraryOperationDescriptor,
  LibraryOperationTypeParameterDescriptor,
  NominalTypeRef,
  TypeRef
} from '../../../../compiler/extensions/types.ts'

const libraryId = 'global:collections'
export const arrayRuntimeRequirement = `${libraryId}#array`
const arrayCallbackRuntimeRequirement = `${libraryId}#array-callback`
const mapRuntimeRequirement = `${libraryId}#map`
const setRuntimeRequirement = `${libraryId}#set`

export const arrayNativeTypeId = `${libraryId}#Array`
export const mapNativeTypeId = `${libraryId}#Map`
export const setNativeTypeId = `${libraryId}#Set`
const mapEntryIteratorNativeTypeId = `${libraryId}#MapEntryIterator`
const mapKeyIteratorNativeTypeId = `${libraryId}#MapKeyIterator`
const mapValueIteratorNativeTypeId = `${libraryId}#MapValueIterator`

const parameterTypeRef: TypeRef = { kind: 'parameter', name: 'T' }
const mappedParameterTypeRef: TypeRef = { kind: 'parameter', name: 'U' }
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
        traitId: 'indexable',
        args: [numberTypeRef, elementType]
      },
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
    traits: [{ traitId: 'iterable', args: [mapEntryTypeRef()] }]
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
  cSequenceMaterialization: {
    createExpression: 'Array::create(0)',
    literalExpression: 'Array::from({ $values })',
    appendElementExpression: '$target.push($value)',
    appendSpreadExpression: '$target.appendAll($value)',
    appendSpreadValueAdapter: 'Array($value)',
    appendSpreadValueTypeId: arrayNativeTypeId,
    failureMode: 'thrown'
  },
  typeParameters: [{ name: 'T', sources: [{ source: 'contextual-type-argument', argumentIndex: 0 }] }],
  resultTypeRef: arrayTypeRef(parameterTypeRef),
  minArgs: 0,
  maxArgs: 0,
  argumentChecks: []
}

const arrayOperations: LibraryOperationDescriptor[] = [
  arrayStaticCall(
    'from',
    'Array::from',
    arrayTypeRef(primitiveTypeRef('string')),
    ['string-view'],
    [{ valueTypes: ['string'] }]
  ),
  {
    ...arrayStaticCall('isArray', 'Array::isArray', booleanTypeRef, ['runtime-value'], [], 1, 1, {
      argumentIndex: 0,
      trueTypeRef: arrayTypeRef(unknownTypeRef),
      trueNonNullable: true
    }),
    cFailureMode: null
  },
  {
    ...arrayMemberRead('length', numberTypeRef, 'static_cast<double>($value)'),
    cFailureMode: null,
    cPreservesPendingException: true
  },
  {
    ...arrayReceiverCall(
      'includes',
      booleanTypeRef,
      ['runtime-value'],
      [{ valueTypes: [], typeRef: parameterTypeRef }]
    ),
    cFailureMode: null,
    cPreservesPendingException: true
  },
  {
    ...arrayReceiverCall(
      'join',
      primitiveTypeRef('string'),
      ['optional-string-view'],
      [{ valueTypes: ['string'] }],
      { cppType: 'inox::String', fields: [] },
      0
    ),
    cPreservesPendingException: true
  },
  arrayReceiverCall('pop', nullableParameterTypeRef(), [], [], { cppType: 'inox::Value', fields: [] }),
  arrayPushOperation(),
  arrayReduceOperation(),
  arrayReceiverCall(
    'slice',
    arrayTypeRef(parameterTypeRef),
    ['optional-number', 'optional-number'],
    [{ valueTypes: ['number'] }, { valueTypes: ['number'] }],
    null,
    0
  ),
  arrayCallbackReceiverCall('every', booleanTypeRef, [...arrayPredicateParameters()], 'boolean'),
  arrayCallbackReceiverCall('filter', arrayTypeRef(parameterTypeRef), arrayPredicateParameters(), 'boolean'),
  arrayCallbackReceiverCall('find', nullableParameterTypeRef(), arrayPredicateParameters(), 'boolean', {
    cppType: 'inox::Value',
    fields: []
  }),
  arrayCallbackReceiverCall('map', arrayTypeRef(mappedParameterTypeRef), arrayPredicateParameters(), null, null, [
    ...arrayTypeParameters(),
    { name: 'U', sources: [{ source: 'argument-function-return', argumentIndex: 0 }] }
  ]),
  arrayCallbackReceiverCall('some', booleanTypeRef, [...arrayPredicateParameters()], 'boolean'),
  arraySortOperation(),
  arrayUnshiftOperation(),
  arrayIndexRead(),
  arrayIndexWrite()
]

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
        argumentChecks: [{ valueTypes: ['object'] }]
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
  {
    ...setReceiverCall('has', 'has', booleanTypeRef, true),
    cFailureMode: null,
    cPreservesPendingException: true
  },
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
    cFailureMode: null,
    cPreservesPendingException: true,
    cResultAdapter: 'static_cast<double>($value)',
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
        argumentChecks: [{ valueTypes: ['object'] }]
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
  {
    ...mapReceiverCall('entries', 'entries', mapIteratorTypeRef(mapEntryIteratorNativeTypeId, []), []),
    cFailureMode: null,
    cPreservesPendingException: true
  },
  {
    ...mapReceiverCall('get', 'get', nullableValueParameterTypeRef, [keyParameterTypeRef]),
    cResultMapping: { cppType: 'inox::Value', fields: [] }
  },
  {
    ...mapReceiverCall('has', 'has', booleanTypeRef, [keyParameterTypeRef]),
    cFailureMode: null,
    cPreservesPendingException: true
  },
  {
    ...mapReceiverCall('keys', 'keys', mapIteratorTypeRef(mapKeyIteratorNativeTypeId, [keyParameterTypeRef]), []),
    cFailureMode: null,
    cPreservesPendingException: true
  },
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
    cFailureMode: null,
    cPreservesPendingException: true,
    cResultAdapter: 'static_cast<double>($value)',
    resultTypeRef: numberTypeRef
  },
  {
    ...mapReceiverCall(
      'values',
      'values',
      mapIteratorTypeRef(mapValueIteratorNativeTypeId, [valueParameterTypeRef]),
      []
    ),
    cFailureMode: null,
    cPreservesPendingException: true
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
      valueType: 'object',
      cppType: 'Array',
      baseTypeIds: [],
      runtimeRequirements: [arrayRuntimeRequirement],
      cValueAdapter: 'Array($value)',
      cValueAdapterFailureMode: 'thrown',
      cValueAdapterPreservesPendingException: true,
      cRuntimeValueExpression: '$value.raw()',
      cRuntimeValueValidExpression: '$value.tag == INOX_TAG_ARRAY && $value.as.ref != 0',
      typeParameters: ['T'],
      traits: [
        { traitId: 'indexable', args: [numberTypeRef, parameterTypeRef] },
        { traitId: 'iterable', args: [parameterTypeRef] }
      ],
      cIteration: {
        iteratorMethod: 'values',
        nextMethod: 'next',
        doneMember: 'done',
        valueMember: 'value',
        receiverAdapter: 'Array($value)',
        managedValue: true,
        rangeBased: true
      }
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
      cValueAdapterFailureMode: 'thrown',
      cValueAdapterPreservesPendingException: true,
      cRuntimeValueExpression: '$value.raw()',
      cRuntimeValueValidExpression: '$value.tag == INOX_TAG_MAP && $value.as.ref != 0',
      typeParameters: ['K', 'V'],
      traits: [{ traitId: 'iterable', args: [mapEntryTypeRef()] }],
      cIteration: {
        iteratorMethod: 'entries',
        nextMethod: 'next',
        doneMember: 'done',
        valueMember: 'value',
        receiverAdapter: 'Map($value)',
        valueAdapter: '$value.raw()',
        nextFailureMode: 'thrown'
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
      cValueAdapterFailureMode: 'thrown',
      cValueAdapterPreservesPendingException: true,
      cRuntimeValueExpression: '$value.raw()',
      cRuntimeValueValidExpression: '$value.tag == INOX_TAG_SET && $value.as.ref != 0',
      typeParameters: ['T'],
      traits: [{ traitId: 'iterable', args: [parameterTypeRef] }],
      cIteration: {
        iteratorMethod: 'values',
        nextMethod: 'next',
        doneMember: 'done',
        valueMember: 'value',
        receiverAdapter: 'Set($value)',
        valueAdapter: '$value.raw()'
      }
    }
  ],
  operations: [arrayIntrinsicOperation, ...arrayOperations, ...mapOperations, ...setOperations],
  intrinsicBindings: [{ role: 'array-literal', bindingId: arrayIntrinsicBindingId }],
  runtimeRequirements: [
    {
      id: arrayRuntimeRequirement,
      dependencies: ['managed-values'],
      cPreludeIncludes: ['inox/array.h'],
      capabilities: []
    },
    {
      id: arrayCallbackRuntimeRequirement,
      dependencies: ['callback-values'],
      cPreludeIncludes: [],
      capabilities: []
    },
    {
      id: mapRuntimeRequirement,
      dependencies: [arrayRuntimeRequirement, 'managed-values'],
      cPreludeIncludes: ['inox/map.h'],
      capabilities: []
    },
    {
      id: setRuntimeRequirement,
      dependencies: [arrayRuntimeRequirement, 'managed-values'],
      cPreludeIncludes: ['inox/set.h'],
      capabilities: []
    }
  ]
}

function mapEntryTypeRef(): TypeRef {
  return arrayTypeRef(unknownTypeRef)
}

function nullableParameterTypeRef(): TypeRef {
  return { kind: 'parameter', name: 'T', nullable: true }
}

function arrayTypeParameters(): LibraryOperationTypeParameterDescriptor[] {
  return [{ name: 'T', sources: [{ source: 'receiver-type-argument', argumentIndex: 0 }] }]
}

function arrayStaticCall(
  name: string,
  cExpression: string,
  resultTypeRef: TypeRef,
  cArgumentKinds: Array<'runtime-value' | 'string-view'>,
  argumentChecks: Array<{ valueTypes: string[] }>,
  minArgs: number = argumentChecks.length,
  maxArgs: number = argumentChecks.length,
  argumentNarrowing: LibraryOperationDescriptor['argumentNarrowing'] = null
): LibraryOperationDescriptor {
  return {
    libraryId,
    bindingId: `global:Array.${name}`,
    operationId: `${arrayNativeTypeId}.${name}`,
    kind: 'call',
    runtimeRequirements: [arrayRuntimeRequirement],
    cExpression,
    cArgumentKinds,
    cFailureMode: 'thrown',
    cResultMode: 'value',
    resultTypeRef,
    argumentNarrowing,
    minArgs,
    maxArgs,
    argumentChecks
  }
}

function arrayMemberRead(
  name: string,
  resultTypeRef: TypeRef,
  cResultAdapter: string | null = null
): LibraryOperationDescriptor {
  return {
    libraryId,
    bindingId: `${arrayNativeTypeId}.${name}`,
    acceptsUnknownReceiver: true,
    operationId: `${arrayNativeTypeId}.${name}`,
    kind: 'member-read',
    runtimeRequirements: [arrayRuntimeRequirement],
    receiverTypeId: arrayNativeTypeId,
    typeParameters: arrayTypeParameters(),
    cExpression: name,
    cArgumentKinds: ['receiver'],
    cCallStyle: 'member',
    cFailureMode: 'thrown',
    cResultAdapter,
    resultTypeRef
  }
}

function arrayReceiverCall(
  name: string,
  resultTypeRef: TypeRef,
  cArgumentKinds: Array<'optional-number' | 'optional-string-view' | 'runtime-value'>,
  argumentChecks: Array<{ valueTypes: string[]; typeRef?: TypeRef }>,
  cResultMapping: { cppType: string; fields: [] } | null = null,
  minArgs: number = argumentChecks.length
): LibraryOperationDescriptor {
  return {
    libraryId,
    bindingId: `${arrayNativeTypeId}.${name}`,
    operationId: `${arrayNativeTypeId}.${name}`,
    kind: 'call',
    runtimeRequirements: [arrayRuntimeRequirement],
    receiverTypeId: arrayNativeTypeId,
    typeParameters: arrayTypeParameters(),
    cExpression: name,
    cArgumentKinds: ['receiver', ...cArgumentKinds],
    cCallStyle: 'member',
    cFailureMode: 'thrown',
    cResultMode: 'value',
    cResultMapping,
    resultTypeRef,
    minArgs,
    maxArgs: argumentChecks.length,
    argumentChecks
  }
}

function arrayPushOperation(): LibraryOperationDescriptor {
  return {
    libraryId,
    bindingId: `${arrayNativeTypeId}.push`,
    operationId: `${arrayNativeTypeId}.push`,
    kind: 'call',
    runtimeRequirements: [arrayRuntimeRequirement],
    receiverTypeId: arrayNativeTypeId,
    typeParameters: arrayTypeParameters(),
    variants: [
      {
        minArgs: 1,
        maxArgs: 1,
        cArgumentKinds: ['receiver', 'runtime-value']
      }
    ],
    cExpression: 'push',
    cArgumentKinds: ['receiver', 'variadic-runtime-value-array', 'variadic-count'],
    cCallStyle: 'member',
    cFailureMode: 'thrown',
    cResultMode: 'value',
    cResultAdapter: 'static_cast<double>($value)',
    resultTypeRef: numberTypeRef,
    minArgs: 0,
    maxArgs: null,
    argumentChecks: [{ valueTypes: [], typeRef: parameterTypeRef }]
  }
}

function arrayUnshiftOperation(): LibraryOperationDescriptor {
  return {
    libraryId,
    bindingId: `${arrayNativeTypeId}.unshift`,
    operationId: `${arrayNativeTypeId}.unshift`,
    kind: 'call',
    runtimeRequirements: [arrayRuntimeRequirement],
    receiverTypeId: arrayNativeTypeId,
    typeParameters: arrayTypeParameters(),
    variants: [
      {
        minArgs: 1,
        maxArgs: 1,
        cArgumentKinds: ['receiver', 'runtime-value']
      }
    ],
    cExpression: 'unshift',
    cArgumentKinds: ['receiver', 'variadic-runtime-value-array', 'variadic-count'],
    cCallStyle: 'member',
    cFailureMode: 'thrown',
    cResultMode: 'value',
    cResultAdapter: 'static_cast<double>($value)',
    resultTypeRef: numberTypeRef,
    minArgs: 0,
    maxArgs: null,
    argumentChecks: [{ valueTypes: [], typeRef: parameterTypeRef }]
  }
}

function arrayCallbackReceiverCall(
  name: string,
  resultTypeRef: TypeRef,
  functionParameters: Array<{
    name: string
    valueType: string
    typeRef: TypeRef
  }>,
  functionReturnType: string | null,
  cResultMapping: { cppType: string; fields: [] } | null = null,
  typeParameters: LibraryOperationTypeParameterDescriptor[] = arrayTypeParameters()
): LibraryOperationDescriptor {
  return {
    libraryId,
    bindingId: `${arrayNativeTypeId}.${name}`,
    operationId: `${arrayNativeTypeId}.${name}`,
    kind: 'call',
    runtimeRequirements: [arrayRuntimeRequirement, arrayCallbackRuntimeRequirement],
    receiverTypeId: arrayNativeTypeId,
    typeParameters,
    cExpression: name,
    cArgumentKinds: ['receiver', 'runtime-callback'],
    cCallStyle: 'member',
    cFailureMode: 'thrown',
    cResultMode: 'value',
    cResultMapping,
    resultTypeRef,
    minArgs: 1,
    maxArgs: 1,
    argumentChecks: [
      {
        valueTypes: ['function'],
        functionParameters,
        functionReturnType,
        functionAsync: false
      }
    ]
  }
}

function arrayPredicateParameters(): Array<{
  name: string
  valueType: string
  typeRef: TypeRef
}> {
  return [
    { name: 'value', valueType: 'unknown', typeRef: parameterTypeRef },
    { name: 'index', valueType: 'number', typeRef: numberTypeRef },
    { name: 'array', valueType: 'array', typeRef: arrayTypeRef(parameterTypeRef) }
  ]
}

function arraySortOperation(): LibraryOperationDescriptor {
  const callbackCheck = {
    valueTypes: ['function'],
    functionParameters: [
      { name: 'left', valueType: 'unknown', typeRef: parameterTypeRef },
      { name: 'right', valueType: 'unknown', typeRef: parameterTypeRef }
    ],
    functionReturnType: 'number',
    functionAsync: false
  }

  return {
    libraryId,
    bindingId: `${arrayNativeTypeId}.sort`,
    operationId: `${arrayNativeTypeId}.sort`,
    kind: 'call',
    runtimeRequirements: [arrayRuntimeRequirement],
    receiverTypeId: arrayNativeTypeId,
    typeParameters: arrayTypeParameters(),
    cExpression: 'sort',
    cCallStyle: 'member',
    cFailureMode: 'thrown',
    cResultMode: 'value',
    resultTypeRef: arrayTypeRef(parameterTypeRef),
    minArgs: 0,
    maxArgs: 1,
    variants: [
      {
        minArgs: 0,
        maxArgs: 0,
        runtimeRequirements: [arrayRuntimeRequirement],
        cArgumentKinds: ['receiver'],
        argumentChecks: []
      },
      {
        minArgs: 1,
        maxArgs: 1,
        runtimeRequirements: [arrayRuntimeRequirement, arrayCallbackRuntimeRequirement],
        cArgumentKinds: ['receiver', 'runtime-callback'],
        argumentChecks: [callbackCheck]
      }
    ]
  }
}

function arrayReduceOperation(): LibraryOperationDescriptor {
  return {
    libraryId,
    bindingId: `${arrayNativeTypeId}.reduce`,
    operationId: `${arrayNativeTypeId}.reduce`,
    kind: 'call',
    runtimeRequirements: [arrayRuntimeRequirement, arrayCallbackRuntimeRequirement],
    receiverTypeId: arrayNativeTypeId,
    typeParameters: [...arrayTypeParameters(), { name: 'U', sources: [{ source: 'argument-type', argumentIndex: 1 }] }],
    cExpression: 'reduce',
    cArgumentKinds: ['receiver', 'runtime-callback', 'runtime-value'],
    cCallStyle: 'member',
    cFailureMode: 'thrown',
    cResultMode: 'value',
    cResultMapping: { cppType: 'inox::Value', fields: [] },
    resultTypeRef: mappedParameterTypeRef,
    minArgs: 2,
    maxArgs: 2,
    argumentChecks: [
      {
        valueTypes: ['function'],
        functionParameters: [
          { name: 'accumulator', valueType: 'unknown', typeRef: mappedParameterTypeRef },
          { name: 'value', valueType: 'unknown', typeRef: parameterTypeRef },
          { name: 'index', valueType: 'number', typeRef: numberTypeRef },
          { name: 'array', valueType: 'array', typeRef: arrayTypeRef(parameterTypeRef) }
        ],
        functionReturnTypeRef: mappedParameterTypeRef,
        functionAsync: false
      },
      { valueTypes: [], typeRef: mappedParameterTypeRef }
    ]
  }
}

function arrayIndexRead(): LibraryOperationDescriptor {
  return {
    libraryId,
    bindingId: `${arrayNativeTypeId}.*`,
    operationId: `${arrayNativeTypeId}#index-read`,
    kind: 'index-read',
    acceptsUnknownReceiver: true,
    runtimeRequirements: [arrayRuntimeRequirement],
    receiverTypeId: arrayNativeTypeId,
    typeParameters: arrayTypeParameters(),
    cExpression: 'get',
    cArgumentKinds: ['receiver', 'number'],
    cCallStyle: 'member',
    cFailureMode: 'thrown',
    cPreservesPendingException: true,
    cResultMode: 'value',
    resultTypeRef: nullableParameterTypeRef(),
    indexBounds: {
      minimumIndex: 0,
      exclusiveUpperBoundMember: 'length'
    },
    cResultMapping: { cppType: 'inox::Value', fields: [] },
    minArgs: 1,
    maxArgs: 1,
    argumentChecks: [{ valueTypes: ['number'] }]
  }
}

function arrayIndexWrite(): LibraryOperationDescriptor {
  return {
    libraryId,
    bindingId: `${arrayNativeTypeId}.*`,
    operationId: `${arrayNativeTypeId}#index-write`,
    kind: 'index-write',
    acceptsUnknownReceiver: true,
    runtimeRequirements: [arrayRuntimeRequirement],
    receiverTypeId: arrayNativeTypeId,
    typeParameters: arrayTypeParameters(),
    cExpression: 'set',
    cArgumentKinds: ['receiver', 'number', 'runtime-value'],
    cCallStyle: 'member',
    cFailureMode: 'thrown',
    cResultMapping: { cppType: 'inox::Value', fields: [] },
    resultTypeRef: parameterTypeRef,
    minArgs: 2,
    maxArgs: 2,
    argumentChecks: [{ valueTypes: ['number'] }, { valueTypes: [], typeRef: parameterTypeRef }]
  }
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
      nextFailureMode: 'thrown' as const
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

function primitiveTypeRef(name: 'boolean' | 'number' | 'string' | 'void'): TypeRef {
  return {
    kind: 'primitive',
    name,
    nullable: false,
    ownership: 'value',
    traits: []
  }
}
