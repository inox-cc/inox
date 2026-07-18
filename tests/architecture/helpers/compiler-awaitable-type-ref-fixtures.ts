import { createCompilerLibrarySet } from '../../../compiler/extensions/library-set-builder.ts'
import type {
  CompilerLibraryDescriptor,
  CompilerLibrarySet,
  LibraryOperationDescriptor,
  TypeRef
} from '../../../compiler/extensions/types.ts'

const libraryId = 'fixture:awaitable'
const completionTypeId = `${libraryId}#Completion`
const conflictedOperationId = `${libraryId}#read-conflicted`

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
          'export {}; declare global { function readTypedCompletion(): unknown; function readConflictedCompletion(): unknown; function readLegacyCompletion(): unknown; }',
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
        runtimeRequirements: []
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
        resultTypeRef: completionTypeRef()
      },
      awaitableOperation('global:readTypedCompletion', `${libraryId}#read-typed`),
      awaitableOperation('global:readConflictedCompletion', conflictedOperationId),
      {
        libraryId,
        bindingId: 'global:readLegacyCompletion',
        operationId: `${libraryId}#read-legacy`,
        kind: 'call',
        runtimeRequirements: [],
        cExpression: 'fixture_read_legacy_completion',
        valueType: 'promise',
        promiseValueType: 'number',
        minArgs: 0,
        maxArgs: 0,
        argumentChecks: []
      }
    ],
    intrinsicBindings: [{ role: 'async-result', bindingId: 'intrinsic:completion' }],
    runtimeRequirements: []
  }
  const libraries = createCompilerLibrarySet([library])
  const conflicted = libraries.operations.find((operation) => operation.operationId === conflictedOperationId)

  if (typeof conflicted === 'undefined') {
    throw new Error(`Missing synthetic operation ${conflictedOperationId}`)
  }

  conflicted.promiseValueType = 'number'
  return libraries
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

function primitiveTypeRef(name: 'boolean' | 'string'): TypeRef {
  return { kind: 'primitive', name, nullable: false, ownership: 'value', traits: [] }
}
