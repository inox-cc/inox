import assert from 'node:assert/strict'

import { createCompilerLibrarySet } from '../../../compiler/extensions/library-set-builder.ts'
import type {
  CompilerLibraryDescriptor,
  LibraryOperationDescriptor,
  LibraryOperationTypeParameterDescriptor,
  NominalTypeRef,
  TypeRef
} from '../../../compiler/extensions/types.ts'
import { compilerLibraryPackage as errorCompilerLibraryPackage } from '../../../stdlib/global/error/compiler/index.ts'
import { compilerLibraryPackageWithGlobalDeclaration } from './compiler-library-fixtures.ts'

export const futureLibraryId = 'fixture:future'
export const futureNativeTypeId = `${futureLibraryId}#FutureState`
export const futureRuntimeRequirement = `${futureLibraryId}#engine`
export const futureRuntimeHeader = 'fixture/future-runtime.hpp'

export const futureIntrinsicBindingId = 'global:Future'
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
const numberTypeRef: TypeRef = {
  kind: 'primitive',
  name: 'number',
  nullable: false,
  ownership: 'value',
  traits: []
}

export function assertFutureValidityContract(source: string, cppType = 'FixtureFuture'): void {
  assert.match(source, new RegExp(`${escapeRegex(cppType)}::bridgeReady\\(`))
  assert.doesNotMatch(source, /\.valid\(\)/)
}

export function futureLibrarySet(cppType = 'fixture::FutureTask', withAsyncTaskBridge = true) {
  const library: CompilerLibraryDescriptor = {
    id: futureLibraryId,
    dependencies: [],
    declarations: [
      {
        libraryId: futureLibraryId,
        kind: 'global',
        source: 'tests/architecture/fixtures/future.d.ts',
        compilerImplemented: true,
        declarationSource: `
export {}

declare global {
  class Future<T> {
    constructor(executor: (complete: (value: T) => void, abort: (reason: unknown) => void) => void);

    static succeed<T>(value: T): Future<T>;
    static succeed(): Future<void>;
    static fail<E>(reason: E): Future<unknown>;
    static fail(): Future<unknown>;

    map<U>(onValue: (value: T) => U): Future<U>;
    recover(onFailure: (reason: unknown) => T): Future<T>;
  }

  function futureFromNative(value: number): Future<number>;
}
`
      }
    ],
    nativeTypes: [
      {
        libraryId: futureLibraryId,
        typeId: futureNativeTypeId,
        declarationNames: ['Future'],
        valueType: 'async-result',
        cppType,
        cValueAdapter: `${cppType}::fromRuntime($value)`,
        baseTypeIds: [],
        runtimeRequirements: [futureRuntimeRequirement],
        cAwaitExpression: '$value.takeValue()',
        cCoroutineAwaitExpression: `co_await ${cppType}::bridgeAwait($value)`,
        cAsyncTaskBridge: withAsyncTaskBridge
          ? {
              cValidExpression: `${cppType}::bridgeReady($source)`,
              cObserveExpression:
                `${cppType}::bridgeWatch($source, ` + '$onFulfilled, $onRejected, $context, $finalizer)',
              cFulfillExpression: `${cppType}::bridgeComplete($target, $value)`,
              cRejectExpression: `${cppType}::bridgeAbort($target, $value)`
            }
          : null,
        typeParameters: ['T'],
        traits: [{ traitId: 'awaitable', args: [fulfilledParameterTypeRef, unknownTypeRef] }]
      }
    ],
    operations: futureOperations(cppType),
    intrinsicBindings: [{ role: 'async-result', bindingId: futureIntrinsicBindingId }],
    runtimeRequirements: [
      {
        id: futureRuntimeRequirement,
        dependencies: ['async-runtime', 'managed-values'],
        cPreludeIncludes: [futureRuntimeHeader],
        capabilities: []
      }
    ]
  }

  return createCompilerLibrarySet([
    compilerLibraryPackageWithGlobalDeclaration(errorCompilerLibraryPackage, 'stdlib/global/error/index.d.ts'),
    library
  ])
}

function futureOperations(cppType: string): LibraryOperationDescriptor[] {
  return [
    {
      libraryId: futureLibraryId,
      bindingId: futureIntrinsicBindingId,
      operationId: `${futureNativeTypeId}.launch`,
      kind: 'construct',
      asyncResultOperation: 'create',
      cAsyncFulfillExpression: 'complete',
      cAsyncRejectExpression: 'abort',
      runtimeRequirements: [futureRuntimeRequirement],
      typeParameters: [
        {
          name: 'T',
          sources: [
            { source: 'explicit-type-argument', argumentIndex: 0 },
            { source: 'contextual-type-argument', argumentIndex: 0 }
          ]
        }
      ],
      cExpression: `${cppType}::launch`,
      cArgumentKinds: [],
      cCallStyle: 'function',
      cResultMode: 'value',
      resultTypeRef: futureTypeRef(fulfilledParameterTypeRef, unknownTypeRef),
      minArgs: 1,
      maxArgs: 1,
      argumentChecks: [
        {
          valueTypes: ['function'],
          functionParameters: [
            {
              name: 'complete',
              valueType: 'function',
              typeRef: functionTypeRef([fulfilledParameterTypeRef], voidTypeRef)
            },
            {
              name: 'abort',
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
      libraryId: futureLibraryId,
      bindingId: 'global:Future.succeed',
      operationId: `${futureNativeTypeId}.complete`,
      kind: 'call',
      asyncResultOperation: 'fulfill',
      runtimeRequirements: [futureRuntimeRequirement],
      typeParameters: [{ name: 'T', sources: [{ source: 'argument-type', argumentIndex: 0 }] }],
      cExpression: `${cppType}::completed`,
      cCallStyle: 'function',
      cResultMode: 'value',
      resultTypeRef: futureTypeRef(fulfilledParameterTypeRef, unknownTypeRef),
      minArgs: 0,
      maxArgs: 1,
      variants: [
        {
          minArgs: 0,
          maxArgs: 0,
          cArgumentKinds: [],
          argumentChecks: [],
          resultTypeRef: futureTypeRef(voidTypeRef, unknownTypeRef)
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
      libraryId: futureLibraryId,
      bindingId: 'global:Future.fail',
      operationId: `${futureNativeTypeId}.abort`,
      kind: 'call',
      asyncResultOperation: 'reject',
      runtimeRequirements: [futureRuntimeRequirement],
      typeParameters: [{ name: 'E', sources: [{ source: 'argument-type', argumentIndex: 0 }] }],
      cExpression: `${cppType}::failed`,
      cCallStyle: 'function',
      cResultMode: 'value',
      resultTypeRef: futureTypeRef(unknownTypeRef, rejectedParameterTypeRef),
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
    {
      libraryId: futureLibraryId,
      bindingId: 'global:futureFromNative',
      operationId: `${futureNativeTypeId}.from-native`,
      kind: 'call',
      runtimeRequirements: [futureRuntimeRequirement],
      cExpression: `${cppType}::fromNumber`,
      cArgumentKinds: ['number'],
      cCallStyle: 'function',
      cResultMode: 'value',
      resultTypeRef: futureTypeRef(numberTypeRef, unknownTypeRef),
      minArgs: 1,
      maxArgs: 1,
      argumentChecks: [{ valueTypes: ['number'] }]
    },
    futureReceiverOperation(
      'map',
      'transformValue',
      'map-fulfilled',
      futureTypeRef(mappedParameterTypeRef, rejectedParameterTypeRef),
      fulfilledParameterTypeRef,
      false
    ),
    futureReceiverOperation(
      'recover',
      'recoverFailure',
      'map-rejected',
      futureTypeRef(fulfilledParameterTypeRef, unknownTypeRef),
      rejectedParameterTypeRef,
      true
    )
  ]
}

function futureReceiverOperation(
  sourceName: 'map' | 'recover',
  cName: 'recoverFailure' | 'transformValue',
  operationRole: 'map-fulfilled' | 'map-rejected',
  resultTypeRef: TypeRef,
  callbackParameterTypeRef: TypeRef,
  recoveryOperation: boolean
): LibraryOperationDescriptor {
  const typeParameters: LibraryOperationTypeParameterDescriptor[] = [
    { name: 'T', sources: [{ source: 'receiver-type-argument' as const, argumentIndex: 0 }] },
    {
      name: 'E',
      sources: [{ source: 'receiver-trait', traitId: 'awaitable', traitArgumentIndex: 1 }]
    }
  ]

  if (!recoveryOperation) {
    typeParameters.push({
      name: 'U',
      sources: [{ source: 'argument-function-return', argumentIndex: 0 }]
    })
  }

  return {
    libraryId: futureLibraryId,
    bindingId: `${futureNativeTypeId}.${sourceName}`,
    operationId: `${futureNativeTypeId}.${sourceName}`,
    kind: 'call',
    asyncResultOperation: operationRole,
    runtimeRequirements: [futureRuntimeRequirement],
    receiverTypeId: futureNativeTypeId,
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
          {
            name: recoveryOperation ? 'reason' : 'value',
            valueType: 'unknown',
            typeRef: callbackParameterTypeRef
          }
        ],
        functionAsync: false
      }
    ]
  }
}

function futureTypeRef(fulfilledType: TypeRef, rejectedType: TypeRef): NominalTypeRef {
  return {
    kind: 'nominal',
    typeId: futureNativeTypeId,
    args: [fulfilledType],
    nullable: false,
    ownership: 'value',
    traits: [{ traitId: 'awaitable', args: [fulfilledType, rejectedType] }]
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

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
