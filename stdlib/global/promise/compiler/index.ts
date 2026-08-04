import type {
  CompilerLibraryPackageDescriptor,
  LibraryOperationDescriptor,
  LibraryOperationTypeParameterDescriptor,
  NominalTypeRef,
  TypeRef
} from '../../../../compiler/extensions/types.ts'

const libraryId = 'global:promise'
const collectionsLibraryId = 'global:collections'
const arrayRuntimeRequirement = `${collectionsLibraryId}#array`
const arrayTypeId = `${collectionsLibraryId}#Array`
export const promiseRuntimeRequirement = `${libraryId}#promise`

export const promiseNativeTypeId = `${libraryId}#Promise`
const promiseIntrinsicBindingId = 'global:Promise'
const fulfilledParameterTypeRef: TypeRef = { kind: 'parameter', name: 'T' }
const mappedParameterTypeRef: TypeRef = { kind: 'parameter', name: 'U' }
const rejectedParameterTypeRef: TypeRef = { kind: 'parameter', name: 'E' }
const unknownTypeRef: TypeRef = {
  kind: 'unknown',
  nullable: false,
  ownership: 'value',
  traits: []
}
const voidTypeRef: TypeRef = {
  kind: 'primitive',
  name: 'void',
  nullable: false,
  ownership: 'value',
  traits: []
}

/** Creates the package-owned semantic reference for Promise<T>. */
export function promiseTypeRef(fulfilledType: TypeRef, rejectedType: TypeRef): NominalTypeRef {
  return {
    kind: 'nominal',
    typeId: promiseNativeTypeId,
    args: [fulfilledType],
    nullable: false,
    ownership: 'value',
    traits: [
      {
        traitId: 'awaitable',
        args: [fulfilledType, rejectedType]
      }
    ]
  }
}

const operations: LibraryOperationDescriptor[] = [
  {
    libraryId,
    bindingId: promiseIntrinsicBindingId,
    operationId: `${promiseNativeTypeId}.construct`,
    kind: 'construct',
    asyncResultOperation: 'create',
    cAsyncFulfillExpression: 'fulfill',
    cAsyncRejectExpression: 'rejectWith',
    runtimeRequirements: [promiseRuntimeRequirement],
    typeParameters: [
      {
        name: 'T',
        sources: [
          { source: 'explicit-type-argument', argumentIndex: 0 },
          { source: 'contextual-type-argument', argumentIndex: 0 }
        ]
      }
    ],
    cExpression: 'inox::Promise::create',
    cArgumentKinds: [],
    cCallStyle: 'function',
    cResultMode: 'value',
    resultTypeRef: promiseTypeRef(fulfilledParameterTypeRef, unknownTypeRef),
    minArgs: 1,
    maxArgs: 1,
    argumentChecks: [
      {
        valueTypes: ['function'],
        functionParameters: [
          {
            name: 'resolve',
            valueType: 'function',
            typeRef: functionTypeRef([fulfilledParameterTypeRef], voidTypeRef)
          },
          {
            name: 'reject',
            valueType: 'function',
            typeRef: functionTypeRef([unknownTypeRef], voidTypeRef)
          }
        ],
        functionReturnType: 'void',
        functionAsync: false
      }
    ]
  },
  promiseCombinatorOperation('all', promiseTypeRef(arrayTypeRef(fulfilledParameterTypeRef), unknownTypeRef)),
  promiseCombinatorOperation('race', promiseTypeRef(fulfilledParameterTypeRef, unknownTypeRef)),
  {
    libraryId,
    bindingId: 'global:Promise.resolve',
    operationId: `${promiseNativeTypeId}.resolve`,
    kind: 'call',
    asyncResultOperation: 'fulfill',
    runtimeRequirements: [promiseRuntimeRequirement],
    typeParameters: [
      {
        name: 'T',
        sources: [
          { source: 'explicit-type-argument', argumentIndex: 0 },
          {
            source: 'argument-type',
            argumentIndex: 0,
            unwrapTraitId: 'awaitable',
            unwrapTraitArgumentIndex: 0
          }
        ]
      }
    ],
    cExpression: 'inox::Promise::resolve',
    cCallStyle: 'function',
    cResultMode: 'value',
    resultTypeRef: promiseTypeRef(fulfilledParameterTypeRef, unknownTypeRef),
    minArgs: 0,
    maxArgs: 1,
    variants: [
      {
        minArgs: 0,
        maxArgs: 0,
        cArgumentKinds: [],
        argumentChecks: [],
        resultTypeRef: promiseTypeRef(voidTypeRef, unknownTypeRef)
      },
      {
        minArgs: 1,
        maxArgs: 1,
        cArgumentKinds: ['runtime-value'],
        argumentChecks: [
          {
            valueTypes: [],
            typeRefs: [fulfilledParameterTypeRef, promiseTypeRef(fulfilledParameterTypeRef, unknownTypeRef)]
          }
        ]
      }
    ]
  },
  {
    libraryId,
    bindingId: 'global:Promise.reject',
    operationId: `${promiseNativeTypeId}.reject`,
    kind: 'call',
    asyncResultOperation: 'reject',
    runtimeRequirements: [promiseRuntimeRequirement],
    typeParameters: [{ name: 'E', sources: [{ source: 'argument-type', argumentIndex: 0 }] }],
    cExpression: 'inox::Promise::reject',
    cCallStyle: 'function',
    cResultMode: 'value',
    resultTypeRef: promiseTypeRef(unknownTypeRef, rejectedParameterTypeRef),
    minArgs: 0,
    maxArgs: 1,
    variants: [
      { minArgs: 0, maxArgs: 0, cArgumentKinds: [], argumentChecks: [] },
      {
        minArgs: 1,
        maxArgs: 1,
        cArgumentKinds: ['runtime-value'],
        argumentChecks: [{ valueTypes: [], typeRef: rejectedParameterTypeRef }]
      }
    ]
  },
  promiseReceiverOperation(
    'then',
    'then',
    'map-fulfilled',
    promiseTypeRef(mappedParameterTypeRef, rejectedParameterTypeRef),
    fulfilledParameterTypeRef,
    false
  ),
  promiseReceiverOperation(
    'catch',
    'catchError',
    'map-rejected',
    promiseTypeRef(fulfilledParameterTypeRef, unknownTypeRef),
    rejectedParameterTypeRef,
    true
  ),
  {
    libraryId,
    bindingId: `${promiseNativeTypeId}.finally`,
    operationId: `${promiseNativeTypeId}.finally`,
    kind: 'call',
    runtimeRequirements: [promiseRuntimeRequirement],
    receiverTypeId: promiseNativeTypeId,
    typeParameters: [
      { name: 'T', sources: [{ source: 'receiver-type-argument', argumentIndex: 0 }] },
      { name: 'E', sources: [{ source: 'receiver-trait', traitId: 'awaitable', traitArgumentIndex: 1 }] }
    ],
    cExpression: 'finallyDo',
    cArgumentKinds: ['receiver', 'optional-runtime-callback'],
    cCallStyle: 'member',
    cResultMode: 'value',
    resultTypeRef: promiseTypeRef(fulfilledParameterTypeRef, rejectedParameterTypeRef),
    minArgs: 0,
    maxArgs: 1,
    argumentChecks: [
      {
        valueTypes: ['function'],
        functionParameters: [],
        functionReturnType: 'void',
        functionAsync: false
      }
    ],
    callbackLifetime: 'event-loop'
  }
]

export const compilerLibraryPackage: CompilerLibraryPackageDescriptor = {
  id: libraryId,
  dependencies: [collectionsLibraryId],
  nativeTypes: [
    {
      libraryId,
      typeId: promiseNativeTypeId,
      declarationNames: ['Promise'],
      valueType: 'async-result',
      cppType: 'inox::Promise',
      cValueAdapter: 'inox::Promise(inox::Value($value))',
      cValueAdapterFailureMode: 'thrown',
      cRuntimeValueExpression: '$value.raw()',
      cRuntimeValueValidExpression: 'inox::Promise::isPromise(inox::Value($value))',
      baseTypeIds: [],
      runtimeRequirements: [promiseRuntimeRequirement],
      cValidExpression: '$value.valid()',
      cAwaitExpression: '$value.awaitValue()',
      cCoroutineAwaitExpression: 'co_await $value',
      cAwaitHandlesInvalidSource: true,
      typeParameters: ['T'],
      traits: [{ traitId: 'awaitable', args: [fulfilledParameterTypeRef, unknownTypeRef] }]
    }
  ],
  operations,
  intrinsicBindings: [{ role: 'async-result', bindingId: promiseIntrinsicBindingId }],
  runtimeRequirements: [
    {
      id: promiseRuntimeRequirement,
      dependencies: [arrayRuntimeRequirement, 'async-runtime', 'callback-values', 'managed-values'],
      cPreludeIncludes: ['inox/promise.h'],
      capabilities: []
    }
  ]
}

function promiseCombinatorOperation(name: 'all' | 'race', resultTypeRef: TypeRef): LibraryOperationDescriptor {
  return {
    libraryId,
    bindingId: `global:Promise.${name}`,
    operationId: `${promiseNativeTypeId}.${name}`,
    kind: 'call',
    runtimeRequirements: [promiseRuntimeRequirement],
    typeParameters: [
      {
        name: 'T',
        sources: [
          { source: 'explicit-type-argument', argumentIndex: 0 },
          {
            source: 'argument-array-literal-elements',
            argumentIndex: 0,
            unwrapTraitId: 'awaitable',
            unwrapTraitArgumentIndex: 0
          },
          {
            source: 'argument-trait',
            argumentIndex: 0,
            traitId: 'iterable',
            traitArgumentIndex: 0,
            unwrapTraitId: 'awaitable',
            unwrapTraitArgumentIndex: 0
          }
        ]
      }
    ],
    cExpression: `inox::Promise::${name}`,
    cArgumentKinds: ['runtime-value'],
    cCallStyle: 'function',
    cResultMode: 'value',
    resultTypeRef,
    minArgs: 1,
    maxArgs: 1,
    argumentChecks: [{ valueTypes: ['object'], objectTypeIds: [arrayTypeId] }]
  }
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

function promiseReceiverOperation(
  sourceName: 'catch' | 'then',
  cName: 'catchError' | 'then',
  operationRole: 'map-fulfilled' | 'map-rejected',
  resultTypeRef: TypeRef,
  callbackParameterTypeRef: TypeRef,
  catchOperation: boolean
): LibraryOperationDescriptor {
  const typeParameters: LibraryOperationTypeParameterDescriptor[] = [
    { name: 'T', sources: [{ source: 'receiver-type-argument' as const, argumentIndex: 0 }] },
    {
      name: 'E',
      sources: [{ source: 'receiver-trait', traitId: 'awaitable', traitArgumentIndex: 1 }]
    }
  ]

  if (!catchOperation) {
    typeParameters.push({
      name: 'U',
      sources: [{ source: 'argument-function-return', argumentIndex: 0 }]
    })
  }

  return {
    libraryId,
    bindingId: `${promiseNativeTypeId}.${sourceName}`,
    operationId: `${promiseNativeTypeId}.${sourceName}`,
    kind: 'call',
    asyncResultOperation: operationRole,
    runtimeRequirements: [promiseRuntimeRequirement],
    receiverTypeId: promiseNativeTypeId,
    typeParameters,
    cExpression: cName,
    cArgumentKinds: ['receiver', 'runtime-callback'],
    cCallStyle: 'member',
    cResultMode: 'value',
    resultTypeRef,
    minArgs: 1,
    maxArgs: 1,
    argumentChecks: [
      {
        valueTypes: ['function'],
        functionParameters: [
          { name: catchOperation ? 'reason' : 'value', valueType: 'unknown', typeRef: callbackParameterTypeRef }
        ],
        functionAsync: false
      }
    ]
  }
}

function functionTypeRef(params: TypeRef[], result: TypeRef): TypeRef {
  return {
    kind: 'function',
    params,
    result,
    nullable: false,
    ownership: 'value',
    traits: []
  }
}
