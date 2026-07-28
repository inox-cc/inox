import type {
  CompilerLibraryDescriptor,
  CompilerLibrarySet,
  ConcreteTypeRef,
  IntrinsicRoleBinding,
  LibraryAsyncResultOperationKind,
  LibraryArgumentCheckDescriptor,
  LibraryCResultFieldMappingDescriptor,
  LibraryCResultMappingDescriptor,
  LibraryCValueMappingDescriptor,
  LibraryDeclarationDescriptor,
  LibraryCallbackParameterDescriptor,
  LibraryNativeTypeDescriptor,
  LibraryObjectLiteralFieldDescriptor,
  LibraryOptionDescriptor,
  LibraryOptionConstraintDescriptor,
  LibraryOptionScalar,
  LibraryNestedResultShapeFieldDescriptor,
  LibraryOperationDescriptor,
  LibraryOperationVariantDescriptor,
  LibraryResultShapeFieldDescriptor,
  LibraryRuntimeInitializerArgumentDescriptor,
  LibraryRuntimeInitializerDescriptor,
  LibraryStringPrefixOptionConstraintDescriptor,
  RuntimeRequirementDescriptor,
  ObjectTypeRef,
  TypeRef,
  TypeTraitRef
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
  'managed-values',
  'objects',
  'string-bytes',
  'weak-references'
]

export function createCompilerLibrarySet(
  libraries: CompilerLibraryDescriptor[],
  targetOptions: LibraryOptionDescriptor[] = []
): CompilerLibrarySet {
  const ordered = orderCompilerLibraries(libraries)
  const declarations: LibraryDeclarationDescriptor[] = []
  const options: LibraryOptionDescriptor[] = []
  const runtimeInitializers: LibraryRuntimeInitializerDescriptor[] = []
  const nativeTypes: LibraryNativeTypeDescriptor[] = []
  const operations: LibraryOperationDescriptor[] = []
  const intrinsicBindings: IntrinsicRoleBinding[] = []
  const runtimeRequirements: RuntimeRequirementDescriptor[] = []

  pushLibraryOptions(options, targetOptions)

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
    fingerprint: compilerLibrarySetFingerprint(ordered, targetOptions),
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
  validateRuntimeOptionConstraints(runtimeRequirements, operations, options)
  validateRuntimeRequirementReferences(operations, nativeTypes, runtimeRequirements)
  validateNativeTypes(nativeTypes)
  validateOperationTypeRefs(operations, nativeTypes)
  validateOperationResultInferences(operations)
  validateOperationResultAdapters(operations)
  validateUniqueOperationIds(operations)
  validateUniqueIntrinsicRoles(intrinsicBindings)
  validateIntrinsicOperationBindings(intrinsicBindings, operations)
  validateSequenceMaterializationIntrinsic(intrinsicBindings, operations, nativeTypes)
  validateAsyncResultIntrinsicNativeType(intrinsicBindings, operations, nativeTypes)
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
    validateCompilerLibraryItemOwner(library.id, options[index].libraryId, `option ${options[index].optionId}`)
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

function validateCompilerLibraryItemOwner(expectedLibraryId: string, actualLibraryId: string, label: string): void {
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
          throw new Error(`runtime requirement ${requirement.id} references missing option ${condition.optionId}`)
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
    throw new Error(`runtime requirement ${requirement.id} option ${condition.optionId} condition has no values`)
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

function validateRuntimeOptionConstraints(
  requirements: RuntimeRequirementDescriptor[],
  operations: LibraryOperationDescriptor[],
  options: LibraryOptionDescriptor[]
): void {
  for (let index = 0; index < requirements.length; index = index + 1) {
    const requirement = requirements[index]
    const constraints = requirement.optionConstraints ?? []

    for (let constraintIndex = 0; constraintIndex < constraints.length; constraintIndex = constraintIndex + 1) {
      validateRuntimeOptionConstraint(`runtime requirement ${requirement.id}`, constraints[constraintIndex], options)
    }
  }

  for (let index = 0; index < operations.length; index = index + 1) {
    const operation = operations[index]

    validateArgumentOptionConstraints(`operation ${operation.operationId}`, operation.argumentChecks ?? [], options)

    const variants = operation.variants ?? []

    for (let variantIndex = 0; variantIndex < variants.length; variantIndex = variantIndex + 1) {
      validateArgumentOptionConstraints(
        `operation ${operation.operationId} variant ${variantIndex}`,
        variants[variantIndex].argumentChecks ?? [],
        options
      )
    }
  }
}

function validateArgumentOptionConstraints(
  label: string,
  checks: LibraryArgumentCheckDescriptor[],
  options: LibraryOptionDescriptor[]
): void {
  for (let index = 0; index < checks.length; index = index + 1) {
    const constraints = checks[index].stringPrefixOptionConstraints ?? []

    for (let constraintIndex = 0; constraintIndex < constraints.length; constraintIndex = constraintIndex + 1) {
      const constraint = constraints[constraintIndex]

      if (constraint.prefixes.length === 0) {
        throw new Error(`${label} argument ${index} option ${constraint.optionId} constraint has no prefixes`)
      }

      for (let prefixIndex = 0; prefixIndex < constraint.prefixes.length; prefixIndex = prefixIndex + 1) {
        if (constraint.prefixes[prefixIndex].length === 0) {
          throw new Error(`${label} argument ${index} option ${constraint.optionId} constraint has an empty prefix`)
        }
      }

      validateRuntimeOptionConstraint(`${label} argument ${index}`, constraint, options)
    }
  }
}

function validateRuntimeOptionConstraint(
  label: string,
  constraint: LibraryOptionConstraintDescriptor,
  options: LibraryOptionDescriptor[]
): void {
  const option = libraryOptionDescriptor(options, constraint.optionId)

  if (option === null) {
    throw new Error(`${label} references missing option ${constraint.optionId}`)
  }

  if (constraint.allowedValues.length === 0) {
    throw new Error(`${label} option ${constraint.optionId} constraint has no allowed values`)
  }

  for (let index = 0; index < constraint.allowedValues.length; index = index + 1) {
    const value = constraint.allowedValues[index]

    if (compilerLibraryOptionScalarType(value) !== option.valueType) {
      throw new Error(
        `${label} option ${constraint.optionId} constraint value ` +
          `${compilerLibraryOptionScalarText(value)} expects ${option.valueType}`
      )
    }

    validateCompilerLibraryOptionValue(option, value)

    for (let previousIndex = 0; previousIndex < index; previousIndex = previousIndex + 1) {
      if (compilerLibraryOptionScalarsEqual(constraint.allowedValues[previousIndex], value)) {
        throw new Error(
          `${label} option ${constraint.optionId} has duplicate constraint value ` +
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
      throw new Error(`duplicate compiler library runtime initializer C++ name ${initializer.cName}`)
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
      throw new Error(`runtime initializer ${initializer.initializerId} boolean argument requires boolean option`)
    }

    return
  }

  if (argument.cValueKind === 'number') {
    if (argument.source !== 'value' || option.valueType !== 'number') {
      throw new Error(`runtime initializer ${initializer.initializerId} number argument requires numeric option value`)
    }

    return
  }

  if (!runtimeInitializerOptionFitsUint32(option, argument.source)) {
    throw new Error(
      `runtime initializer ${initializer.initializerId} uint32-hex option must constrain integers from 0 to 4294967295`
    )
  }
}

function runtimeInitializerOptionFitsUint32(option: LibraryOptionDescriptor, source: 'value' | 'present'): boolean {
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
        throw new Error(`runtime initializer ${initializer.initializerId} present mapping expects boolean values`)
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

    for (
      let dependencyIndex = 0;
      dependencyIndex < requirement.dependencies.length;
      dependencyIndex = dependencyIndex + 1
    ) {
      const dependency = requirement.dependencies[dependencyIndex]

      if (!runtimeRequirementReferenceExists(requirements, dependency)) {
        throw new Error(`runtime requirement ${requirement.id} references unknown dependency ${dependency}`)
      }
    }
  }

  for (let index = 0; index < operations.length; index = index + 1) {
    const operation = operations[index]

    validateRuntimeRequirementList(`operation ${operation.operationId}`, operation.runtimeRequirements, requirements)

    const variants = operation.variants ?? []

    for (let variantIndex = 0; variantIndex < variants.length; variantIndex = variantIndex + 1) {
      const variantRequirements = variants[variantIndex].runtimeRequirements

      if (variantRequirements !== null && typeof variantRequirements !== 'undefined') {
        validateRuntimeRequirementList(
          `operation ${operation.operationId} variant ${variantIndex}`,
          variantRequirements,
          requirements
        )
      }
    }
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

function runtimeRequirementReferenceExists(requirements: RuntimeRequirementDescriptor[], id: string): boolean {
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

function runtimeRequirementDescriptorExists(requirements: RuntimeRequirementDescriptor[], id: string): boolean {
  for (let index = 0; index < requirements.length; index = index + 1) {
    if (requirements[index].id === id) {
      return true
    }
  }

  return false
}

function libraryOptionDescriptor(options: LibraryOptionDescriptor[], optionId: string): LibraryOptionDescriptor | null {
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
    const typeParameters = validateNativeTypeParameters(nativeType)

    validateTypeTraits(`native type ${nativeType.typeId}`, nativeType.traits ?? [], nativeTypes, typeParameters)
    validateNativeTypeValueAdapter(nativeType)
    validateNativeTypeRuntimeValueExpression(nativeType)
    validateNativeTypeRuntimeValueValidExpression(nativeType)
    validateNativeTypeAwaitExpression(nativeType)
    validateNativeTypeAsyncTaskBridge(nativeType)
    validateNativeTypeIteration(nativeType)
    validateNativeTypeFields(nativeType)

    for (let baseIndex = 0; baseIndex < nativeType.baseTypeIds.length; baseIndex = baseIndex + 1) {
      const baseTypeId = nativeType.baseTypeIds[baseIndex]

      if (!typeIds.has(baseTypeId)) {
        throw new Error(`Missing compiler library native base type ${nativeType.typeId} -> ${baseTypeId}`)
      }
    }
  }
}

function validateNativeTypeFields(nativeType: LibraryNativeTypeDescriptor): void {
  const fields = nativeType.fields ?? []

  for (let index = 0; index < fields.length; index = index + 1) {
    const field = fields[index]

    validateNativeTypeField(`${nativeType.typeId}.${field.name}`, field)
    const nestedFields = field.resultShapeFields ?? []

    for (let nestedIndex = 0; nestedIndex < nestedFields.length; nestedIndex = nestedIndex + 1) {
      const nestedField = nestedFields[nestedIndex]

      validateNativeTypeField(`${nativeType.typeId}.${field.name}.${nestedField.name}`, nestedField)
    }
  }
}

function validateNativeTypeField(
  label: string,
  field: LibraryResultShapeFieldDescriptor | LibraryNestedResultShapeFieldDescriptor
): void {
  if (field.valueType === 'function') {
    return
  }

  const cMember = field.cMember
  const cGetter = field.cGetter
  const hasMember = typeof cMember === 'string' && cMember.length > 0
  const hasGetter = typeof cGetter === 'string' && cGetter.length > 0

  if (hasMember === hasGetter) {
    throw new Error(`native type field ${label} requires exactly one C++ cMember or cGetter`)
  }
}

function validateNativeTypeValueAdapter(nativeType: LibraryNativeTypeDescriptor): void {
  const adapter = nativeType.cValueAdapter

  if (adapter !== null && typeof adapter !== 'undefined' && !adapter.includes('$value')) {
    throw new Error(`native type ${nativeType.typeId} C++ value adapter requires $value`)
  }

  if (
    (nativeType.cValueAdapterFailureMode !== null && typeof nativeType.cValueAdapterFailureMode !== 'undefined') ||
    nativeType.cValueAdapterPreservesPendingException === true
  ) {
    if (adapter === null || typeof adapter === 'undefined' || adapter.length === 0) {
      throw new Error(`native type ${nativeType.typeId} C++ value adapter contract requires cValueAdapter`)
    }
  }
}

function validateNativeTypeRuntimeValueExpression(nativeType: LibraryNativeTypeDescriptor): void {
  const expression = nativeType.cRuntimeValueExpression

  if (expression !== null && typeof expression !== 'undefined' && !expression.includes('$value')) {
    throw new Error(`native type ${nativeType.typeId} C++ runtime value expression requires $value`)
  }
}

function validateNativeTypeRuntimeValueValidExpression(nativeType: LibraryNativeTypeDescriptor): void {
  const expression = nativeType.cRuntimeValueValidExpression

  if (expression !== null && typeof expression !== 'undefined' && !expression.includes('$value')) {
    throw new Error(`native type ${nativeType.typeId} C++ runtime value validity expression requires $value`)
  }
}

function validateNativeTypeAwaitExpression(nativeType: LibraryNativeTypeDescriptor): void {
  const expression = nativeType.cAwaitExpression

  if (typeof expression === 'string' && !expression.includes('$value')) {
    throw new Error(`native type ${nativeType.typeId} C++ await expression requires $value`)
  }

  if (nativeType.cAwaitHandlesInvalidSource === true && (typeof expression !== 'string' || expression.length === 0)) {
    throw new Error(`native type ${nativeType.typeId} C++ await invalid-source contract requires cAwaitExpression`)
  }
}

function validateNativeTypeAsyncTaskBridge(nativeType: LibraryNativeTypeDescriptor): void {
  const bridge = nativeType.cAsyncTaskBridge

  if (bridge === null || typeof bridge === 'undefined') {
    return
  }

  validateNativeTypeAsyncTaskBridgeExpression(nativeType, 'valid', bridge.cValidExpression, ['source'])
  validateNativeTypeAsyncTaskBridgeExpression(nativeType, 'observe', bridge.cObserveExpression, [
    'source',
    'onFulfilled',
    'onRejected',
    'context',
    'finalizer'
  ])
  validateNativeTypeAsyncTaskBridgeExpression(nativeType, 'fulfill', bridge.cFulfillExpression, ['target', 'value'])
  validateNativeTypeAsyncTaskBridgeExpression(nativeType, 'reject', bridge.cRejectExpression, ['target', 'value'])
}

function validateNativeTypeAsyncTaskBridgeExpression(
  nativeType: LibraryNativeTypeDescriptor,
  kind: string,
  expression: string | null | undefined,
  requiredPlaceholders: string[]
): void {
  const label = `native type ${nativeType.typeId} async-task ${kind} expression`

  if (typeof expression !== 'string' || expression.trim().length === 0) {
    throw new Error(`${label} must not be empty`)
  }

  const placeholders = nativeTypeAsyncTaskBridgePlaceholders(expression)

  for (let index = 0; index < requiredPlaceholders.length; index = index + 1) {
    const placeholder = `$${requiredPlaceholders[index]}`

    if (!placeholders.includes(placeholder)) {
      throw new Error(`${label} requires ${placeholder}`)
    }
  }

  for (let index = 0; index < placeholders.length; index = index + 1) {
    const placeholder = placeholders[index]

    if (!requiredPlaceholders.includes(placeholder.slice(1))) {
      throw new Error(`${label} has unknown placeholder ${placeholder}`)
    }
  }
}

function nativeTypeAsyncTaskBridgePlaceholders(expression: string): string[] {
  const result: string[] = []
  let index = 0

  while (index < expression.length) {
    if (expression.charCodeAt(index) !== 36 || index + 1 >= expression.length) {
      index = index + 1
      continue
    }

    const start = index
    index = index + 1

    if (!nativeTypeAsyncTaskBridgePlaceholderStart(expression.charCodeAt(index))) {
      continue
    }

    index = index + 1

    while (index < expression.length && nativeTypeAsyncTaskBridgePlaceholderPart(expression.charCodeAt(index))) {
      index = index + 1
    }

    result.push(expression.slice(start, index))
  }

  return result
}

function nativeTypeAsyncTaskBridgePlaceholderStart(code: number): boolean {
  return (code >= 65 && code <= 90) || code === 95 || (code >= 97 && code <= 122)
}

function nativeTypeAsyncTaskBridgePlaceholderPart(code: number): boolean {
  return nativeTypeAsyncTaskBridgePlaceholderStart(code) || (code >= 48 && code <= 57)
}

function validateNativeTypeIteration(nativeType: LibraryNativeTypeDescriptor): void {
  const iteration = nativeType.cIteration

  if (iteration === null || typeof iteration === 'undefined') {
    return
  }

  if (iteration.iteratorMethod !== null && iteration.iteratorMethod.length === 0) {
    throw new Error(`native type ${nativeType.typeId} C++ iteration requires iteratorMethod or null`)
  }

  const fields = [
    ['nextMethod', iteration.nextMethod],
    ['doneMember', iteration.doneMember],
    ['valueMember', iteration.valueMember]
  ]

  for (let index = 0; index < fields.length; index = index + 1) {
    if (fields[index][1].length === 0) {
      throw new Error(`native type ${nativeType.typeId} C++ iteration requires ${fields[index][0]}`)
    }
  }

  const adapter = iteration.receiverAdapter

  if (adapter !== null && typeof adapter !== 'undefined' && !adapter.includes('$value')) {
    throw new Error(`native type ${nativeType.typeId} C++ iteration receiver adapter requires $value`)
  }

  const valueAdapter = iteration.valueAdapter

  if (valueAdapter !== null && typeof valueAdapter !== 'undefined' && !valueAdapter.includes('$value')) {
    throw new Error(`native type ${nativeType.typeId} C++ iteration value adapter requires $value`)
  }

  if (typeof iteration.managedValue !== 'undefined' && typeof iteration.managedValue !== 'boolean') {
    throw new Error(`native type ${nativeType.typeId} has invalid C++ iteration managed value flag`)
  }

  if (typeof iteration.rangeBased !== 'undefined' && typeof iteration.rangeBased !== 'boolean') {
    throw new Error(`native type ${nativeType.typeId} has invalid C++ range iteration flag`)
  }

  if (iteration.rangeBased === true && iteration.nextFailureMode === 'thrown') {
    throw new Error(`native type ${nativeType.typeId} C++ range iteration cannot use nextFailureMode`)
  }

  const failureModes = [
    ['creationFailureMode', iteration.creationFailureMode],
    ['nextFailureMode', iteration.nextFailureMode]
  ]

  for (let index = 0; index < failureModes.length; index = index + 1) {
    const mode = failureModes[index][1]

    if (mode !== null && typeof mode !== 'undefined' && mode !== 'thrown') {
      throw new Error(`native type ${nativeType.typeId} has unknown C++ iteration ${failureModes[index][0]}`)
    }
  }

  if (
    iteration.preservesPendingException === true &&
    (iteration.iteratorMethod === null || iteration.creationFailureMode !== 'thrown')
  ) {
    throw new Error(`native type ${nativeType.typeId} preserves pending exceptions without a throwing iterator method`)
  }

  const traits = nativeType.traits ?? []
  let iterable = false

  for (let index = 0; index < traits.length; index = index + 1) {
    if (traits[index].traitId === 'iterable') {
      iterable = true
      break
    }
  }

  if (!iterable) {
    throw new Error(`native type ${nativeType.typeId} C++ iteration requires iterable trait`)
  }
}

function validateNativeTypeParameters(nativeType: LibraryNativeTypeDescriptor): Set<string> {
  const result: Set<string> = new Set()
  const typeParameters = nativeType.typeParameters ?? []

  for (let index = 0; index < typeParameters.length; index = index + 1) {
    const name = typeParameters[index]

    if (name.length === 0) {
      throw new Error(`native type ${nativeType.typeId} has empty type parameter`)
    }

    if (result.has(name)) {
      throw new Error(`native type ${nativeType.typeId} has duplicate type parameter ${name}`)
    }

    result.add(name)
  }

  return result
}

function validateOperationTypeRefs(
  operations: LibraryOperationDescriptor[],
  nativeTypes: LibraryNativeTypeDescriptor[]
): void {
  for (let index = 0; index < operations.length; index = index + 1) {
    const operation = operations[index]
    const typeParameters = validateOperationTypeParameters(operation)
    const operationTypeRef = operation.resultTypeRef

    validateOperationArgumentNarrowing(operation, nativeTypes, typeParameters)
    validateOperationArgumentAdapterTypeIds(
      `operation ${operation.operationId}`,
      operation.cArgumentAdapters,
      operation.cArgumentAdapterTypeIds,
      nativeTypes
    )

    if (operationTypeRef !== null && typeof operationTypeRef !== 'undefined') {
      validateTypeRef(`operation ${operation.operationId} result`, operationTypeRef, nativeTypes, typeParameters)
    }

    validateOperationArgumentTypeRefs(operation.operationId, operation.argumentChecks, nativeTypes, typeParameters)

    validateCResultMapping(`operation ${operation.operationId}`, operation.cResultMapping, operationTypeRef)

    const variants = operation.variants ?? []

    for (let variantIndex = 0; variantIndex < variants.length; variantIndex = variantIndex + 1) {
      const variant = variants[variantIndex]
      const variantTypeRef = variant.resultTypeRef
      const resultTypeRef = variantTypeRef ?? operationTypeRef

      validateOperationArgumentTypeRefs(
        `${operation.operationId} variant ${variantIndex}`,
        variant.argumentChecks,
        nativeTypes,
        typeParameters
      )
      validateOperationArgumentAdapterTypeIds(
        `operation ${operation.operationId} variant ${variantIndex}`,
        variant.cArgumentAdapters ?? operation.cArgumentAdapters,
        variant.cArgumentAdapterTypeIds ?? operation.cArgumentAdapterTypeIds,
        nativeTypes
      )
      if (resultTypeRef === null || typeof resultTypeRef === 'undefined') {
        validateCResultMapping(
          `operation ${operation.operationId} variant ${variantIndex}`,
          variant.cResultMapping ?? operation.cResultMapping,
          resultTypeRef
        )
        continue
      }

      if (variantTypeRef !== null && typeof variantTypeRef !== 'undefined') {
        validateTypeRef(
          `operation ${operation.operationId} variant ${variantIndex} result`,
          variantTypeRef,
          nativeTypes,
          typeParameters
        )
      }

      validateCResultMapping(
        `operation ${operation.operationId} variant ${variantIndex}`,
        variant.cResultMapping ?? operation.cResultMapping,
        resultTypeRef
      )
    }
  }
}

function validateOperationArgumentAdapterTypeIds(
  label: string,
  adapters: string[] | null | undefined,
  adapterTypeIds: string[] | null | undefined,
  nativeTypes: LibraryNativeTypeDescriptor[]
): void {
  if (adapterTypeIds === null || typeof adapterTypeIds === 'undefined') {
    return
  }

  if (adapters === null || typeof adapters === 'undefined' || adapterTypeIds.length > adapters.length) {
    throw new Error(`${label} C++ argument adapter type ids require matching adapters`)
  }

  for (let index = 0; index < adapterTypeIds.length; index = index + 1) {
    const typeId = adapterTypeIds[index]

    if (typeId.length === 0) {
      continue
    }

    if (adapters[index].length === 0 || !adapters[index].includes('$value')) {
      throw new Error(`${label} C++ argument adapter ${index} type id requires a $value adapter`)
    }

    if (nativeTypeForValidation(nativeTypes, typeId) === null) {
      throw new Error(`${label} C++ argument adapter ${index} references unknown native type ${typeId}`)
    }
  }
}

function validateOperationArgumentNarrowing(
  operation: LibraryOperationDescriptor,
  nativeTypes: LibraryNativeTypeDescriptor[],
  typeParameters: Set<string> | null
): void {
  const narrowing = operation.argumentNarrowing

  if (narrowing === null || typeof narrowing === 'undefined') {
    return
  }

  if (narrowing.argumentIndex < 0 || Math.floor(narrowing.argumentIndex) !== narrowing.argumentIndex) {
    throw new Error(
      `operation ${operation.operationId} has invalid narrowing argument index ${narrowing.argumentIndex}`
    )
  }

  if (typeof operation.maxArgs === 'number' && narrowing.argumentIndex >= operation.maxArgs) {
    throw new Error(`operation ${operation.operationId} narrows missing argument ${narrowing.argumentIndex}`)
  }

  const trueValueType = narrowing.trueValueType
  const falseValueType = narrowing.falseValueType
  const trueTypeRef = narrowing.trueTypeRef
  const falseTypeRef = narrowing.falseTypeRef

  if (trueTypeRef !== null && typeof trueTypeRef !== 'undefined') {
    validateTypeRef(
      `operation ${operation.operationId} true argument narrowing`,
      trueTypeRef,
      nativeTypes,
      typeParameters
    )
  }

  if (falseTypeRef !== null && typeof falseTypeRef !== 'undefined') {
    validateTypeRef(
      `operation ${operation.operationId} false argument narrowing`,
      falseTypeRef,
      nativeTypes,
      typeParameters
    )
  }

  if (
    (trueTypeRef === null || typeof trueTypeRef === 'undefined') &&
    (falseTypeRef === null || typeof falseTypeRef === 'undefined') &&
    (trueValueType === null || typeof trueValueType === 'undefined' || trueValueType.length === 0) &&
    (falseValueType === null || typeof falseValueType === 'undefined' || falseValueType.length === 0) &&
    narrowing.trueNonNullable !== true &&
    narrowing.falseNonNullable !== true
  ) {
    throw new Error(`operation ${operation.operationId} has empty argument narrowing`)
  }
}

function validateOperationTypeParameters(operation: LibraryOperationDescriptor): Set<string> | null {
  const parameters = operation.typeParameters ?? []

  if (parameters.length === 0) {
    return null
  }

  const names: Set<string> = new Set()

  for (let index = 0; index < parameters.length; index = index + 1) {
    const parameter = parameters[index]

    if (parameter.name.length === 0) {
      throw new Error(`operation ${operation.operationId} has empty type parameter`)
    }

    if (names.has(parameter.name)) {
      throw new Error(`operation ${operation.operationId} has duplicate type parameter ${parameter.name}`)
    }

    if (parameter.sources.length === 0) {
      throw new Error(`operation ${operation.operationId} type parameter ${parameter.name} has no sources`)
    }

    names.add(parameter.name)

    for (let sourceIndex = 0; sourceIndex < parameter.sources.length; sourceIndex = sourceIndex + 1) {
      validateOperationTypeParameterSource(operation.operationId, parameter.name, parameter.sources[sourceIndex])
    }
  }

  return names
}

function validateOperationTypeParameterSource(
  operationId: string,
  parameterName: string,
  source: NonNullable<LibraryOperationDescriptor['typeParameters']>[number]['sources'][number]
): void {
  if (source.source === 'receiver-trait') {
    validateOperationTraitArgumentIndex(operationId, parameterName, source.traitArgumentIndex)
    return
  }

  const argumentIndex = source.argumentIndex

  if (typeof argumentIndex !== 'number' || argumentIndex < 0 || Math.floor(argumentIndex) !== argumentIndex) {
    throw new Error(
      `operation ${operationId} type parameter ${parameterName} has invalid source argument index ${argumentIndex}`
    )
  }

  if (source.source === 'argument-array-literal-column') {
    const elementIndex = source.elementIndex

    if (typeof elementIndex !== 'number' || elementIndex < 0 || Math.floor(elementIndex) !== elementIndex) {
      throw new Error(
        `operation ${operationId} type parameter ${parameterName} has invalid literal element index ` +
          `${elementIndex}`
      )
    }

    return
  }

  if (source.source !== 'argument-trait') {
    return
  }

  validateOperationTraitArgumentIndex(operationId, parameterName, source.traitArgumentIndex)
}

function validateOperationTraitArgumentIndex(
  operationId: string,
  parameterName: string,
  traitArgumentIndex: number | null
): void {
  if (
    typeof traitArgumentIndex !== 'number' ||
    traitArgumentIndex < 0 ||
    Math.floor(traitArgumentIndex) !== traitArgumentIndex
  ) {
    throw new Error(
      `operation ${operationId} type parameter ${parameterName} has invalid trait argument index ` +
        `${traitArgumentIndex}`
    )
  }
}

function validateOperationArgumentTypeRefs(
  label: string,
  checks: LibraryArgumentCheckDescriptor[] | null | undefined,
  nativeTypes: LibraryNativeTypeDescriptor[],
  typeParameters: Set<string> | null
): void {
  const values = checks ?? []

  for (let index = 0; index < values.length; index = index + 1) {
    const check = values[index]
    const typeRef = check.typeRef

    if (typeRef !== null && typeof typeRef !== 'undefined') {
      validateTypeRef(`operation ${label} argument ${index}`, typeRef, nativeTypes, typeParameters)
    }

    const functionReturnTypeRef = check.functionReturnTypeRef

    if (functionReturnTypeRef !== null && typeof functionReturnTypeRef !== 'undefined') {
      validateTypeRef(
        `operation ${label} argument ${index} callback result`,
        functionReturnTypeRef,
        nativeTypes,
        typeParameters
      )
    }

    const functionParameters = check.functionParameters ?? []

    for (let parameterIndex = 0; parameterIndex < functionParameters.length; parameterIndex = parameterIndex + 1) {
      const parameterTypeRef = functionParameters[parameterIndex].typeRef

      if (parameterTypeRef !== null && typeof parameterTypeRef !== 'undefined') {
        validateTypeRef(
          `operation ${label} argument ${index} callback parameter ${parameterIndex}`,
          parameterTypeRef,
          nativeTypes,
          typeParameters
        )
      }
    }
  }
}

function validateOperationResultInferences(operations: LibraryOperationDescriptor[]): void {
  for (let index = 0; index < operations.length; index = index + 1) {
    const operation = operations[index]

    validateOperationResultInference(
      `operation ${operation.operationId}`,
      operation.resultInference,
      operation.cArgumentKinds,
      operation.cArgumentMethodNames
    )

    const variants = operation.variants ?? []

    for (let variantIndex = 0; variantIndex < variants.length; variantIndex = variantIndex + 1) {
      const variant = variants[variantIndex]

      validateOperationResultInference(
        `operation ${operation.operationId} variant ${variantIndex}`,
        variant.resultInference,
        variant.cArgumentKinds ?? operation.cArgumentKinds,
        variant.cArgumentMethodNames ?? operation.cArgumentMethodNames
      )
    }
  }
}

function validateOperationResultAdapters(operations: LibraryOperationDescriptor[]): void {
  for (let index = 0; index < operations.length; index = index + 1) {
    const operation = operations[index]

    validateOperationResultAdapter(`operation ${operation.operationId}`, operation.cResultAdapter)

    const variants = operation.variants ?? []

    for (let variantIndex = 0; variantIndex < variants.length; variantIndex = variantIndex + 1) {
      validateOperationResultAdapter(
        `operation ${operation.operationId} variant ${variantIndex}`,
        variants[variantIndex].cResultAdapter
      )
    }
  }
}

function validateOperationResultAdapter(label: string, adapter: string | null | undefined): void {
  if (adapter !== null && typeof adapter !== 'undefined' && !adapter.includes('$value')) {
    throw new Error(`${label} C++ result adapter requires $value`)
  }
}

function validateOperationResultInference(
  label: string,
  inference: LibraryOperationDescriptor['resultInference'],
  argumentKinds: LibraryOperationDescriptor['cArgumentKinds'],
  argumentMethodNames: LibraryOperationDescriptor['cArgumentMethodNames']
): void {
  if (argumentMethodNames !== null && typeof argumentMethodNames !== 'undefined') {
    if (argumentKinds === null || typeof argumentKinds === 'undefined') {
      throw new Error(`${label} C++ argument method names require argument kinds`)
    }

    if (argumentMethodNames.length > argumentKinds.length) {
      throw new Error(`${label} has more C++ argument method names than argument kinds`)
    }

    for (let index = 0; index < argumentMethodNames.length; index = index + 1) {
      if (argumentMethodNames[index].length === 0) {
        throw new Error(`${label} has empty C++ argument method name ${index}`)
      }

      if (argumentKinds[index] !== 'runtime-value') {
        throw new Error(`${label} C++ argument method ${index} requires runtime-value kind`)
      }
    }
  }

  if (inference === null || typeof inference === 'undefined') {
    return
  }

  if (inference.fingerprint.length === 0) {
    throw new Error(`${label} result inference requires fingerprint`)
  }

  if (inference.argumentIndex < 0 || Math.floor(inference.argumentIndex) !== inference.argumentIndex) {
    throw new Error(`${label} result inference has invalid argument index ${inference.argumentIndex}`)
  }

  if (inference.literalProviderId.length === 0) {
    throw new Error(`${label} result inference requires literal provider id`)
  }

  const contextualTypes: Set<string> = new Set()

  for (let index = 0; index < inference.contextualValueTypes.length; index = index + 1) {
    const valueType = inference.contextualValueTypes[index]

    if (valueType.length === 0) {
      throw new Error(`${label} result inference has empty contextual value type`)
    }

    if (contextualTypes.has(valueType)) {
      throw new Error(`${label} result inference has duplicate contextual value type ${valueType}`)
    }

    contextualTypes.add(valueType)
  }
}

function validateCResultMapping(
  label: string,
  mapping: LibraryCResultMappingDescriptor | null | undefined,
  resultTypeRef: TypeRef | null | undefined
): void {
  if (mapping === null || typeof mapping === 'undefined') {
    return
  }

  if (resultTypeRef === null || typeof resultTypeRef === 'undefined') {
    throw new Error(`${label} C++ result mapping requires resultTypeRef`)
  }

  if (mapping.cppType.length === 0) {
    throw new Error(`${label} C++ result mapping requires cppType`)
  }

  if (resultTypeRef.kind !== 'object') {
    if (mapping.fields.length > 0) {
      throw new Error(`${label} C++ result field mappings require object resultTypeRef`)
    }

    return
  }

  validateCResultFieldMappings(label, mapping.fields, resultTypeRef)
}

function validateCResultFieldMappings(
  label: string,
  mappings: LibraryCResultFieldMappingDescriptor[],
  resultTypeRef: ObjectTypeRef
): void {
  const seen: Set<string> = new Set()

  for (let index = 0; index < mappings.length; index = index + 1) {
    const mapping = mappings[index]

    if (seen.has(mapping.name)) {
      throw new Error(`${label} has duplicate C++ result field mapping ${mapping.name}`)
    }

    seen.add(mapping.name)

    let semanticField: ObjectTypeRef['fields'][number] | null = null

    for (let fieldIndex = 0; fieldIndex < resultTypeRef.fields.length; fieldIndex = fieldIndex + 1) {
      const candidate = resultTypeRef.fields[fieldIndex]

      if (candidate.name === mapping.name) {
        semanticField = candidate
        break
      }
    }

    if (semanticField === null) {
      throw new Error(`${label} has unknown C++ result field mapping ${mapping.name}`)
    }

    if (mapping.cMember.length === 0) {
      throw new Error(`${label} C++ result field mapping ${mapping.name} requires cMember`)
    }

    const cppType = mapping.cppType

    if (typeof cppType === 'string' && cppType.length === 0) {
      throw new Error(`${label} C++ result field mapping ${mapping.name} has empty cppType`)
    }

    const nestedMappings = mapping.fields

    if (nestedMappings === null || typeof nestedMappings === 'undefined') {
      continue
    }

    if (semanticField.typeRef.kind !== 'object') {
      throw new Error(`${label} C++ result field mapping ${mapping.name} requires object field TypeRef`)
    }

    validateCResultFieldMappings(`${label} field ${mapping.name}`, nestedMappings, semanticField.typeRef)
  }
}

function validateTypeRef(
  label: string,
  typeRef: TypeRef,
  nativeTypes: LibraryNativeTypeDescriptor[],
  typeParameters: Set<string> | null = null
): void {
  if (typeRef.kind === 'parameter') {
    if (typeParameters === null) {
      throw new Error(`${label} uses type parameter ${typeRef.name} outside template scope`)
    }

    if (!typeParameters.has(typeRef.name)) {
      throw new Error(`${label} references unknown type parameter ${typeRef.name}`)
    }

    return
  }

  validateTypeRefCommon(label, typeRef, nativeTypes, typeParameters)

  if (typeRef.kind === 'primitive') {
    if (!isCorePrimitiveType(typeRef.name)) {
      throw new Error(`${label} has unknown primitive ${typeRef.name}`)
    }
    return
  }

  if (typeRef.kind === 'nominal') {
    const nativeType = nativeTypeForValidation(nativeTypes, typeRef.typeId)

    if (nativeType === null) {
      throw new Error(`${label} references unknown nominal type ${typeRef.typeId}`)
    }

    const nativeTypeParameters = nativeType.typeParameters

    if (
      nativeTypeParameters !== null &&
      typeof nativeTypeParameters !== 'undefined' &&
      nativeTypeParameters.length !== typeRef.args.length
    ) {
      throw new Error(
        `${label} nominal type ${typeRef.typeId} expects ${nativeTypeParameters.length} type argument(s), ` +
          `got ${typeRef.args.length}`
      )
    }

    validateTypeRefList(`${label} generic argument`, typeRef.args, nativeTypes, typeParameters)
    return
  }

  if (typeRef.kind === 'function') {
    validateTypeRefList(`${label} parameter`, typeRef.params, nativeTypes, typeParameters)
    validateTypeRef(`${label} result`, typeRef.result, nativeTypes, typeParameters)
    return
  }

  if (typeRef.kind === 'object') {
    const names: Set<string> = new Set()

    for (let index = 0; index < typeRef.fields.length; index = index + 1) {
      const field = typeRef.fields[index]

      if (names.has(field.name)) {
        throw new Error(`${label} has duplicate object field ${field.name}`)
      }

      names.add(field.name)
      validateTypeRef(`${label} field ${field.name}`, field.typeRef, nativeTypes, typeParameters)
    }

    if (typeRef.dynamicField !== null && typeof typeRef.dynamicField !== 'undefined') {
      validateTypeRef(`${label} dynamic field`, typeRef.dynamicField, nativeTypes, typeParameters)
    }

    return
  }
}

function validateTypeRefCommon(
  label: string,
  typeRef: ConcreteTypeRef,
  nativeTypes: LibraryNativeTypeDescriptor[],
  typeParameters: Set<string> | null
): void {
  if (!isTypeOwnership(typeRef.ownership)) {
    throw new Error(`${label} has unknown ownership ${typeRef.ownership}`)
  }

  validateTypeTraits(label, typeRef.traits, nativeTypes, typeParameters)
}

function validateTypeTraits(
  label: string,
  traits: TypeTraitRef[],
  nativeTypes: LibraryNativeTypeDescriptor[],
  typeParameters: Set<string> | null
): void {
  const traitIds: Set<string> = new Set()

  for (let index = 0; index < traits.length; index = index + 1) {
    const trait = traits[index]

    if (!isTypeTraitId(trait.traitId)) {
      throw new Error(`${label} has unknown trait ${trait.traitId}`)
    }

    if (traitIds.has(trait.traitId)) {
      throw new Error(`${label} has duplicate trait ${trait.traitId}`)
    }

    traitIds.add(trait.traitId)
    validateTypeRefList(`${label} trait ${trait.traitId} argument`, trait.args, nativeTypes, typeParameters)
  }
}

function validateTypeRefList(
  label: string,
  refs: TypeRef[],
  nativeTypes: LibraryNativeTypeDescriptor[],
  typeParameters: Set<string> | null
): void {
  for (let index = 0; index < refs.length; index = index + 1) {
    validateTypeRef(`${label} ${index}`, refs[index], nativeTypes, typeParameters)
  }
}

function nativeTypeForValidation(
  nativeTypes: LibraryNativeTypeDescriptor[],
  typeId: string
): LibraryNativeTypeDescriptor | null {
  for (let index = 0; index < nativeTypes.length; index = index + 1) {
    if (nativeTypes[index].typeId === typeId) {
      return nativeTypes[index]
    }
  }

  return null
}

function isCorePrimitiveType(value: string): boolean {
  return (
    value === 'boolean' ||
    value === 'bytes' ||
    value === 'null' ||
    value === 'number' ||
    value === 'string' ||
    value === 'void'
  )
}

function isTypeOwnership(value: string): boolean {
  return value === 'value' || value === 'owned' || value === 'borrowed' || value === 'weak'
}

function isTypeTraitId(value: string): boolean {
  return value === 'iterable' || value === 'indexable' || value === 'awaitable'
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

function validateIntrinsicOperationBindings(
  bindings: IntrinsicRoleBinding[],
  operations: LibraryOperationDescriptor[]
): void {
  for (let bindingIndex = 0; bindingIndex < bindings.length; bindingIndex = bindingIndex + 1) {
    const binding = bindings[bindingIndex]
    let found = false

    for (let operationIndex = 0; operationIndex < operations.length; operationIndex = operationIndex + 1) {
      const operation = operations[operationIndex]

      if (operation.bindingId === binding.bindingId || (operation.bindingAliases ?? []).includes(binding.bindingId)) {
        found = true
        break
      }
    }

    if (!found) {
      throw new Error(
        `Compiler library intrinsic provider ${binding.role} references missing operation ${binding.bindingId}`
      )
    }
  }
}

function validateSequenceMaterializationIntrinsic(
  bindings: IntrinsicRoleBinding[],
  operations: LibraryOperationDescriptor[],
  nativeTypes: LibraryNativeTypeDescriptor[]
): void {
  for (let bindingIndex = 0; bindingIndex < bindings.length; bindingIndex = bindingIndex + 1) {
    const binding = bindings[bindingIndex]

    if (binding.role !== 'array-literal') {
      continue
    }

    let provider: LibraryOperationDescriptor | null = null

    for (let operationIndex = 0; operationIndex < operations.length; operationIndex = operationIndex + 1) {
      const operation = operations[operationIndex]

      if (
        operation.kind === 'construct' &&
        (operation.bindingId === binding.bindingId || (operation.bindingAliases ?? []).includes(binding.bindingId))
      ) {
        if (provider !== null) {
          throw new Error(`Compiler library intrinsic provider array-literal has multiple construct operations`)
        }

        provider = operation
      }
    }

    if (provider === null) {
      throw new Error(`Compiler library intrinsic provider array-literal requires a construct operation`)
    }

    const materialization = provider.cSequenceMaterialization

    if (materialization === null || typeof materialization === 'undefined') {
      throw new Error(
        `Compiler library intrinsic provider array-literal operation ${provider.operationId} requires C++ sequence materialization`
      )
    }

    validateSequenceMaterializationExpression(provider.operationId, 'create', materialization.createExpression, [])
    validateSequenceMaterializationExpression(
      provider.operationId,
      'append element',
      materialization.appendElementExpression,
      ['$target', '$value']
    )
    validateSequenceMaterializationExpression(
      provider.operationId,
      'append spread',
      materialization.appendSpreadExpression,
      ['$target', '$value']
    )

    const spreadAdapter = materialization.appendSpreadValueAdapter
    const spreadTypeId = materialization.appendSpreadValueTypeId

    if (typeof spreadAdapter === 'string' && spreadAdapter.length > 0 && !spreadAdapter.includes('$value')) {
      throw new Error(`operation ${provider.operationId} C++ sequence append spread value adapter requires $value`)
    }

    if (typeof spreadTypeId === 'string' && spreadTypeId.length > 0) {
      if (typeof spreadAdapter !== 'string' || spreadAdapter.length === 0) {
        throw new Error(`operation ${provider.operationId} C++ sequence append spread value type requires an adapter`)
      }

      if (nativeTypeForValidation(nativeTypes, spreadTypeId) === null) {
        throw new Error(
          `operation ${provider.operationId} C++ sequence append spread references unknown native type ${spreadTypeId}`
        )
      }
    }
  }
}

function validateSequenceMaterializationExpression(
  operationId: string,
  label: string,
  expression: string,
  requiredPlaceholders: string[]
): void {
  if (expression.trim().length === 0) {
    throw new Error(`operation ${operationId} C++ sequence ${label} expression must not be empty`)
  }

  for (let index = 0; index < requiredPlaceholders.length; index = index + 1) {
    if (!expression.includes(requiredPlaceholders[index])) {
      throw new Error(
        `operation ${operationId} C++ sequence ${label} expression requires ${requiredPlaceholders[index]}`
      )
    }
  }
}

function validateAsyncResultIntrinsicNativeType(
  bindings: IntrinsicRoleBinding[],
  operations: LibraryOperationDescriptor[],
  nativeTypes: LibraryNativeTypeDescriptor[]
): void {
  for (let bindingIndex = 0; bindingIndex < bindings.length; bindingIndex = bindingIndex + 1) {
    const binding = bindings[bindingIndex]

    if (binding.role !== 'async-result') {
      continue
    }

    const constructOperations: LibraryOperationDescriptor[] = []

    for (let operationIndex = 0; operationIndex < operations.length; operationIndex = operationIndex + 1) {
      const operation = operations[operationIndex]

      if (
        operation.kind === 'construct' &&
        (operation.bindingId === binding.bindingId || (operation.bindingAliases ?? []).includes(binding.bindingId))
      ) {
        constructOperations.push(operation)
      }
    }

    if (constructOperations.length !== 1) {
      throw new Error(
        `Compiler library intrinsic provider async-result requires exactly one construct operation for binding ${binding.bindingId}`
      )
    }

    const constructOperation = constructOperations[0]

    if (constructOperation.asyncResultOperation !== 'create') {
      throw new Error(
        `Compiler library intrinsic provider async-result construct operation ${constructOperation.operationId} must declare async-result construct role`
      )
    }

    const resultTypeRef = constructOperation.resultTypeRef
    const nativeType =
      resultTypeRef?.kind === 'nominal' ? nativeTypeForValidation(nativeTypes, resultTypeRef.typeId) : null

    if (nativeType === null || nativeType.cppType.length === 0) {
      throw new Error(
        `Compiler library intrinsic provider async-result construct operation ${constructOperation.operationId} requires a resolvable native C++ result type`
      )
    }

    if (typeof constructOperation.cExpression !== 'string' || constructOperation.cExpression.trim().length === 0) {
      throw new Error(
        `Compiler library intrinsic provider async-result create operation ${constructOperation.operationId} requires a C++ expression`
      )
    }

    if (
      typeof constructOperation.cAsyncFulfillExpression !== 'string' ||
      constructOperation.cAsyncFulfillExpression.trim().length === 0
    ) {
      throw new Error(
        `Compiler library intrinsic provider async-result create operation ${constructOperation.operationId} requires non-empty cAsyncFulfillExpression`
      )
    }

    if (
      typeof constructOperation.cAsyncRejectExpression !== 'string' ||
      constructOperation.cAsyncRejectExpression.trim().length === 0
    ) {
      throw new Error(
        `Compiler library intrinsic provider async-result create operation ${constructOperation.operationId} requires non-empty cAsyncRejectExpression`
      )
    }

    if (nativeType.cAsyncTaskBridge === null || typeof nativeType.cAsyncTaskBridge === 'undefined') {
      throw new Error(
        `Compiler library intrinsic provider async-result native type ${nativeType.typeId} requires an async-task bridge`
      )
    }

    validateAsyncResultTaskOperations(constructOperation, operations)
  }
}

function validateAsyncResultTaskOperations(
  constructOperation: LibraryOperationDescriptor,
  operations: LibraryOperationDescriptor[]
): void {
  const requiredKinds: LibraryAsyncResultOperationKind[] = ['create', 'fulfill', 'reject', 'map-fulfilled']

  for (let kindIndex = 0; kindIndex < requiredKinds.length; kindIndex = kindIndex + 1) {
    const kind = requiredKinds[kindIndex]
    const matches: LibraryOperationDescriptor[] = []

    for (let operationIndex = 0; operationIndex < operations.length; operationIndex = operationIndex + 1) {
      const operation = operations[operationIndex]

      if (operation.libraryId === constructOperation.libraryId && operation.asyncResultOperation === kind) {
        matches.push(operation)
      }
    }

    if (matches.length !== 1) {
      throw new Error(`Compiler library intrinsic provider async-result requires exactly one ${kind} C++ operation`)
    }

    const operation = matches[0]
    const expectedKind = kind === 'create' ? 'construct' : 'call'

    if (operation.kind !== expectedKind) {
      throw new Error(
        `Compiler library intrinsic provider async-result ${kind} operation ${operation.operationId} must use ${expectedKind} kind`
      )
    }

    if (kind === 'create' && operation !== constructOperation) {
      throw new Error(
        `Compiler library intrinsic provider async-result construct binding and async-result operation must match`
      )
    }

    if (typeof operation.cExpression !== 'string' || operation.cExpression.trim().length === 0) {
      throw new Error(
        `Compiler library intrinsic provider async-result ${kind} operation ${operation.operationId} requires a C++ expression`
      )
    }
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

function compilerLibrarySetFingerprint(
  libraries: CompilerLibraryDescriptor[],
  targetOptions: LibraryOptionDescriptor[]
): string {
  const rows: string[] = []

  if (targetOptions.length > 0) {
    const optionIds: string[] = []

    for (let index = 0; index < targetOptions.length; index = index + 1) {
      insertSortedString(optionIds, libraryOptionDescriptorFingerprint(targetOptions[index]))
    }

    rows.push('@target-options|options=' + optionIds.join(','))
  }

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
        item.kind +
          ':' +
          item.source +
          ':' +
          item.libraryId +
          ':' +
          (item.compilerImplemented === true ? 'implemented' : 'declaration-only') +
          ':' +
          item.declarationSource
      )
    }

    for (let itemIndex = 0; itemIndex < library.operations.length; itemIndex = itemIndex + 1) {
      const item = library.operations[itemIndex]
      insertSortedString(
        operationIds,
        item.libraryId +
          ':' +
          item.bindingId +
          ':' +
          item.operationId +
          ':' +
          item.kind +
          ':' +
          (item.asyncResultOperation ?? '') +
          ':' +
          (item.cAsyncFulfillExpression ?? '') +
          ':' +
          (item.cAsyncRejectExpression ?? '') +
          ':' +
          sequenceMaterializationFingerprint(item) +
          ':' +
          sortedStrings(item.bindingAliases ?? []).join(',') +
          ':' +
          (item.acceptsUnknownReceiver === true ? 'unknown-receiver' : 'typed-receiver') +
          ':' +
          sortedStrings(item.runtimeRequirements).join(',') +
          ':' +
          operationTypeParametersFingerprint(item) +
          ':' +
          (item.cExpression ?? '') +
          ':' +
          (item.cClassFormatExpression ?? '') +
          ':' +
          (item.cArgumentKinds ?? []).join(',') +
          ':' +
          (item.cArgumentAdapters ?? []).join(',') +
          ':' +
          (item.cArgumentAdapterTypeIds ?? []).join(',') +
          ':' +
          (item.cArgumentMethodNames ?? []).join(',') +
          ':' +
          operationArgumentSourcesFingerprint(item.cArgumentSources) +
          ':' +
          (item.callbackLifetime ?? '') +
          ':' +
          operationArgumentNarrowingFingerprint(item.argumentNarrowing) +
          ':' +
          (item.cResultMode ?? '') +
          ':' +
          cResultMappingFingerprint(item.cResultMapping) +
          ':' +
          (item.cReceiverAdapter ?? '') +
          ':' +
          (item.cResultAdapter ?? '') +
          ':' +
          typeRefFingerprintOrEmpty(item.resultTypeRef) +
          ':' +
          resultInferenceFingerprint(item.resultInference) +
          ':' +
          (item.receiverTypeId ?? '') +
          ':' +
          (item.cCallStyle ?? '') +
          ':' +
          (item.cFailureMode ?? '') +
          ':' +
          (item.cPreservesPendingException === true ? 'preserves-pending-exception' : '') +
          ':' +
          (item.minArgs ?? '') +
          ':' +
          (item.maxArgs ?? '') +
          ':' +
          operationArgumentChecksFingerprint(item) +
          ':' +
          (item.constantValue ?? '') +
          ':' +
          (item.diagnosticCode ?? '') +
          ':' +
          (item.diagnosticMessage ?? '') +
          ':' +
          operationVariantsFingerprint(item)
      )
    }

    const libraryOptions = library.options ?? []

    for (let itemIndex = 0; itemIndex < libraryOptions.length; itemIndex = itemIndex + 1) {
      const item = libraryOptions[itemIndex]
      insertSortedString(optionIds, libraryOptionDescriptorFingerprint(item))
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
            compilerLibraryOptionScalarType(mappingValue) +
              ':' +
              compilerLibraryOptionScalarText(mappingValue) +
              '=' +
              valueMap[mappingIndex].cExpression
          )
        }

        argumentsFingerprint.push(
          argument.optionId + ':' + argument.source + ':' + argument.cValueKind + ':' + mappings.join(',')
        )
      }

      insertSortedString(
        initializerIds,
        item.libraryId +
          ':' +
          item.initializerId +
          ':' +
          item.runtimeRequirement +
          ':' +
          item.cType +
          ':' +
          item.cName +
          ':' +
          argumentsFingerprint.join(';')
      )
    }

    const libraryNativeTypes = library.nativeTypes ?? []

    for (let itemIndex = 0; itemIndex < libraryNativeTypes.length; itemIndex = itemIndex + 1) {
      const item = libraryNativeTypes[itemIndex]
      insertSortedString(
        nativeTypeIds,
        item.libraryId +
          ':' +
          item.typeId +
          ':names=' +
          sortedStrings(item.declarationNames).join(',') +
          ':value=' +
          item.valueType +
          ':cpp=' +
          item.cppType +
          ':bases=' +
          sortedStrings(item.baseTypeIds).join(',') +
          ':requirements=' +
          sortedStrings(item.runtimeRequirements).join(',') +
          ':value-adapter=' +
          (item.cValueAdapter ?? '') +
          ':value-adapter-failure=' +
          (item.cValueAdapterFailureMode ?? '') +
          ':value-adapter-preserves-pending-exception=' +
          (item.cValueAdapterPreservesPendingException === true ? '1' : '') +
          ':runtime-value-expression=' +
          (item.cRuntimeValueExpression ?? '') +
          ':runtime-value-valid-expression=' +
          (item.cRuntimeValueValidExpression ?? '') +
          ':await-expression=' +
          (item.cAwaitExpression ?? '') +
          ':await-handles-invalid-source=' +
          (item.cAwaitHandlesInvalidSource === true ? '1' : '') +
          ':async-task-bridge=' +
          nativeAsyncTaskBridgeFingerprint(item) +
          ':parameters=' +
          (item.typeParameters ?? []).map(fingerprintAtom).join(',') +
          ':traits=' +
          typeTraitRefsFingerprint(item.traits ?? []) +
          ':iteration=' +
          nativeIterationFingerprint(item) +
          ':fields=' +
          resultShapeFieldsFingerprint(item.fields ?? [])
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
        item.id +
          ':deps=' +
          sortedStrings(item.dependencies).join(',') +
          ':includes=' +
          sortedStrings(item.cPreludeIncludes).join(',') +
          ':capabilities=' +
          sortedStrings(item.capabilities).join(',') +
          ':conditional=' +
          runtimeConditionalCapabilitiesFingerprint(item) +
          ':options=' +
          runtimeOptionConstraintsFingerprint(item) +
          ':entrypoint=' +
          runtimeEntrypointAdapterFingerprint(item)
      )
    }

    rows.push(
      library.id +
        '|deps=' +
        dependencyIds.join(',') +
        '|decl=' +
        declarationIds.join(',') +
        '|options=' +
        optionIds.join(',') +
        '|initializers=' +
        initializerIds.join(',') +
        '|types=' +
        nativeTypeIds.join(',') +
        '|ops=' +
        operationIds.join(',') +
        '|intrinsics=' +
        intrinsicIds.join(',') +
        '|requirements=' +
        requirementIds.join(',')
    )
  }

  return 'inox:library-set:v1:' + shortStableHash(rows.join(';'))
}

function libraryOptionDescriptorFingerprint(item: LibraryOptionDescriptor): string {
  return (
    item.libraryId +
    ':' +
    item.optionId +
    ':' +
    sortedStrings(item.cliAliases).join(',') +
    ':' +
    item.valueType +
    ':' +
    compilerLibraryOptionScalarText(item.defaultValue) +
    ':' +
    sortedOptionScalars(item.allowedValues ?? []).join(',') +
    ':' +
    (item.integer === true ? 'integer' : '') +
    ':' +
    (item.minimum ?? '') +
    ':' +
    (item.maximum ?? '')
  )
}

function nativeAsyncTaskBridgeFingerprint(nativeType: LibraryNativeTypeDescriptor): string {
  const bridge = nativeType.cAsyncTaskBridge

  if (bridge === null || typeof bridge === 'undefined') {
    return ''
  }

  return (
    'valid=' +
    fingerprintAtom(bridge.cValidExpression) +
    ':observe=' +
    fingerprintAtom(bridge.cObserveExpression) +
    ':fulfill=' +
    fingerprintAtom(bridge.cFulfillExpression) +
    ':reject=' +
    fingerprintAtom(bridge.cRejectExpression)
  )
}

function nativeIterationFingerprint(nativeType: LibraryNativeTypeDescriptor): string {
  const iteration = nativeType.cIteration

  if (iteration === null || typeof iteration === 'undefined') {
    return ''
  }

  return [
    iteration.iteratorMethod ?? '',
    iteration.nextMethod,
    iteration.doneMember,
    iteration.valueMember,
    iteration.receiverAdapter ?? '',
    iteration.valueAdapter ?? '',
    iteration.managedValue === true ? 'managed-value' : '',
    iteration.rangeBased === true ? 'range-based' : '',
    iteration.preservesPendingException === true ? 'preserves-pending-exception' : '',
    iteration.creationFailureMode ?? '',
    iteration.nextFailureMode ?? ''
  ]
    .map(fingerprintAtom)
    .join(',')
}

function pushNativeTypes(target: LibraryNativeTypeDescriptor[], values: LibraryNativeTypeDescriptor[]): void {
  for (let index = 0; index < values.length; index = index + 1) {
    target.push(values[index])
  }
}

function operationArgumentChecksFingerprint(operation: { argumentChecks?: LibraryArgumentCheckDescriptor[] }): string {
  const checks = operation.argumentChecks ?? []
  const rows: string[] = []

  for (let index = 0; index < checks.length; index = index + 1) {
    const check = checks[index]
    rows.push(
      sortedStrings(check.valueTypes).join(',') +
        ':' +
        typeRefFingerprintOrEmpty(check.typeRef) +
        ':' +
        sortedStrings(check.objectTypeIds ?? []).join(',') +
        ':' +
        (check.objectFieldValueType ?? '') +
        ':' +
        (check.arrayLiteralRequired === true ? 'literal' : '') +
        ':' +
        sortedStrings(check.arrayElementValueTypes ?? []).join(',') +
        ':' +
        sortedStrings(check.stringLiterals ?? []).join(',') +
        ':' +
        stringPrefixOptionConstraintsFingerprint(check.stringPrefixOptionConstraints ?? []) +
        ':' +
        (check.literalDiagnosticCode ?? '') +
        ':' +
        (check.literalDiagnosticMessage ?? '') +
        ':' +
        objectLiteralFieldsFingerprint(check.objectLiteralFields ?? []) +
        ':' +
        callbackParametersFingerprint(check.functionParameters ?? []) +
        ':' +
        (check.functionReturnType ?? '') +
        ':' +
        typeRefFingerprintOrEmpty(check.functionReturnTypeRef) +
        ':' +
        (check.functionAsync === true ? 'async' : check.functionAsync === false ? 'sync' : '') +
        ':' +
        (check.functionAsyncDiagnosticCode ?? '') +
        ':' +
        (check.functionAsyncDiagnosticMessage ?? '') +
        ':' +
        objectMethodChecksFingerprint(check.objectMethods ?? [])
    )
  }

  return rows.join(';')
}

function operationTypeParametersFingerprint(operation: LibraryOperationDescriptor): string {
  const parameters = operation.typeParameters ?? []
  const rows: string[] = []

  for (let index = 0; index < parameters.length; index = index + 1) {
    const parameter = parameters[index]
    const sources: string[] = []

    for (let sourceIndex = 0; sourceIndex < parameter.sources.length; sourceIndex = sourceIndex + 1) {
      const source = parameter.sources[sourceIndex]
      let row = source.source

      if (source.source !== 'receiver-trait') {
        row = row + ':' + source.argumentIndex
      }

      if (source.source === 'argument-trait' || source.source === 'receiver-trait') {
        row = row + ':' + source.traitId + ':' + source.traitArgumentIndex
      } else if (source.source === 'argument-array-literal-column') {
        row = row + ':' + (source.elementIndex ?? '')
      }

      sources.push(row)
    }

    rows.push(fingerprintAtom(parameter.name) + '[' + sources.join(',') + ']')
  }

  return rows.join(';')
}

function objectMethodChecksFingerprint(checks: NonNullable<LibraryArgumentCheckDescriptor['objectMethods']>): string {
  const rows: string[] = []

  for (let index = 0; index < checks.length; index = index + 1) {
    const check = checks[index]
    rows.push(
      check.name + ':' + check.minArgs + ':' + check.maxArgs + ':' + sortedStrings(check.returnValueTypes).join(',')
    )
  }

  return rows.join(',')
}

function callbackParametersFingerprint(parameters: LibraryCallbackParameterDescriptor[]): string {
  const rows: string[] = []

  for (let index = 0; index < parameters.length; index = index + 1) {
    const parameter = parameters[index]
    rows.push(
      parameter.name +
        ':' +
        parameter.valueType +
        ':' +
        (parameter.nullable === true ? 'nullable' : '') +
        ':' +
        typeRefFingerprintOrEmpty(parameter.typeRef) +
        ':' +
        (parameter.resultTypeId ?? '') +
        ':' +
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
      sortedStrings(variant.runtimeRequirements ?? []).join(',') +
        ':' +
        (variant.minArgs ?? '') +
        ':' +
        (variant.maxArgs ?? '') +
        ':' +
        operationArgumentChecksFingerprint(variant) +
        ':' +
        (variant.argumentIndex ?? '') +
        ':' +
        sortedStrings(variant.stringLiterals ?? []).join(',') +
        ':' +
        sortedStrings(variant.argumentValueTypes ?? []).join(',') +
        ':' +
        (variant.objectFieldName ?? '') +
        ':' +
        sortedBooleans(variant.booleanLiterals ?? []).join(',') +
        ':' +
        (variant.cExpression ?? '') +
        ':' +
        (variant.cClassFormatExpression ?? '') +
        ':' +
        (variant.cArgumentKinds ?? []).join(',') +
        ':' +
        (variant.cArgumentAdapters ?? []).join(',') +
        ':' +
        (variant.cArgumentAdapterTypeIds ?? []).join(',') +
        ':' +
        (variant.cArgumentMethodNames ?? []).join(',') +
        ':' +
        operationArgumentSourcesFingerprint(variant.cArgumentSources) +
        ':' +
        (variant.callbackLifetime ?? '') +
        ':' +
        (variant.cResultMode ?? '') +
        ':' +
        cResultMappingFingerprint(variant.cResultMapping) +
        ':' +
        (variant.cReceiverAdapter ?? '') +
        ':' +
        (variant.cResultAdapter ?? '') +
        ':' +
        typeRefFingerprintOrEmpty(variant.resultTypeRef) +
        ':' +
        resultInferenceFingerprint(variant.resultInference)
    )
  }

  return rows.join(';')
}

function sequenceMaterializationFingerprint(operation: LibraryOperationDescriptor): string {
  const materialization = operation.cSequenceMaterialization

  if (materialization === null || typeof materialization === 'undefined') {
    return ''
  }

  return (
    materialization.createExpression +
    ':' +
    materialization.appendElementExpression +
    ':' +
    materialization.appendSpreadExpression +
    ':' +
    (materialization.appendSpreadValueAdapter ?? '') +
    ':' +
    (materialization.appendSpreadValueTypeId ?? '') +
    ':' +
    materialization.failureMode
  )
}

function operationArgumentNarrowingFingerprint(narrowing: LibraryOperationDescriptor['argumentNarrowing']): string {
  if (narrowing === null || typeof narrowing === 'undefined') {
    return ''
  }

  return (
    `${narrowing.argumentIndex}:` +
    `${typeRefFingerprintOrEmpty(narrowing.trueTypeRef)}:` +
    `${typeRefFingerprintOrEmpty(narrowing.falseTypeRef)}:` +
    `${fingerprintAtom(narrowing.trueValueType ?? '')}:` +
    `${fingerprintAtom(narrowing.falseValueType ?? '')}:` +
    `${narrowing.trueNonNullable === true ? 'true-required' : 'true-nullable'}:` +
    (narrowing.falseNonNullable === true ? 'false-required' : 'false-nullable')
  )
}

function typeRefFingerprintOrEmpty(typeRef: TypeRef | null | undefined): string {
  if (typeRef === null || typeof typeRef === 'undefined') {
    return ''
  }

  return typeRefFingerprint(typeRef)
}

function resultInferenceFingerprint(inference: LibraryOperationDescriptor['resultInference']): string {
  if (inference === null || typeof inference === 'undefined') {
    return ''
  }

  return (
    fingerprintAtom(inference.fingerprint) +
    ':' +
    fingerprintAtom(inference.literalProviderId) +
    ':' +
    inference.argumentIndex +
    ':' +
    sortedStrings(inference.contextualValueTypes).join(',') +
    ':' +
    (inference.dynamicObjectShapes ? 'dynamic' : 'fixed')
  )
}

function typeRefFingerprint(typeRef: TypeRef): string {
  if (typeRef.kind === 'parameter') {
    return 'parameter(' + fingerprintAtom(typeRef.name) + ')' + (typeRef.nullable === true ? ':nullable' : '')
  }

  const common =
    ':' +
    (typeRef.nullable ? 'nullable' : 'required') +
    ':' +
    fingerprintAtom(typeRef.ownership) +
    ':traits[' +
    typeTraitRefsFingerprint(typeRef.traits) +
    ']'

  if (typeRef.kind === 'primitive') {
    return 'primitive(' + fingerprintAtom(typeRef.name) + ')' + common
  }

  if (typeRef.kind === 'nominal') {
    return 'nominal(' + fingerprintAtom(typeRef.typeId) + ')[' + typeRefListFingerprint(typeRef.args) + ']' + common
  }

  if (typeRef.kind === 'function') {
    return 'function(' + typeRefListFingerprint(typeRef.params) + ')->' + typeRefFingerprint(typeRef.result) + common
  }

  if (typeRef.kind === 'object') {
    const fields: string[] = []

    for (let index = 0; index < typeRef.fields.length; index = index + 1) {
      const field = typeRef.fields[index]
      fields.push(
        fingerprintAtom(field.name) +
          ':' +
          (field.readonly ? 'readonly' : 'mutable') +
          (field.optional === true ? ':optional' : '') +
          ':' +
          typeRefFingerprint(field.typeRef)
      )
    }

    fields.sort()
    let dynamic = typeRef.dynamic === true ? ':dynamic' : ''

    if (typeRef.dynamicField !== null && typeof typeRef.dynamicField !== 'undefined') {
      dynamic = dynamic + ':dynamic-field=' + typeRefFingerprint(typeRef.dynamicField)
    }

    return 'object{' + fields.join(',') + '}' + dynamic + common
  }

  return 'unknown' + common
}

function typeTraitRefsFingerprint(typeTraits: TypeTraitRef[]): string {
  const traits: string[] = []

  for (let index = 0; index < typeTraits.length; index = index + 1) {
    const trait = typeTraits[index]
    traits.push(fingerprintAtom(trait.traitId) + '[' + typeRefListFingerprint(trait.args) + ']')
  }

  traits.sort()
  return traits.join(',')
}

function typeRefListFingerprint(typeRefs: TypeRef[]): string {
  const refs: string[] = []

  for (let index = 0; index < typeRefs.length; index = index + 1) {
    refs.push(typeRefFingerprint(typeRefs[index]))
  }

  return refs.join(',')
}

function fingerprintAtom(value: string): string {
  return `${value.length}:${value}`
}

function objectLiteralFieldsFingerprint(fields: LibraryObjectLiteralFieldDescriptor[]): string {
  const rows: string[] = []

  for (let index = 0; index < fields.length; index = index + 1) {
    const field = fields[index]
    rows.push(
      field.name +
        ':' +
        sortedStrings(field.valueTypes).join(',') +
        ':' +
        sortedBooleans(field.booleanLiterals ?? []).join(',') +
        ':' +
        sortedStrings(field.stringLiterals ?? []).join(',') +
        ':' +
        (field.objectLiteralRequired === true ? 'literal' : '') +
        ':' +
        (field.objectFieldValueType ?? '') +
        ':' +
        sortedStrings(field.objectTypeIds ?? []).join(',') +
        ':' +
        (field.optional === true ? 'optional' : 'required')
    )
  }

  rows.sort()
  return rows.join(';')
}

function stringPrefixOptionConstraintsFingerprint(
  constraints: LibraryStringPrefixOptionConstraintDescriptor[]
): string {
  const rows: string[] = []

  for (let index = 0; index < constraints.length; index = index + 1) {
    const constraint = constraints[index]
    rows.push(
      sortedStrings(constraint.prefixes).join(',') +
        ':' +
        constraint.optionId +
        ':' +
        sortedOptionScalars(constraint.allowedValues).join(',') +
        ':' +
        constraint.diagnosticCode +
        ':' +
        constraint.diagnosticMessage
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

function runtimeOptionConstraintsFingerprint(requirement: RuntimeRequirementDescriptor): string {
  const constraints = requirement.optionConstraints ?? []
  const rows: string[] = []

  for (let index = 0; index < constraints.length; index = index + 1) {
    const constraint = constraints[index]
    rows.push(
      constraint.optionId +
        ':' +
        sortedOptionScalars(constraint.allowedValues).join(',') +
        ':' +
        constraint.diagnosticCode +
        ':' +
        constraint.diagnosticMessage
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
        condition.optionId + ':' + condition.source + ':' + sortedOptionScalars(condition.values).join(',')
      )
    }

    rows.push(item.capability + ':' + conditions.join('&'))
  }

  rows.sort()
  return rows.join(';')
}

function cResultMappingFingerprint(mapping: LibraryCResultMappingDescriptor | null | undefined): string {
  if (mapping === null || typeof mapping === 'undefined') {
    return ''
  }

  return mapping.cppType + ':fields=' + cResultFieldMappingsFingerprint(mapping.fields)
}

function cResultFieldMappingsFingerprint(fields: LibraryCResultFieldMappingDescriptor[]): string {
  const rows: string[] = []

  for (let index = 0; index < fields.length; index = index + 1) {
    const field = fields[index]
    const nestedFields = field.fields
    rows.push(
      `${field.name}=${field.cMember}:${field.cppType ?? ''}:` +
        (nestedFields === null || typeof nestedFields === 'undefined'
          ? ''
          : `{${cResultFieldMappingsFingerprint(nestedFields)}}`)
    )
  }

  return rows.join(',')
}

function resultShapeFieldsFingerprint(fields: LibraryResultShapeFieldDescriptor[]): string {
  const rows: string[] = []

  for (let index = 0; index < fields.length; index = index + 1) {
    const field = fields[index]
    const nestedFields = field.resultShapeFields
    rows.push(
      `${field.name}=${field.valueType}:${field.readonly ? 'readonly' : 'mutable'}:` +
        `${field.nullable ? 'nullable' : 'required'}:` +
        `${field.cMember ?? ''}:${field.cGetter ?? ''}:${field.resultTypeId ?? ''}:${field.cppType ?? ''}:` +
        (nestedFields === null || typeof nestedFields === 'undefined'
          ? ''
          : `{${nestedResultShapeFieldsFingerprint(nestedFields)}}`)
    )
  }

  return rows.join(',')
}

function nestedResultShapeFieldsFingerprint(fields: LibraryNestedResultShapeFieldDescriptor[]): string {
  const rows: string[] = []

  for (let index = 0; index < fields.length; index = index + 1) {
    const field = fields[index]
    rows.push(
      `${field.name}=${field.valueType}:${field.readonly ? 'readonly' : 'mutable'}:` +
        `${field.nullable ? 'nullable' : 'required'}:` +
        `${field.cMember ?? ''}:${field.cGetter ?? ''}:${field.resultTypeId ?? ''}:${field.cppType ?? ''}`
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

function requireLibrary(libraries: Map<string, CompilerLibraryDescriptor>, id: string): CompilerLibraryDescriptor {
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

function pushRuntimeRequirements(target: RuntimeRequirementDescriptor[], values: RuntimeRequirementDescriptor[]): void {
  for (let index = 0; index < values.length; index = index + 1) {
    target.push(values[index])
  }
}
