import { createCompilerLibrarySet } from '../../../compiler/extensions/library-set-builder.ts'
import type {
  CompilerLibraryDescriptor,
  CompilerLibrarySet,
  LibraryOperationDescriptor,
  TypeRef
} from '../../../compiler/extensions/types.ts'

const libraryId = 'fixture:awaitable'
const completionTypeId = `${libraryId}#Completion`

export function neutralAwaitableLibrarySet(): CompilerLibrarySet {
  const library: CompilerLibraryDescriptor = {
    id: libraryId,
    dependencies: [],
    declarations: [
      {
        libraryId,
        kind: 'global',
        source: 'tests/architecture/fixtures/awaitable.d.ts',
        declarationSource:
          'export {}; declare global { function readTypedCompletion(): unknown; function readUnawaitableCompletion(): unknown; }',
        compilerImplemented: true
      }
    ],
    nativeTypes: [
      {
        libraryId,
        typeId: completionTypeId,
        declarationNames: [],
        valueType: 'async-result',
        cppType: 'FixtureCompletion',
        baseTypeIds: [],
        runtimeRequirements: [],
        cAsyncTaskBridge: {
          cValidExpression: '$source.valid()',
          cObserveExpression: '$source.observe($onFulfilled, $onRejected, $context, $finalizer)',
          cFulfillExpression: '$target.fulfill($value)',
          cRejectExpression: '$target.reject($value)'
        }
      }
    ],
    operations: [
      {
        libraryId,
        bindingId: 'intrinsic:completion',
        operationId: `${libraryId}#construct`,
        kind: 'construct',
        asyncResultOperation: 'create',
        cAsyncFulfillExpression: 'fulfill',
        cAsyncRejectExpression: 'reject',
        runtimeRequirements: [],
        cExpression: 'FixtureCompletion',
        resultTypeRef: completionTypeRef()
      },
      asyncTaskOperation('fulfill', 'resolve'),
      asyncTaskOperation('reject'),
      asyncTaskOperation('map-fulfilled', 'then'),
      awaitableOperation('global:readTypedCompletion', `${libraryId}#read-typed`),
      {
        libraryId,
        bindingId: 'global:readUnawaitableCompletion',
        operationId: `${libraryId}#read-unawaitable`,
        kind: 'call',
        runtimeRequirements: [],
        cExpression: 'fixture_read_unawaitable_completion',
        resultTypeRef: unawaitableCompletionTypeRef(),
        minArgs: 0,
        maxArgs: 0,
        argumentChecks: []
      }
    ],
    intrinsicBindings: [{ role: 'async-result', bindingId: 'intrinsic:completion' }],
    runtimeRequirements: []
  }
  return createCompilerLibrarySet([library])
}

function asyncTaskOperation(
  kind: 'fulfill' | 'reject' | 'map-fulfilled',
  configuredCName?: 'resolve' | 'reject' | 'then'
): LibraryOperationDescriptor {
  let cName: 'resolve' | 'reject' | 'then' = 'reject'

  if (configuredCName !== null && typeof configuredCName !== 'undefined') {
    cName = configuredCName
  } else if (kind === 'fulfill') {
    cName = 'resolve'
  } else if (kind === 'map-fulfilled') {
    cName = 'then'
  }

  return {
    libraryId,
    bindingId: `${libraryId}#${kind}`,
    operationId: `${libraryId}#${kind}`,
    kind: 'call',
    asyncResultOperation: kind,
    runtimeRequirements: [],
    cExpression: `FixtureCompletion::${cName}`
  }
}

function awaitableOperation(bindingId: string, operationId: string): LibraryOperationDescriptor {
  return {
    libraryId,
    bindingId,
    operationId,
    kind: 'call',
    runtimeRequirements: [],
    cExpression: 'fixture_read_completion',
    resultTypeRef: completionTypeRef(),
    minArgs: 0,
    maxArgs: 0,
    argumentChecks: []
  }
}

function completionTypeRef(): TypeRef {
  return {
    kind: 'nominal',
    typeId: completionTypeId,
    args: [],
    nullable: false,
    ownership: 'value',
    traits: [
      {
        traitId: 'awaitable',
        args: [primitiveTypeRef('string'), primitiveTypeRef('boolean')]
      }
    ]
  }
}

function unawaitableCompletionTypeRef(): TypeRef {
  return {
    kind: 'nominal',
    typeId: completionTypeId,
    args: [],
    nullable: false,
    ownership: 'value',
    traits: []
  }
}

function primitiveTypeRef(name: 'boolean' | 'string'): TypeRef {
  return { kind: 'primitive', name, nullable: false, ownership: 'value', traits: [] }
}
