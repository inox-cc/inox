import type {
  CompilerLibraryDescriptor,
  CompilerLibrarySet,
  IntrinsicRoleBinding,
  LibraryDeclarationDescriptor,
  LibraryNestedResultShapeFieldDescriptor,
  LibraryOperationDescriptor,
  LibraryResultShapeFieldDescriptor,
  RuntimeRequirementDescriptor
} from './types.ts'

export function createCompilerLibrarySet(libraries: CompilerLibraryDescriptor[]): CompilerLibrarySet {
  const ordered = orderCompilerLibraries(libraries)
  const declarations: LibraryDeclarationDescriptor[] = []
  const operations: LibraryOperationDescriptor[] = []
  const intrinsicBindings: IntrinsicRoleBinding[] = []
  const runtimeRequirements: RuntimeRequirementDescriptor[] = []

  for (let libraryIndex = 0; libraryIndex < ordered.length; libraryIndex = libraryIndex + 1) {
    const library = ordered[libraryIndex]

    pushDeclarations(declarations, library.declarations)
    pushOperations(operations, library.operations)
    pushIntrinsicBindings(intrinsicBindings, library.intrinsicBindings)
    pushRuntimeRequirements(runtimeRequirements, library.runtimeRequirements)
  }

  validateCompilerLibrarySet(declarations, operations, intrinsicBindings, runtimeRequirements)

  return {
    fingerprint: compilerLibrarySetFingerprint(ordered),
    declarations,
    operations,
    intrinsicBindings,
    runtimeRequirements
  }
}

function orderCompilerLibraries(libraries: CompilerLibraryDescriptor[]): CompilerLibraryDescriptor[] {
  const byId: Map<string, CompilerLibraryDescriptor> = new Map()
  const ids: string[] = []

  for (let index = 0; index < libraries.length; index = index + 1) {
    const library = libraries[index]

    if (byId.has(library.id)) {
      throw new Error(`Duplicate compiler library id ${library.id}`)
    }

    byId.set(library.id, library)
    insertSortedString(ids, library.id)
  }

  for (let index = 0; index < libraries.length; index = index + 1) {
    validateLibraryDependencies(libraries[index], byId)
  }

  const ordered: CompilerLibraryDescriptor[] = []
  const completed: Set<string> = new Set()

  while (ordered.length < ids.length) {
    let selected: CompilerLibraryDescriptor | null = null

    for (let index = 0; index < ids.length; index = index + 1) {
      const id = ids[index]

      if (completed.has(id)) {
        continue
      }

      const library = requireLibrary(byId, id)

      if (dependenciesComplete(library.dependencies, completed)) {
        selected = library
        break
      }
    }

    if (selected === null) {
      throw new Error(`Compiler library dependency cycle: ${remainingLibraryIds(ids, completed).join(', ')}`)
    }

    completed.add(selected.id)
    ordered.push(selected)
  }

  return ordered
}

function validateLibraryDependencies(
  library: CompilerLibraryDescriptor,
  byId: Map<string, CompilerLibraryDescriptor>
): void {
  const seen: Set<string> = new Set()

  for (let index = 0; index < library.dependencies.length; index = index + 1) {
    const dependency = library.dependencies[index]

    if (seen.has(dependency)) {
      throw new Error(`Duplicate compiler library dependency ${library.id} -> ${dependency}`)
    }

    seen.add(dependency)

    if (!byId.has(dependency)) {
      throw new Error(`Missing compiler library dependency ${library.id} -> ${dependency}`)
    }
  }
}

function validateCompilerLibrarySet(
  declarations: LibraryDeclarationDescriptor[],
  operations: LibraryOperationDescriptor[],
  intrinsicBindings: IntrinsicRoleBinding[],
  runtimeRequirements: RuntimeRequirementDescriptor[]
): void {
  validateUniqueDeclarationSources(declarations)
  validateUniqueOperationIds(operations)
  validateUniqueIntrinsicRoles(intrinsicBindings)
  validateUniqueRuntimeRequirementIds(runtimeRequirements)
}

function validateUniqueDeclarationSources(declarations: LibraryDeclarationDescriptor[]): void {
  const seen: Set<string> = new Set()

  for (let index = 0; index < declarations.length; index = index + 1) {
    const declaration = declarations[index]
    const key = declaration.kind + ':' + declaration.source

    if (seen.has(key)) {
      throw new Error(`Duplicate compiler library declaration ${key}`)
    }

    seen.add(key)
  }
}

function validateUniqueOperationIds(operations: LibraryOperationDescriptor[]): void {
  const seen: Set<string> = new Set()

  for (let index = 0; index < operations.length; index = index + 1) {
    const id = operations[index].operationId

    if (seen.has(id)) {
      throw new Error(`Duplicate compiler library operation id ${id}`)
    }

    seen.add(id)
  }
}

function validateUniqueIntrinsicRoles(bindings: IntrinsicRoleBinding[]): void {
  const seen: Set<string> = new Set()

  for (let index = 0; index < bindings.length; index = index + 1) {
    const role = bindings[index].role

    if (seen.has(role)) {
      throw new Error(`Duplicate compiler library intrinsic provider ${role}`)
    }

    seen.add(role)
  }
}

function validateUniqueRuntimeRequirementIds(requirements: RuntimeRequirementDescriptor[]): void {
  const seen: Set<string> = new Set()

  for (let index = 0; index < requirements.length; index = index + 1) {
    const id = requirements[index].id

    if (seen.has(id)) {
      throw new Error(`Duplicate compiler runtime requirement id ${id}`)
    }

    seen.add(id)
  }
}

function compilerLibrarySetFingerprint(libraries: CompilerLibraryDescriptor[]): string {
  const rows: string[] = []

  for (let index = 0; index < libraries.length; index = index + 1) {
    const library = libraries[index]
    const dependencyIds = sortedStrings(library.dependencies)
    const declarationIds: string[] = []
    const operationIds: string[] = []
    const intrinsicIds: string[] = []
    const requirementIds: string[] = []

    for (let itemIndex = 0; itemIndex < library.declarations.length; itemIndex = itemIndex + 1) {
      const item = library.declarations[itemIndex]
      insertSortedString(
        declarationIds,
        item.kind + ':' + item.source + ':' + item.libraryId + ':' +
          (item.compilerImplemented === true ? 'implemented' : 'declaration-only') + ':' +
          item.declarationSource
      )
    }

    for (let itemIndex = 0; itemIndex < library.operations.length; itemIndex = itemIndex + 1) {
      const item = library.operations[itemIndex]
      insertSortedString(
        operationIds,
        item.libraryId + ':' + item.bindingId + ':' + item.operationId + ':' + item.kind + ':' +
          sortedStrings(item.bindingAliases ?? []).join(',') + ':' +
          sortedStrings(item.runtimeRequirements).join(',') + ':' +
          (item.cExpression ?? '') + ':' + (item.cArgumentKinds ?? []).join(',') + ':' +
          (item.cArgumentAdapters ?? []).join(',') + ':' + (item.cResultMode ?? '') + ':' +
          operationResultShapeFingerprint(item) + ':' + (item.resultArrayElementType ?? '') + ':' +
          (item.receiverTypeId ?? '') + ':' +
          (item.resultTypeId ?? '') + ':' + (item.cCallStyle ?? '') + ':' + (item.cFailureMode ?? '') + ':' +
          (item.minArgs ?? '') + ':' + (item.maxArgs ?? '') + ':' + operationArgumentChecksFingerprint(item) + ':' +
          (item.cppType ?? '') + ':' + (item.valueType ?? '') + ':' + (item.nullable === true ? 'nullable' : 'required') + ':' +
          (item.owned === true ? 'owned' : 'borrowed') + ':' + (item.constantValue ?? '') + ':' +
          (item.diagnosticCode ?? '') + ':' + (item.diagnosticMessage ?? '') + ':' +
          operationVariantsFingerprint(item)
      )
    }

    for (let itemIndex = 0; itemIndex < library.intrinsicBindings.length; itemIndex = itemIndex + 1) {
      const item = library.intrinsicBindings[itemIndex]
      insertSortedString(intrinsicIds, item.role + ':' + item.bindingId)
    }

    for (let itemIndex = 0; itemIndex < library.runtimeRequirements.length; itemIndex = itemIndex + 1) {
      const item = library.runtimeRequirements[itemIndex]
      insertSortedString(
        requirementIds,
        item.id + ':deps=' + sortedStrings(item.dependencies).join(',') +
          ':includes=' + sortedStrings(item.cPreludeIncludes).join(',') +
          ':capabilities=' + sortedStrings(item.capabilities).join(',') +
          ':backend=' + runtimeBackendConstraintsFingerprint(item) +
          ':entrypoint=' + runtimeEntrypointAdapterFingerprint(item)
      )
    }

    rows.push(
      library.id +
        '|deps=' + dependencyIds.join(',') +
        '|decl=' + declarationIds.join(',') +
        '|ops=' + operationIds.join(',') +
        '|intrinsics=' + intrinsicIds.join(',') +
        '|requirements=' + requirementIds.join(',')
    )
  }

  return 'inox:library-set:v1:' + shortStableHash(rows.join(';'))
}

function operationArgumentChecksFingerprint(operation: LibraryOperationDescriptor): string {
  const checks = operation.argumentChecks ?? []
  const rows: string[] = []

  for (let index = 0; index < checks.length; index = index + 1) {
    const check = checks[index]
    rows.push(
      sortedStrings(check.valueTypes).join(',') + ':' +
        sortedStrings(check.objectTypeIds ?? []).join(',') + ':' +
        (check.objectFieldValueType ?? '') + ':' +
        (check.arrayLiteralRequired === true ? 'literal' : '') + ':' +
        sortedStrings(check.arrayElementValueTypes ?? []).join(',') + ':' +
        sortedStrings(check.stringLiterals ?? []).join(',') + ':' +
        (check.literalDiagnosticCode ?? '') + ':' + (check.literalDiagnosticMessage ?? '')
    )
  }

  return rows.join(';')
}

function operationVariantsFingerprint(operation: LibraryOperationDescriptor): string {
  const variants = operation.variants ?? []
  const rows: string[] = []

  for (let index = 0; index < variants.length; index = index + 1) {
    const variant = variants[index]
    rows.push(
      (variant.minArgs ?? '') + ':' + (variant.maxArgs ?? '') + ':' +
        (variant.argumentIndex ?? '') + ':' + sortedStrings(variant.stringLiterals ?? []).join(',') + ':' +
        (variant.cExpression ?? '') + ':' + (variant.cArgumentKinds ?? []).join(',') + ':' +
        (variant.cArgumentAdapters ?? []).join(',') + ':' + (variant.cResultMode ?? '') + ':' +
        resultShapeFieldsFingerprint(variant.resultShapeFields ?? []) + ':' +
        (variant.resultArrayElementType ?? '') + ':' + (variant.resultTypeId ?? '') + ':' +
        (variant.cppType ?? '') + ':' + (variant.valueType ?? '') + ':' +
        (variant.nullable === true ? 'nullable' : 'required') + ':' +
        (variant.owned === true ? 'owned' : 'borrowed')
    )
  }

  return rows.join(';')
}

function runtimeBackendConstraintsFingerprint(requirement: RuntimeRequirementDescriptor): string {
  const constraints = requirement.backendConstraints ?? []
  const rows: string[] = []

  for (let index = 0; index < constraints.length; index = index + 1) {
    const constraint = constraints[index]
    rows.push(
      constraint.option + ':' + sortedStrings(constraint.allowedValues).join(',') + ':' +
        constraint.diagnosticCode + ':' + constraint.diagnosticMessage
    )
  }

  rows.sort()
  return rows.join(';')
}

function operationResultShapeFingerprint(operation: LibraryOperationDescriptor): string {
  const fields = operation.resultShapeFields

  if (fields === null || typeof fields === 'undefined') {
    return ''
  }

  return resultShapeFieldsFingerprint(fields)
}

function resultShapeFieldsFingerprint(
  fields: LibraryResultShapeFieldDescriptor[]
): string {
  const rows: string[] = []

  for (let index = 0; index < fields.length; index = index + 1) {
    const field = fields[index]
    const nestedFields = field.resultShapeFields
    rows.push(
      `${field.name}=${field.valueType}:${field.readonly ? 'readonly' : 'mutable'}:` +
        `${field.resultTypeId ?? ''}:${field.cppType ?? ''}:` +
        (nestedFields === null || typeof nestedFields === 'undefined'
          ? ''
          : `{${nestedResultShapeFieldsFingerprint(nestedFields)}}`)
    )
  }

  return rows.join(',')
}

function nestedResultShapeFieldsFingerprint(
  fields: LibraryNestedResultShapeFieldDescriptor[]
): string {
  const rows: string[] = []

  for (let index = 0; index < fields.length; index = index + 1) {
    const field = fields[index]
    rows.push(
      `${field.name}=${field.valueType}:${field.readonly ? 'readonly' : 'mutable'}:` +
        `${field.resultTypeId ?? ''}:${field.cppType ?? ''}`
    )
  }

  return rows.join(',')
}

function runtimeEntrypointAdapterFingerprint(requirement: RuntimeRequirementDescriptor): string {
  const adapter = requirement.cEntrypointAdapter

  if (adapter === null || typeof adapter === 'undefined') {
    return ''
  }

  return adapter.cFunction + ':' + (adapter.acceptsEntryPath ? 'entry-path' : 'no-entry-path')
}

function shortStableHash(value: string): string {
  let hash = 2166136261
  const modulus = 4294967291
  const multiplier = 65599

  for (let index = 0; index < value.length; index = index + 1) {
    const raw = hash * multiplier + value.charCodeAt(index)
    hash = raw - Math.trunc(raw / modulus) * modulus
  }

  return (hash + 4294967296).toString(16).slice(1, 9)
}

function dependenciesComplete(dependencies: string[], completed: Set<string>): boolean {
  for (let index = 0; index < dependencies.length; index = index + 1) {
    if (!completed.has(dependencies[index])) {
      return false
    }
  }

  return true
}

function remainingLibraryIds(ids: string[], completed: Set<string>): string[] {
  const result: string[] = []

  for (let index = 0; index < ids.length; index = index + 1) {
    if (!completed.has(ids[index])) {
      result.push(ids[index])
    }
  }

  return result
}

function requireLibrary(
  libraries: Map<string, CompilerLibraryDescriptor>,
  id: string
): CompilerLibraryDescriptor {
  const library = libraries.get(id)

  if (library === null || typeof library === 'undefined') {
    throw new Error(`Missing compiler library ${id}`)
  }

  return library
}

function sortedStrings(values: string[]): string[] {
  const result: string[] = []

  for (let index = 0; index < values.length; index = index + 1) {
    insertSortedString(result, values[index])
  }

  return result
}

function insertSortedString(values: string[], value: string): void {
  values.push(value)
  let index = values.length - 1

  while (index > 0 && values[index - 1] > value) {
    values[index] = values[index - 1]
    index = index - 1
  }

  values[index] = value
}

function pushDeclarations(target: LibraryDeclarationDescriptor[], values: LibraryDeclarationDescriptor[]): void {
  for (let index = 0; index < values.length; index = index + 1) {
    target.push(values[index])
  }
}

function pushOperations(target: LibraryOperationDescriptor[], values: LibraryOperationDescriptor[]): void {
  for (let index = 0; index < values.length; index = index + 1) {
    target.push(values[index])
  }
}

function pushIntrinsicBindings(target: IntrinsicRoleBinding[], values: IntrinsicRoleBinding[]): void {
  for (let index = 0; index < values.length; index = index + 1) {
    target.push(values[index])
  }
}

function pushRuntimeRequirements(
  target: RuntimeRequirementDescriptor[],
  values: RuntimeRequirementDescriptor[]
): void {
  for (let index = 0; index < values.length; index = index + 1) {
    target.push(values[index])
  }
}
