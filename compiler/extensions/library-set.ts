import type {
  CompilerLibrarySet,
  LibraryNativeTypeDescriptor,
  LibraryOperationDescriptor,
  LibraryOperationKind
} from './types.ts'

export const emptyCompilerLibrarySet: CompilerLibrarySet = {
  fingerprint: 'inox:library-set:v1:811c9dc5',
  declarations: [],
  nativeTypes: [],
  operations: [],
  intrinsicBindings: [],
  runtimeRequirements: []
}

export function compilerLibraryNativeTypeForName(
  libraries: CompilerLibrarySet,
  name: string,
  libraryId?: string | null
): LibraryNativeTypeDescriptor | null {
  let result: LibraryNativeTypeDescriptor | null = null

  for (let typeIndex = 0; typeIndex < libraries.nativeTypes.length; typeIndex = typeIndex + 1) {
    const nativeType = libraries.nativeTypes[typeIndex]

    if (
      libraryId !== null &&
      typeof libraryId !== 'undefined' &&
      nativeType.libraryId !== libraryId
    ) {
      continue
    }

    for (let nameIndex = 0; nameIndex < nativeType.declarationNames.length; nameIndex = nameIndex + 1) {
      if (nativeType.declarationNames[nameIndex] === name) {
        if (result !== null) {
          return null
        }

        result = nativeType
      }
    }
  }

  return result
}

export function compilerLibraryNativeTypeIsAssignable(
  libraries: CompilerLibrarySet,
  sourceTypeId: string | null | undefined,
  targetTypeId: string | null | undefined
): boolean {
  if (
    sourceTypeId === null ||
    typeof sourceTypeId === 'undefined' ||
    targetTypeId === null ||
    typeof targetTypeId === 'undefined'
  ) {
    return false
  }

  if (sourceTypeId === targetTypeId) {
    return true
  }

  const pending: string[] = [sourceTypeId]
  const visited: Set<string> = new Set()

  while (pending.length > 0) {
    const current = pending.pop()

    if (current === null || typeof current === 'undefined' || visited.has(current)) {
      continue
    }

    visited.add(current)
    const nativeType = compilerLibraryNativeTypeForId(libraries, current)

    if (nativeType === null) {
      continue
    }

    for (let index = 0; index < nativeType.baseTypeIds.length; index = index + 1) {
      const baseTypeId = nativeType.baseTypeIds[index]

      if (baseTypeId === targetTypeId) {
        return true
      }

      pending.push(baseTypeId)
    }
  }

  return false
}

export function compilerLibraryNativeTypeForId(
  libraries: CompilerLibrarySet,
  typeId: string
): LibraryNativeTypeDescriptor | null {
  for (let index = 0; index < libraries.nativeTypes.length; index = index + 1) {
    if (libraries.nativeTypes[index].typeId === typeId) {
      return libraries.nativeTypes[index]
    }
  }

  return null
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

  return compilerLibraryOperationForBinding(libraries, null, bindingId, kind)
}

export function compilerLibraryOperationForBinding(
  libraries: CompilerLibrarySet,
  libraryId: string | null,
  bindingId: string,
  kind: LibraryOperationKind
): LibraryOperationDescriptor | null {

  for (let index = 0; index < libraries.operations.length; index = index + 1) {
    const operation = libraries.operations[index]

    if (
      operation.kind === kind &&
      (libraryId === null || operation.libraryId === libraryId) &&
      operationHasBinding(operation, bindingId)
    ) {
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
