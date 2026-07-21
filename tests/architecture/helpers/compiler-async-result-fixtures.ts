import type {
  CompilerLibraryDescriptor,
  NominalTypeRef
} from '../../../compiler/extensions/types.ts'

const libraryId = 'fixture:async-result'
const bindingId = 'intrinsic:task'
const operationId = `${libraryId}#construct`
const typeId = `${libraryId}#Task`

export const incompleteAsyncResultOperationId = operationId

export function incompleteAsyncResultLibrary(): CompilerLibraryDescriptor {
  return {
    id: libraryId,
    dependencies: [],
    declarations: [
      {
        libraryId,
        kind: 'global',
        source: 'tests/architecture/fixtures/async-result.d.ts',
        declarationSource: 'export {}; declare global { function makeTask(): unknown; }',
        compilerImplemented: true
      }
    ],
    nativeTypes: [],
    operations: [
      {
        libraryId,
        bindingId,
        operationId,
        kind: 'construct',
        asyncResultOperation: 'create',
        runtimeRequirements: []
      },
      {
        libraryId,
        bindingId: 'global:makeTask',
        operationId: `${libraryId}#makeTask`,
        kind: 'call',
        runtimeRequirements: [],
        cExpression: 'fixture_make_task',
        valueType: 'async-result',
        minArgs: 0,
        maxArgs: 0,
        argumentChecks: []
      }
    ],
    intrinsicBindings: [{ role: 'async-result', bindingId }],
    runtimeRequirements: []
  }
}

export function emptyCppAsyncResultLibrary(): CompilerLibraryDescriptor {
  const library = incompleteAsyncResultLibrary()

  library.nativeTypes = [
    {
      libraryId,
      typeId,
      declarationNames: [],
      valueType: 'async-result',
      cppType: '',
      baseTypeIds: [],
      runtimeRequirements: []
    }
  ]
  library.operations[0].resultTypeRef = taskTypeRef()
  return library
}

function taskTypeRef(): NominalTypeRef {
  return {
    kind: 'nominal',
    typeId,
    args: [],
    nullable: false,
    ownership: 'value',
    traits: []
  }
}
