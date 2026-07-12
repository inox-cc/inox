import type {
  CompilerLibrarySet,
  LibraryOperationDescriptor,
  LibraryOperationKind
} from './types.ts'

export const emptyCompilerLibrarySet: CompilerLibrarySet = {
  fingerprint: 'inox:library-set:v1:811c9dc5',
  declarations: [],
  operations: [],
  intrinsicBindings: [],
  runtimeRequirements: []
}

export function resolveCompilerLibrarySet(
  libraries: CompilerLibrarySet | null | undefined
): CompilerLibrarySet {
  if (libraries !== null && typeof libraries !== 'undefined') {
    return libraries
  }

  return emptyCompilerLibrarySet
}

export function compilerLibraryOperationForImport(
  libraries: CompilerLibrarySet,
  source: string | null | undefined,
  importedName: string | null | undefined,
  memberPath: string[],
  kind: LibraryOperationKind
): LibraryOperationDescriptor | null {
  if (
    source === null ||
    typeof source === 'undefined' ||
    importedName === null ||
    typeof importedName === 'undefined'
  ) {
    return null
  }

  const libraryId = compilerLibraryIdForImportSource(libraries, source)

  if (libraryId === null) {
    return null
  }

  let bindingId = `${libraryId}#module:${source}:${importedName}`

  for (let index = 0; index < memberPath.length; index = index + 1) {
    bindingId = `${bindingId}.${memberPath[index]}`
  }

  for (let index = 0; index < libraries.operations.length; index = index + 1) {
    const operation = libraries.operations[index]

    if (operation.kind === kind && operationHasBinding(operation, bindingId)) {
      return operation
    }
  }

  return null
}

export function compilerLibraryOperationForGlobal(
  libraries: CompilerLibrarySet,
  globalPath: string[],
  kind: LibraryOperationKind
): LibraryOperationDescriptor | null {
  if (globalPath.length === 0) {
    return null
  }

  const bindingId = `global:${globalPath.join('.')}`

  for (let index = 0; index < libraries.operations.length; index = index + 1) {
    const operation = libraries.operations[index]

    if (operation.kind === kind && operationHasBinding(operation, bindingId)) {
      return operation
    }
  }

  return null
}

export function compilerLibraryOperationForReceiver(
  libraries: CompilerLibrarySet,
  receiverTypeId: string | null | undefined,
  memberName: string,
  kind: LibraryOperationKind
): LibraryOperationDescriptor | null {
  if (receiverTypeId === null || typeof receiverTypeId === 'undefined') {
    return null
  }

  const exact = compilerLibraryOperationForReceiverBinding(
    libraries,
    receiverTypeId,
    `${receiverTypeId}.${memberName}`,
    kind
  )

  if (exact !== null) {
    return exact
  }

  return compilerLibraryOperationForReceiverBinding(
    libraries,
    receiverTypeId,
    `${receiverTypeId}.*`,
    kind
  )
}

export function compilerLibraryHasModuleDeclaration(
  libraries: CompilerLibrarySet,
  source: string
): boolean {
  for (let index = 0; index < libraries.declarations.length; index = index + 1) {
    const declaration = libraries.declarations[index]

    if (
      declaration.kind === 'module' &&
      declaration.source === source &&
      declaration.compilerImplemented === true
    ) {
      return true
    }
  }

  return false
}

function compilerLibraryIdForImportSource(libraries: CompilerLibrarySet, source: string): string | null {
  for (let index = 0; index < libraries.declarations.length; index = index + 1) {
    const declaration = libraries.declarations[index]

    if (declaration.kind === 'module' && declaration.source === source) {
      return declaration.libraryId
    }
  }

  return null
}

function operationHasBinding(operation: LibraryOperationDescriptor, bindingId: string): boolean {
  if (operation.bindingId === bindingId) {
    return true
  }

  const aliases = operation.bindingAliases

  if (aliases === null || typeof aliases === 'undefined') {
    return false
  }

  for (let index = 0; index < aliases.length; index = index + 1) {
    if (aliases[index] === bindingId) {
      return true
    }
  }

  return false
}

function compilerLibraryOperationForReceiverBinding(
  libraries: CompilerLibrarySet,
  receiverTypeId: string,
  bindingId: string,
  kind: LibraryOperationKind
): LibraryOperationDescriptor | null {
  for (let index = 0; index < libraries.operations.length; index = index + 1) {
    const operation = libraries.operations[index]

    if (
      operation.kind === kind &&
      operation.receiverTypeId === receiverTypeId &&
      operationHasBinding(operation, bindingId)
    ) {
      return operation
    }
  }

  return null
}
