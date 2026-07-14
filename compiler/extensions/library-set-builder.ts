import type {
  CompilerLibraryDescriptor,
  CompilerLibrarySet,
  IntrinsicRoleBinding,
  LibraryArgumentCheckDescriptor,
  LibraryCValueMappingDescriptor,
  LibraryDeclarationDescriptor,
  LibraryCallbackParameterDescriptor,
  LibraryNativeTypeDescriptor,
  LibraryOptionDescriptor,
  LibraryOptionScalar,
  LibraryNestedResultShapeFieldDescriptor,
  LibraryOperationDescriptor,
  LibraryResultShapeFieldDescriptor,
  LibraryRuntimeInitializerArgumentDescriptor,
  LibraryRuntimeInitializerDescriptor,
  RuntimeRequirementDescriptor
} from './types.ts'
import { formatDiagnostics } from '../diagnostics.ts'
import { parseCompilerLibraryGlobalDeclarations } from './global-declarations.ts'
import {
  compilerLibraryOptionScalarText,
  compilerLibraryOptionScalarType,
  compilerLibraryOptionScalarsEqual,
  validateCompilerLibraryOptionValue,
  validateCompilerLibraryOptionDescriptors
} from './library-options.ts'

const compilerCoreRuntimeRequirementIds = [
  'async-runtime',
  'callback-values',
  'clocks',
  'collections',
  'debug-memory',
  'json',
  'managed-values',
  'objects',
  'string-bytes',
  'weak-references'
]

export function createCompilerLibrarySet(libraries: CompilerLibraryDescriptor[]): CompilerLibrarySet {
  const ordered = orderCompilerLibraries(libraries)
  const declarations: LibraryDeclarationDescriptor[] = []
  const options: LibraryOptionDescriptor[] = []
  const runtimeInitializers: LibraryRuntimeInitializerDescriptor[] = []
  const nativeTypes: LibraryNativeTypeDescriptor[] = []
  const operations: LibraryOperationDescriptor[] = []
  const intrinsicBindings: IntrinsicRoleBinding[] = []
  const runtimeRequirements: RuntimeRequirementDescriptor[] = []

  for (let libraryIndex = 0; libraryIndex < ordered.length; libraryIndex = libraryIndex + 1) {
    const library = ordered[libraryIndex]

    validateCompilerLibraryDescriptorOwnership(library)
    pushDeclarations(declarations, library.declarations)
    pushLibraryOptions(options, library.options ?? [])
    pushRuntimeInitializers(runtimeInitializers, library.runtimeInitializers ?? [])
    pushNativeTypes(nativeTypes, library.nativeTypes ?? [])
    pushOperations(operations, library.operations)
    pushIntrinsicBindings(intrinsicBindings, library.intrinsicBindings)
    pushRuntimeRequirements(runtimeRequirements, library.runtimeRequirements)
  }

  validateCompilerLibrarySet(
    declarations,
    options,
    runtimeInitializers,
    nativeTypes,
    operations,
    intrinsicBindings,
    runtimeRequirements
  )

  return {
    fingerprint: compilerLibrarySetFingerprint(ordered),
    declarations,
    options,
    runtimeInitializers,
    nativeTypes,
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
  options: LibraryOptionDescriptor[],
  runtimeInitializers: LibraryRuntimeInitializerDescriptor[],
  nativeTypes: LibraryNativeTypeDescriptor[],
  operations: LibraryOperationDescriptor[],
  intrinsicBindings: IntrinsicRoleBinding[],
  runtimeRequirements: RuntimeRequirementDescriptor[]
): void {
  validateUniqueDeclarationSources(declarations)
  validateGlobalDeclarations(declarations)
  validateCompilerLibraryOptionDescriptors(options)
  validateUniqueRuntimeRequirementIds(runtimeRequirements)
  validateRuntimeInitializers(runtimeInitializers, options, runtimeRequirements)
  validateRuntimeOptionConditions(runtimeRequirements, options)
  validateRuntimeRequirementReferences(operations, nativeTypes, runtimeRequirements)
  validateNativeTypes(nativeTypes)
  validateUniqueOperationIds(operations)
  validateUniqueIntrinsicRoles(intrinsicBindings)
}

function validateCompilerLibraryDescriptorOwnership(library: CompilerLibraryDescriptor): void {
  for (let index = 0; index < library.declarations.length; index = index + 1) {
    validateCompilerLibraryItemOwner(
      library.id,
      library.declarations[index].libraryId,
      `declaration ${library.declarations[index].source}`
    )
  }

  const options = library.options ?? []

  for (let index = 0; index < options.length; index = index + 1) {
    validateCompilerLibraryItemOwner(
      library.id,
      options[index].libraryId,
      `option ${options[index].optionId}`
    )
  }

  const initializers = library.runtimeInitializers ?? []

  for (let index = 0; index < initializers.length; index = index + 1) {
    validateCompilerLibraryItemOwner(
      library.id,
      initializers[index].libraryId,
      `runtime initializer ${initializers[index].initializerId}`
    )
  }

  const nativeTypes = library.nativeTypes ?? []

  for (let index = 0; index < nativeTypes.length; index = index + 1) {
    validateCompilerLibraryItemOwner(
      library.id,
      nativeTypes[index].libraryId,
      `native type ${nativeTypes[index].typeId}`
    )
  }

  for (let index = 0; index < library.operations.length; index = index + 1) {
    validateCompilerLibraryItemOwner(
      library.id,
      library.operations[index].libraryId,
      `operation ${library.operations[index].operationId}`
    )
  }
}

function validateCompilerLibraryItemOwner(
  expectedLibraryId: string,
  actualLibraryId: string,
  label: string
): void {
  if (actualLibraryId !== expectedLibraryId) {
    throw new Error(`${label} is owned by ${actualLibraryId}, expected ${expectedLibraryId}`)
  }
}

function validateRuntimeOptionConditions(
  requirements: RuntimeRequirementDescriptor[],
  options: LibraryOptionDescriptor[]
): void {
  for (let index = 0; index < requirements.length; index = index + 1) {
    const requirement = requirements[index]
    const capabilities = requirement.conditionalCapabilities ?? []

    for (let capabilityIndex = 0; capabilityIndex < capabilities.length; capabilityIndex = capabilityIndex + 1) {
      const capability = capabilities[capabilityIndex]

      for (let conditionIndex = 0; conditionIndex < capability.conditions.length; conditionIndex = conditionIndex + 1) {
        const condition = capability.conditions[conditionIndex]

        if (libraryOptionDescriptor(options, condition.optionId) === null) {
          throw new Error(
            `runtime requirement ${requirement.id} references missing option ${condition.optionId}`
          )
        }

        const option = libraryOptionDescriptor(options, condition.optionId)

        if (option !== null) {
          validateRuntimeOptionCondition(requirement, condition, option)
        }
      }
    }
  }
}

function validateRuntimeOptionCondition(
  requirement: RuntimeRequirementDescriptor,
  condition: { optionId: string; source: 'value' | 'present'; values: LibraryOptionScalar[] },
  option: LibraryOptionDescriptor
): void {
  if (condition.values.length === 0) {
    throw new Error(
      `runtime requirement ${requirement.id} option ${condition.optionId} condition has no values`
    )
  }

  for (let index = 0; index < condition.values.length; index = index + 1) {
    const value = condition.values[index]

    if (condition.source === 'present') {
      if (typeof value !== 'boolean') {
        throw new Error(
          `runtime requirement ${requirement.id} option ${condition.optionId} present condition expects boolean values`
        )
      }
    } else {
      if (compilerLibraryOptionScalarType(value) !== option.valueType) {
        throw new Error(
          `runtime requirement ${requirement.id} option ${condition.optionId} condition value ` +
            `${compilerLibraryOptionScalarText(value)} expects ${option.valueType}`
        )
      }

      validateCompilerLibraryOptionValue(option, value)
    }

    for (let previousIndex = 0; previousIndex < index; previousIndex = previousIndex + 1) {
      if (compilerLibraryOptionScalarsEqual(condition.values[previousIndex], value)) {
        throw new Error(
          `runtime requirement ${requirement.id} option ${condition.optionId} has duplicate condition value ` +
            compilerLibraryOptionScalarText(value)
        )
      }
    }
  }
}

function validateRuntimeInitializers(
  initializers: LibraryRuntimeInitializerDescriptor[],
  options: LibraryOptionDescriptor[],
  requirements: RuntimeRequirementDescriptor[]
): void {
  const ids: Set<string> = new Set()
  const cNames: Set<string> = new Set()

  for (let index = 0; index < initializers.length; index = index + 1) {
    const initializer = initializers[index]

    if (ids.has(initializer.initializerId)) {
      throw new Error(`duplicate compiler library runtime initializer ${initializer.initializerId}`)
    }

    ids.add(initializer.initializerId)

    if (initializer.cType.length === 0 || initializer.cName.length === 0) {
      throw new Error(`runtime initializer ${initializer.initializerId} requires C++ type and name`)
    }

    if (cNames.has(initializer.cName)) {
      throw new Error(
        `duplicate compiler library runtime initializer C++ name ${initializer.cName}`
      )
    }

    cNames.add(initializer.cName)

    if (!runtimeRequirementDescriptorExists(requirements, initializer.runtimeRequirement)) {
      throw new Error(
        `runtime initializer ${initializer.initializerId} references missing requirement ${initializer.runtimeRequirement}`
      )
    }

    for (let argumentIndex = 0; argumentIndex < initializer.arguments.length; argumentIndex = argumentIndex + 1) {
      const argument = initializer.arguments[argumentIndex]
      const option = libraryOptionDescriptor(options, argument.optionId)

      if (option === null) {
        throw new Error(
          `runtime initializer ${initializer.initializerId} references missing option ${argument.optionId}`
        )
      }

      if (option.libraryId !== initializer.libraryId) {
        throw new Error(
          `runtime initializer ${initializer.initializerId} cannot use option owned by ${option.libraryId}`
        )
      }

      validateRuntimeInitializerArgument(initializer, argument, option)
    }
  }
}

function validateRuntimeInitializerArgument(
  initializer: LibraryRuntimeInitializerDescriptor,
  argument: LibraryRuntimeInitializerArgumentDescriptor,
  option: LibraryOptionDescriptor
): void {
  const mappings = argument.cValueMap ?? []
  const argumentValueType = argument.source === 'present' ? 'boolean' : option.valueType

  if (argument.cValueKind === 'mapped') {
    validateRuntimeInitializerMappings(initializer, argument, option, mappings)
    return
  }

  if (mappings.length > 0) {
    throw new Error(
      `runtime initializer ${initializer.initializerId} has C++ mappings for non-mapped option ${argument.optionId}`
    )
  }

  if (argument.cValueKind === 'boolean') {
    if (argumentValueType !== 'boolean') {
      throw new Error(
        `runtime initializer ${initializer.initializerId} boolean argument requires boolean option`
      )
    }

    return
  }

  if (argument.cValueKind === 'number') {
    if (argument.source !== 'value' || option.valueType !== 'number') {
      throw new Error(
        `runtime initializer ${initializer.initializerId} number argument requires numeric option value`
      )
    }

    return
  }

  if (!runtimeInitializerOptionFitsUint32(option, argument.source)) {
    throw new Error(
      `runtime initializer ${initializer.initializerId} uint32-hex option must constrain integers from 0 to 4294967295`
    )
  }
}

function runtimeInitializerOptionFitsUint32(
  option: LibraryOptionDescriptor,
  source: 'value' | 'present'
): boolean {
  const minimum = option.minimum
  const maximum = option.maximum

  return (
    source === 'value' &&
    option.valueType === 'number' &&
    option.integer === true &&
    minimum !== null &&
    typeof minimum !== 'undefined' &&
    minimum >= 0 &&
    maximum !== null &&
    typeof maximum !== 'undefined' &&
    maximum <= 4294967295
  )
}

function validateRuntimeInitializerMappings(
  initializer: LibraryRuntimeInitializerDescriptor,
  argument: LibraryRuntimeInitializerArgumentDescriptor,
  option: LibraryOptionDescriptor,
  mappings: LibraryCValueMappingDescriptor[]
): void {
  if (mappings.length === 0) {
    throw new Error(`runtime initializer ${initializer.initializerId} requires C++ mappings`)
  }

  const expectedValues = runtimeInitializerExpectedMappedValues(initializer, argument, option)

  for (let index = 0; index < mappings.length; index = index + 1) {
    const mapping = mappings[index]

    if (mapping.cExpression.length === 0) {
      throw new Error(
        `runtime initializer ${initializer.initializerId} has empty C++ mapping for ` +
          compilerLibraryOptionScalarText(mapping.value)
      )
    }

    if (argument.source === 'present') {
      if (typeof mapping.value !== 'boolean') {
        throw new Error(
          `runtime initializer ${initializer.initializerId} present mapping expects boolean values`
        )
      }
    } else {
      validateCompilerLibraryOptionValue(option, mapping.value)
    }

    for (let previousIndex = 0; previousIndex < index; previousIndex = previousIndex + 1) {
      if (compilerLibraryOptionScalarsEqual(mappings[previousIndex].value, mapping.value)) {
        throw new Error(
          `runtime initializer ${initializer.initializerId} has duplicate C++ mapping for ` +
            compilerLibraryOptionScalarText(mapping.value)
        )
      }
    }
  }

  for (let index = 0; index < expectedValues.length; index = index + 1) {
    if (!runtimeInitializerMappingsContain(mappings, expectedValues[index])) {
      throw new Error(
        `runtime initializer ${initializer.initializerId} has no C++ mapping for ` +
          compilerLibraryOptionScalarText(expectedValues[index])
      )
    }
  }
}

function runtimeInitializerExpectedMappedValues(
  initializer: LibraryRuntimeInitializerDescriptor,
  argument: LibraryRuntimeInitializerArgumentDescriptor,
  option: LibraryOptionDescriptor
): LibraryOptionScalar[] {
  if (argument.source === 'present') {
    return [false, true]
  }

  const allowed = option.allowedValues ?? []

  if (allowed.length > 0) {
    return allowed
  }

  if (option.valueType === 'boolean') {
    return [false, true]
  }

  throw new Error(
    `runtime initializer ${initializer.initializerId} mapped option ${option.optionId} requires allowed values`
  )
}

function runtimeInitializerMappingsContain(
  mappings: LibraryCValueMappingDescriptor[],
  expected: LibraryOptionScalar
): boolean {
  for (let index = 0; index < mappings.length; index = index + 1) {
    if (compilerLibraryOptionScalarsEqual(mappings[index].value, expected)) {
      return true
    }
  }

  return false
}

function validateRuntimeRequirementReferences(
  operations: LibraryOperationDescriptor[],
  nativeTypes: LibraryNativeTypeDescriptor[],
  requirements: RuntimeRequirementDescriptor[]
): void {
  for (let index = 0; index < requirements.length; index = index + 1) {
    const requirement = requirements[index]

    for (let dependencyIndex = 0; dependencyIndex < requirement.dependencies.length; dependencyIndex = dependencyIndex + 1) {
      const dependency = requirement.dependencies[dependencyIndex]

      if (!runtimeRequirementReferenceExists(requirements, dependency)) {
        throw new Error(
          `runtime requirement ${requirement.id} references unknown dependency ${dependency}`
        )
      }
    }
  }

  for (let index = 0; index < operations.length; index = index + 1) {
    validateRuntimeRequirementList(
      `operation ${operations[index].operationId}`,
      operations[index].runtimeRequirements,
      requirements
    )
  }

  for (let index = 0; index < nativeTypes.length; index = index + 1) {
    validateRuntimeRequirementList(
      `native type ${nativeTypes[index].typeId}`,
      nativeTypes[index].runtimeRequirements,
      requirements
    )
  }
}

function validateRuntimeRequirementList(
  label: string,
  references: string[],
  requirements: RuntimeRequirementDescriptor[]
): void {
  for (let index = 0; index < references.length; index = index + 1) {
    if (!runtimeRequirementReferenceExists(requirements, references[index])) {
      throw new Error(`${label} references unknown runtime requirement ${references[index]}`)
    }
  }
}

function runtimeRequirementReferenceExists(
  requirements: RuntimeRequirementDescriptor[],
  id: string
): boolean {
  if (runtimeRequirementDescriptorExists(requirements, id)) {
    return true
  }

  for (let index = 0; index < compilerCoreRuntimeRequirementIds.length; index = index + 1) {
    if (compilerCoreRuntimeRequirementIds[index] === id) {
      return true
    }
  }

  return false
}

function runtimeRequirementDescriptorExists(
  requirements: RuntimeRequirementDescriptor[],
  id: string
): boolean {
  for (let index = 0; index < requirements.length; index = index + 1) {
    if (requirements[index].id === id) {
      return true
    }
  }

  return false
}

function libraryOptionDescriptor(
  options: LibraryOptionDescriptor[],
  optionId: string
): LibraryOptionDescriptor | null {
  for (let index = 0; index < options.length; index = index + 1) {
    if (options[index].optionId === optionId) {
      return options[index]
    }
  }

  return null
}

function validateGlobalDeclarations(declarations: LibraryDeclarationDescriptor[]): void {
  const parsed = parseCompilerLibraryGlobalDeclarations(declarations)

  if (parsed.diagnostics.length > 0) {
    throw new Error(formatDiagnostics(parsed.diagnostics))
  }
}

function validateNativeTypes(nativeTypes: LibraryNativeTypeDescriptor[]): void {
  const typeIds: Set<string> = new Set()
  const declarationNames: Set<string> = new Set()

  for (let index = 0; index < nativeTypes.length; index = index + 1) {
    const nativeType = nativeTypes[index]

    if (typeIds.has(nativeType.typeId)) {
      throw new Error(`Duplicate compiler library native type id ${nativeType.typeId}`)
    }

    typeIds.add(nativeType.typeId)

    for (let nameIndex = 0; nameIndex < nativeType.declarationNames.length; nameIndex = nameIndex + 1) {
      const name = nativeType.declarationNames[nameIndex]
      const declarationKey = `${nativeType.libraryId}:${name}`

      if (declarationNames.has(declarationKey)) {
        throw new Error(`Duplicate compiler library native type declaration ${declarationKey}`)
      }

      declarationNames.add(declarationKey)
    }
  }

  for (let index = 0; index < nativeTypes.length; index = index + 1) {
    const nativeType = nativeTypes[index]

    for (let baseIndex = 0; baseIndex < nativeType.baseTypeIds.length; baseIndex = baseIndex + 1) {
      const baseTypeId = nativeType.baseTypeIds[baseIndex]

      if (!typeIds.has(baseTypeId)) {
        throw new Error(`Missing compiler library native base type ${nativeType.typeId} -> ${baseTypeId}`)
      }
    }
  }
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
    const optionIds: string[] = []
    const initializerIds: string[] = []
    const nativeTypeIds: string[] = []
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
          (item.cArgumentAdapters ?? []).join(',') + ':' + operationArgumentSourcesFingerprint(item.cArgumentSources) + ':' +
          (item.callbackLifetime ?? '') + ':' +
          (item.cResultMode ?? '') + ':' +
          (item.cReceiverAdapter ?? '') + ':' +
          operationResultShapeFingerprint(item) + ':' + (item.resultArrayElementType ?? '') + ':' +
          (item.resultArrayElementTypeId ?? '') + ':' +
          (item.receiverTypeId ?? '') + ':' +
          (item.resultTypeId ?? '') + ':' + (item.cCallStyle ?? '') + ':' + (item.cFailureMode ?? '') + ':' +
          (item.minArgs ?? '') + ':' + (item.maxArgs ?? '') + ':' + operationArgumentChecksFingerprint(item) + ':' +
          (item.cppType ?? '') + ':' + (item.valueType ?? '') + ':' +
          (item.promiseValueType ?? '') + ':' + (item.promiseRejectionValueType ?? '') + ':' +
          (item.nullable === true ? 'nullable' : 'required') + ':' +
          (item.owned === true ? 'owned' : 'borrowed') + ':' + (item.constantValue ?? '') + ':' +
          (item.diagnosticCode ?? '') + ':' + (item.diagnosticMessage ?? '') + ':' +
          operationVariantsFingerprint(item)
      )
    }

    const libraryOptions = library.options ?? []

    for (let itemIndex = 0; itemIndex < libraryOptions.length; itemIndex = itemIndex + 1) {
      const item = libraryOptions[itemIndex]
      insertSortedString(
        optionIds,
        item.libraryId + ':' + item.optionId + ':' + sortedStrings(item.cliAliases).join(',') + ':' +
          item.valueType + ':' + compilerLibraryOptionScalarText(item.defaultValue) + ':' +
          sortedOptionScalars(item.allowedValues ?? []).join(',') + ':' +
          (item.integer === true ? 'integer' : '') + ':' +
          (item.minimum ?? '') + ':' + (item.maximum ?? '')
      )
    }

    const libraryInitializers = library.runtimeInitializers ?? []

    for (let itemIndex = 0; itemIndex < libraryInitializers.length; itemIndex = itemIndex + 1) {
      const item = libraryInitializers[itemIndex]
      const argumentsFingerprint: string[] = []

      for (let argumentIndex = 0; argumentIndex < item.arguments.length; argumentIndex = argumentIndex + 1) {
        const argument = item.arguments[argumentIndex]
        const mappings: string[] = []
        const valueMap = argument.cValueMap ?? []

        for (let mappingIndex = 0; mappingIndex < valueMap.length; mappingIndex = mappingIndex + 1) {
          const mappingValue = valueMap[mappingIndex].value
          mappings.push(
            compilerLibraryOptionScalarType(mappingValue) + ':' + compilerLibraryOptionScalarText(mappingValue) +
              '=' + valueMap[mappingIndex].cExpression
          )
        }

        argumentsFingerprint.push(
          argument.optionId + ':' + argument.source + ':' + argument.cValueKind + ':' + mappings.join(',')
        )
      }

      insertSortedString(
        initializerIds,
        item.libraryId + ':' + item.initializerId + ':' + item.runtimeRequirement + ':' +
          item.cType + ':' + item.cName + ':' + argumentsFingerprint.join(';')
      )
    }

    const libraryNativeTypes = library.nativeTypes ?? []

    for (let itemIndex = 0; itemIndex < libraryNativeTypes.length; itemIndex = itemIndex + 1) {
      const item = libraryNativeTypes[itemIndex]
      insertSortedString(
        nativeTypeIds,
        item.libraryId + ':' + item.typeId + ':names=' + sortedStrings(item.declarationNames).join(',') +
          ':value=' + item.valueType + ':cpp=' + item.cppType +
          ':bases=' + sortedStrings(item.baseTypeIds).join(',') +
          ':requirements=' + sortedStrings(item.runtimeRequirements).join(',') +
          ':fields=' + resultShapeFieldsFingerprint(item.fields ?? [])
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
          ':conditional=' + runtimeConditionalCapabilitiesFingerprint(item) +
          ':backend=' + runtimeBackendConstraintsFingerprint(item) +
          ':entrypoint=' + runtimeEntrypointAdapterFingerprint(item)
      )
    }

    rows.push(
      library.id +
        '|deps=' + dependencyIds.join(',') +
        '|decl=' + declarationIds.join(',') +
        '|options=' + optionIds.join(',') +
        '|initializers=' + initializerIds.join(',') +
        '|types=' + nativeTypeIds.join(',') +
        '|ops=' + operationIds.join(',') +
        '|intrinsics=' + intrinsicIds.join(',') +
        '|requirements=' + requirementIds.join(',')
    )
  }

  return 'inox:library-set:v1:' + shortStableHash(rows.join(';'))
}

function pushNativeTypes(target: LibraryNativeTypeDescriptor[], values: LibraryNativeTypeDescriptor[]): void {
  for (let index = 0; index < values.length; index = index + 1) {
    target.push(values[index])
  }
}

function operationArgumentChecksFingerprint(
  operation: { argumentChecks?: LibraryArgumentCheckDescriptor[] }
): string {
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
        + ':' + objectLiteralFieldsFingerprint(check.objectLiteralFields ?? []) + ':' +
        callbackParametersFingerprint(check.functionParameters ?? []) + ':' +
        (check.functionReturnType ?? '') + ':' +
        (check.functionAsync === true ? 'async' : check.functionAsync === false ? 'sync' : '') + ':' +
        (check.functionAsyncDiagnosticCode ?? '') + ':' +
        (check.functionAsyncDiagnosticMessage ?? '')
    )
  }

  return rows.join(';')
}

function callbackParametersFingerprint(
  parameters: LibraryCallbackParameterDescriptor[]
): string {
  const rows: string[] = []

  for (let index = 0; index < parameters.length; index = index + 1) {
    const parameter = parameters[index]
    rows.push(
      parameter.name + ':' + parameter.valueType + ':' + (parameter.nullable === true ? 'nullable' : '') + ':' +
        (parameter.resultTypeId ?? '') + ':' +
        resultShapeFieldsFingerprint(parameter.shapeFields ?? [])
    )
  }

  return rows.join(',')
}

function operationVariantsFingerprint(operation: LibraryOperationDescriptor): string {
  const variants = operation.variants ?? []
  const rows: string[] = []

  for (let index = 0; index < variants.length; index = index + 1) {
    const variant = variants[index]
    rows.push(
      (variant.minArgs ?? '') + ':' + (variant.maxArgs ?? '') + ':' +
        operationArgumentChecksFingerprint(variant) + ':' +
        (variant.argumentIndex ?? '') + ':' + sortedStrings(variant.stringLiterals ?? []).join(',') + ':' +
        sortedStrings(variant.argumentValueTypes ?? []).join(',') + ':' +
        (variant.objectFieldName ?? '') + ':' + sortedBooleans(variant.booleanLiterals ?? []).join(',') + ':' +
        (variant.cExpression ?? '') + ':' + (variant.cArgumentKinds ?? []).join(',') + ':' +
        (variant.cArgumentAdapters ?? []).join(',') + ':' + operationArgumentSourcesFingerprint(variant.cArgumentSources) + ':' +
        (variant.callbackLifetime ?? '') + ':' +
        (variant.cResultMode ?? '') + ':' +
        (variant.cReceiverAdapter ?? '') + ':' +
        resultShapeFieldsFingerprint(variant.resultShapeFields ?? []) + ':' +
        (variant.resultArrayElementType ?? '') + ':' + (variant.resultArrayElementTypeId ?? '') + ':' +
        (variant.resultTypeId ?? '') + ':' +
        (variant.cppType ?? '') + ':' + (variant.valueType ?? '') + ':' +
        (variant.promiseValueType ?? '') + ':' + (variant.promiseRejectionValueType ?? '') + ':' +
        (variant.nullable === true ? 'nullable' : 'required') + ':' +
        (variant.owned === true ? 'owned' : 'borrowed')
    )
  }

  return rows.join(';')
}

function objectLiteralFieldsFingerprint(fields: { name: string; valueTypes: string[]; booleanLiterals?: boolean[]; stringLiterals?: string[]; optional?: boolean }[]): string {
  const rows: string[] = []

  for (let index = 0; index < fields.length; index = index + 1) {
    const field = fields[index]
    rows.push(
      field.name + ':' + sortedStrings(field.valueTypes).join(',') + ':' +
        sortedBooleans(field.booleanLiterals ?? []).join(',') + ':' +
        sortedStrings(field.stringLiterals ?? []).join(',') + ':' +
        (field.optional === true ? 'optional' : 'required')
    )
  }

  rows.sort()
  return rows.join(';')
}

function operationArgumentSourcesFingerprint(
  sources: Array<{ argumentIndex: number; objectFieldName?: string } | null> | null | undefined
): string {
  const rows: string[] = []

  for (let index = 0; index < (sources ?? []).length; index = index + 1) {
    const source = (sources ?? [])[index]
    rows.push(source === null ? '' : `${source.argumentIndex}:${source.objectFieldName ?? ''}`)
  }

  return rows.join(',')
}

function sortedBooleans(values: boolean[]): string[] {
  const rows: string[] = []

  for (let index = 0; index < values.length; index = index + 1) {
    rows.push(values[index] ? 'true' : 'false')
  }

  rows.sort()
  return rows
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

function runtimeConditionalCapabilitiesFingerprint(requirement: RuntimeRequirementDescriptor): string {
  const capabilities = requirement.conditionalCapabilities ?? []
  const rows: string[] = []

  for (let index = 0; index < capabilities.length; index = index + 1) {
    const item = capabilities[index]
    const conditions: string[] = []

    for (let conditionIndex = 0; conditionIndex < item.conditions.length; conditionIndex = conditionIndex + 1) {
      const condition = item.conditions[conditionIndex]
      conditions.push(
        condition.optionId + ':' + condition.source + ':' +
          sortedOptionScalars(condition.values).join(',')
      )
    }

    rows.push(item.capability + ':' + conditions.join('&'))
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
        `${field.cMember ?? ''}:${field.resultTypeId ?? ''}:${field.cppType ?? ''}:` +
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
        `${field.cMember ?? ''}:${field.resultTypeId ?? ''}:${field.cppType ?? ''}`
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

function sortedOptionScalars(values: Array<string | number | boolean>): string[] {
  const result: string[] = []

  for (let index = 0; index < values.length; index = index + 1) {
    insertSortedString(
      result,
      compilerLibraryOptionScalarType(values[index]) + ':' + compilerLibraryOptionScalarText(values[index])
    )
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

function pushLibraryOptions(target: LibraryOptionDescriptor[], values: LibraryOptionDescriptor[]): void {
  for (let index = 0; index < values.length; index = index + 1) {
    target.push(values[index])
  }
}

function pushRuntimeInitializers(
  target: LibraryRuntimeInitializerDescriptor[],
  values: LibraryRuntimeInitializerDescriptor[]
): void {
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
