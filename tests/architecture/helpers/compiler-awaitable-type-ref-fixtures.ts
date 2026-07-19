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
        valueType: 'promise',
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
        asyncResultOperation: 'construct',
        runtimeRequirements: [],
        cExpression: 'FixtureCompletion',
        resultTypeRef: completionTypeRef()
      },
      asyncTaskOperation('resolve'),
      asyncTaskOperation('reject'),
      asyncTaskOperation('then'),
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

function asyncTaskOperation(kind: 'resolve' | 'reject' | 'then'): LibraryOperationDescriptor {
  return {
    libraryId,
    bindingId: `${libraryId}#${kind}`,
    operationId: `${libraryId}#${kind}`,
    kind: 'call',
    asyncResultOperation: kind,
    runtimeRequirements: [],
    cExpression: `FixtureCompletion::${kind}`
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
