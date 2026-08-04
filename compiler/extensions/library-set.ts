import type {
  CompilerLibrarySet,
  IntrinsicRole,
  LibraryAsyncResultOperationKind,
  LibraryDeclarationDescriptor,
  LibraryEffectiveReceiverOperationDescriptor,
  LibraryNativeTypeDescriptor,
  LibraryOperationDescriptor,
  LibraryOperationKind,
  LibraryResultShapeFieldDescriptor,
  LibraryTypeOperatorDescriptor
} from './types.ts'

export const emptyCompilerLibrarySet: CompilerLibrarySet = {
  fingerprint: 'inox:library-set:v1:811c9dc5',
  declarations: [],
  typeOperators: [],
  nativeTypes: [],
  operations: [],
  effectiveReceiverOperations: [],
  intrinsicBindings: [],
  runtimeRequirements: []
}

export function compilerLibraryTypeOperatorForName(
  libraries: CompilerLibrarySet,
  name: string
): LibraryTypeOperatorDescriptor | null {
  const operators = libraries.typeOperators ?? []
  let result: LibraryTypeOperatorDescriptor | null = null

  for (let index = 0; index < operators.length; index = index + 1) {
    if (operators[index].name !== name) {
      continue
    }

    if (result !== null) {
      return null
    }

    result = operators[index]
  }

  return result
}

export function compilerLibraryNativeTypeForName(
  libraries: CompilerLibrarySet,
  name: string,
  libraryId?: string | null
): LibraryNativeTypeDescriptor | null {
  let result: LibraryNativeTypeDescriptor | null = null

  for (let typeIndex = 0; typeIndex < libraries.nativeTypes.length; typeIndex = typeIndex + 1) {
    const nativeType = libraries.nativeTypes[typeIndex]

    if (libraryId !== null && typeof libraryId !== 'undefined' && nativeType.libraryId !== libraryId) {
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

export function compilerLibraryNativeTypeFields(
  libraries: CompilerLibrarySet,
  typeId: string
): LibraryResultShapeFieldDescriptor[] {
  const fields = new Map<string, LibraryResultShapeFieldDescriptor>()
  collectCompilerLibraryNativeTypeFields(libraries, typeId, fields, new Set())
  return Array.from(fields.values())
}

function collectCompilerLibraryNativeTypeFields(
  libraries: CompilerLibrarySet,
  typeId: string,
  fields: Map<string, LibraryResultShapeFieldDescriptor>,
  visited: Set<string>
): void {
  if (visited.has(typeId)) return
  visited.add(typeId)

  const nativeType = compilerLibraryNativeTypeForId(libraries, typeId)
  if (nativeType === null) return

  for (let index = 0; index < nativeType.baseTypeIds.length; index = index + 1) {
    collectCompilerLibraryNativeTypeFields(libraries, nativeType.baseTypeIds[index], fields, visited)
  }

  const ownFields = nativeType.fields ?? []
  for (let index = 0; index < ownFields.length; index = index + 1) {
    fields.set(ownFields[index].name, ownFields[index])
  }
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

export function compilerLibraryNativeCppTypeIsAssignableToTypeId(
  libraries: CompilerLibrarySet,
  sourceCppType: string | null | undefined,
  targetTypeId: string | null | undefined
): boolean {
  if (
    sourceCppType === null ||
    typeof sourceCppType === 'undefined' ||
    targetTypeId === null ||
    typeof targetTypeId === 'undefined' ||
    targetTypeId.length === 0
  ) {
    return false
  }

  const targetType = compilerLibraryNativeTypeForId(libraries, targetTypeId)

  if (targetType === null) {
    return false
  }

  if (sourceCppType === targetType.cppType) {
    return true
  }

  for (const sourceType of libraries.nativeTypes) {
    if (
      sourceType.cppType === sourceCppType &&
      compilerLibraryNativeTypeIsAssignable(libraries, sourceType.typeId, targetTypeId)
    ) {
      return true
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

export function resolveCompilerLibrarySet(libraries: CompilerLibrarySet | null | undefined): CompilerLibrarySet {
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

export function compilerLibraryOperationForIntrinsic(
  libraries: CompilerLibrarySet,
  role: IntrinsicRole,
  kind: LibraryOperationKind
): LibraryOperationDescriptor | null {
  for (let index = 0; index < libraries.intrinsicBindings.length; index = index + 1) {
    const binding = libraries.intrinsicBindings[index]

    if (binding.role === role) {
      return compilerLibraryOperationForBinding(libraries, null, binding.bindingId, kind)
    }
  }

  return null
}

/** Resolves an operation supplied by the library selected for an intrinsic async-result role. */
export function compilerLibraryAsyncResultOperationForIntrinsic(
  libraries: CompilerLibrarySet,
  role: IntrinsicRole,
  asyncResultOperation: LibraryAsyncResultOperationKind
): LibraryOperationDescriptor | null {
  const provider = compilerLibraryOperationForIntrinsic(libraries, role, 'construct')

  if (provider === null) {
    return null
  }

  let result: LibraryOperationDescriptor | null = null

  for (let index = 0; index < libraries.operations.length; index = index + 1) {
    const operation = libraries.operations[index]

    if (operation.libraryId !== provider.libraryId || operation.asyncResultOperation !== asyncResultOperation) {
      continue
    }

    if (result !== null) {
      return null
    }

    result = operation
  }

  return result
}

export function compilerLibraryNativeTypeForIntrinsic(
  libraries: CompilerLibrarySet,
  role: IntrinsicRole,
  kind: LibraryOperationKind
): LibraryNativeTypeDescriptor | null {
  const operation = compilerLibraryOperationForIntrinsic(libraries, role, kind)
  const resultTypeRef = operation?.resultTypeRef

  if (resultTypeRef?.kind !== 'nominal') {
    return null
  }

  return compilerLibraryNativeTypeForId(libraries, resultTypeRef.typeId)
}

export function compilerLibraryIntrinsicRoleForBinding(
  libraries: CompilerLibrarySet,
  bindingId: string
): IntrinsicRole | null {
  for (let index = 0; index < libraries.intrinsicBindings.length; index = index + 1) {
    const binding = libraries.intrinsicBindings[index]

    if (binding.bindingId === bindingId) {
      return binding.role
    }
  }

  return null
}

export function compilerLibraryIntrinsicRoleForTypeId(
  libraries: CompilerLibrarySet,
  typeId: string
): IntrinsicRole | null {
  for (let index = 0; index < libraries.intrinsicBindings.length; index = index + 1) {
    const binding = libraries.intrinsicBindings[index]

    for (let operationIndex = 0; operationIndex < libraries.operations.length; operationIndex = operationIndex + 1) {
      const operation = libraries.operations[operationIndex]

      if (!operationHasBinding(operation, binding.bindingId)) {
        continue
      }

      const resultTypeRef = operation.resultTypeRef

      if (resultTypeRef?.kind === 'nominal' && resultTypeRef.typeId === typeId) {
        return binding.role
      }

      const variants = operation.variants ?? []

      for (let variantIndex = 0; variantIndex < variants.length; variantIndex = variantIndex + 1) {
        const variantResultTypeRef = variants[variantIndex].resultTypeRef

        if (variantResultTypeRef?.kind === 'nominal' && variantResultTypeRef.typeId === typeId) {
          return binding.role
        }
      }
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
    return compilerLibraryOperationForUnknownReceiver(libraries, memberName, kind)
  }

  const effective = libraries.effectiveReceiverOperations

  if (effective !== null && typeof effective !== 'undefined') {
    const exact = compilerLibraryEffectiveOperationForReceiver(
      effective,
      receiverTypeId,
      memberName,
      kind
    )

    if (exact !== null) {
      return exact
    }

    return compilerLibraryEffectiveOperationForReceiver(effective, receiverTypeId, '*', kind)
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

  return compilerLibraryOperationForReceiverBinding(libraries, receiverTypeId, `${receiverTypeId}.*`, kind)
}

function compilerLibraryEffectiveOperationForReceiver(
  effective: LibraryEffectiveReceiverOperationDescriptor[],
  receiverTypeId: string,
  memberName: string,
  kind: LibraryOperationKind
): LibraryOperationDescriptor | null {
  for (let index = 0; index < effective.length; index = index + 1) {
    const entry = effective[index]

    if (
      entry.receiverTypeId === receiverTypeId &&
      entry.memberName === memberName &&
      entry.kind === kind
    ) {
      return entry.operation
    }
  }

  return null
}

function compilerLibraryOperationForUnknownReceiver(
  libraries: CompilerLibrarySet,
  memberName: string,
  kind: LibraryOperationKind
): LibraryOperationDescriptor | null {
  let matched: LibraryOperationDescriptor | null = null

  for (let index = 0; index < libraries.operations.length; index = index + 1) {
    const operation = libraries.operations[index]
    const receiverTypeId = operation.receiverTypeId

    if (
      operation.acceptsUnknownReceiver !== true ||
      operation.kind !== kind ||
      receiverTypeId === null ||
      typeof receiverTypeId === 'undefined'
    ) {
      continue
    }

    const receiverBinding = memberName.length === 0 ? `${receiverTypeId}.*` : `${receiverTypeId}.${memberName}`

    if (!operationHasBinding(operation, receiverBinding)) {
      continue
    }

    if (matched !== null) {
      return null
    }

    matched = operation
  }

  return matched
}

export function compilerLibraryPrimitiveReceiverTypeId(name: string): string {
  return `core:primitive:${name}`
}

export function compilerLibraryHasModuleDeclaration(libraries: CompilerLibrarySet, source: string): boolean {
  return compilerLibraryModuleDeclarationForSource(libraries, source) !== null
}

export function compilerLibraryModuleDeclarationForSource(
  libraries: CompilerLibrarySet,
  source: string
): LibraryDeclarationDescriptor | null {
  for (let index = 0; index < libraries.declarations.length; index = index + 1) {
    const declaration = libraries.declarations[index]

    if (declaration.kind === 'module' && declaration.source === source && declaration.compilerImplemented === true) {
      return declaration
    }
  }

  return null
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
