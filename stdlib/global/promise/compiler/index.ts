import type {
  CompilerLibraryPackageDescriptor,
  LibraryOperationDescriptor,
  LibraryOperationTypeParameterDescriptor,
  NominalTypeRef,
  TypeRef
} from '../../../../compiler/extensions/types.ts'

const libraryId = 'global:promise'
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
  {
    libraryId,
    bindingId: 'global:Promise.resolve',
    operationId: `${promiseNativeTypeId}.resolve`,
    kind: 'call',
    asyncResultOperation: 'fulfill',
    runtimeRequirements: [promiseRuntimeRequirement],
    typeParameters: [{ name: 'T', sources: [{ source: 'argument-type', argumentIndex: 0 }] }],
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
        argumentChecks: [{ valueTypes: [], typeRef: fulfilledParameterTypeRef }]
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
  )
]

export const compilerLibraryPackage: CompilerLibraryPackageDescriptor = {
  id: libraryId,
  dependencies: [],
  nativeTypes: [
    {
      libraryId,
      typeId: promiseNativeTypeId,
      declarationNames: ['Promise'],
      valueType: 'async-result',
      cppType: 'inox::Promise',
      cValueAdapter: 'inox::Promise($value)',
      baseTypeIds: [],
      runtimeRequirements: [promiseRuntimeRequirement],
      cAwaitExpression: '$value.awaitValue()',
      cAsyncTaskBridge: {
        cValidExpression: '$source.valid()',
        cObserveExpression: '$source.observe($onFulfilled, $onRejected, $context, $finalizer)',
        cFulfillExpression: '$target.fulfill($value)',
        cRejectExpression: '$target.rejectWith($value)'
      },
      typeParameters: ['T'],
      traits: [{ traitId: 'awaitable', args: [fulfilledParameterTypeRef, unknownTypeRef] }]
    }
  ],
  operations,
  intrinsicBindings: [{ role: 'async-result', bindingId: promiseIntrinsicBindingId }],
  runtimeRequirements: [
    {
      id: promiseRuntimeRequirement,
      dependencies: ['async-runtime', 'managed-values'],
      cPreludeIncludes: ['inox/promise.h'],
      capabilities: []
    }
  ]
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
