import type {
  CompilerLibraryPackageDescriptor,
  LibraryOperationDescriptor
} from '../../../../compiler/extensions/types.ts'

const libraryId = 'global:console'
const collectionsLibraryId = 'global:collections'
const arrayRuntimeRequirement = `${collectionsLibraryId}#array`
const runtimeRequirement = libraryId
const methodNames = ['error', 'info', 'log', 'warn']

export const compilerLibraryPackage: CompilerLibraryPackageDescriptor = {
  id: libraryId,
  dependencies: [collectionsLibraryId],
  operations: consoleOperations(),
  intrinsicBindings: [],
  runtimeRequirements: [
    {
      id: runtimeRequirement,
      dependencies: [arrayRuntimeRequirement, 'managed-values', 'objects', 'string-bytes'],
      cPreludeIncludes: ['inox/console.h'],
      capabilities: []
    }
  ]
}

function consoleOperations(): LibraryOperationDescriptor[] {
  const operations: LibraryOperationDescriptor[] = []

  for (let index = 0; index < methodNames.length; index = index + 1) {
    const name = methodNames[index]
    operations.push({
      libraryId,
      bindingId: `global:console.${name}`,
      operationId: `${libraryId}#${name}`,
      kind: 'call',
      runtimeRequirements: [runtimeRequirement],
      cExpression: `console.${name}`,
      cClassFormatExpression: 'inox::console_format_class_instance',
      cArgumentKinds: ['variadic-format-values'],
      cFailureMode: 'thrown',
      minArgs: 0,
      maxArgs: 16,
      argumentChecks: [],
      resultTypeRef: {
        kind: 'primitive',
        name: 'void',
        nullable: false,
        ownership: 'value',
        traits: []
      }
    })
  }

  return operations
}
