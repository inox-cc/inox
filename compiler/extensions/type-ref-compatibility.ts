import { compilerLibraryIntrinsicRoleForTypeId, compilerLibraryNativeTypeForId } from './library-set.ts'
import { instantiateNativeTypeTraits } from './type-ref-substitution.ts'
import type {
  CompilerLibrarySet,
  ConcreteTypeRef,
  IntrinsicRole,
  LibraryCResultFieldMappingDescriptor,
  LibraryCResultMappingDescriptor,
  LibraryResultShapeFieldDescriptor,
  ObjectTypeRef,
  ObjectTypeRefField,
  TypeRef,
  TypeTraitId,
  TypeTraitRef,
  UnknownTypeRef
} from './types.ts'
import type { AnyNode, ObjectShapeInfo, SourceLocation, ValueType } from '../types.ts'

export type TypeRefCompatibilityMetadata = {
  intrinsicRole: IntrinsicRole | null
  valueType: ValueType
  nullable: boolean
  owned: boolean
  libraryCppType: string | null
  libraryCAwaitExpression: string | null
  libraryResultTypeId: string | null
  shape: ObjectShapeInfo | null
  asyncResultValueType: ValueType | null
  asyncResultRejectionValueType: ValueType | null
  asyncResultRejectionIntrinsicRole: IntrinsicRole | null
}

export function typeRefCompatibilityMetadata(
  typeRef: TypeRef,
  libraries: CompilerLibrarySet,
  loc: SourceLocation,
  cResultMapping: LibraryCResultMappingDescriptor | null = null
): TypeRefCompatibilityMetadata {
  if (typeRef.kind === 'parameter') {
    throw new Error(`unresolved TypeRef parameter ${typeRef.name}`)
  }

  const metadata = baseTypeRefCompatibilityMetadata(typeRef, libraries, loc)

  applyTypeTraits(metadata, typeRefTraits(typeRef, libraries), libraries, loc)
  applyCResultMapping(metadata, cResultMapping)
  return metadata
}

export function typeRefTraits(typeRef: ConcreteTypeRef, libraries: CompilerLibrarySet): TypeTraitRef[] {
  if (typeRef.kind !== 'nominal') {
    return typeRef.traits
  }

  const nativeType = compilerLibraryNativeTypeForId(libraries, typeRef.typeId)

  if (nativeType === null) {
    return typeRef.traits
  }

  const traitTemplates = nativeType.traits ?? []

  if (traitTemplates.length === 0) {
    return typeRef.traits
  }

  const result: TypeTraitRef[] = []
  const explicitTraitIds: Set<string> = new Set<string>()

  for (let index = 0; index < typeRef.traits.length; index = index + 1) {
    result.push(typeRef.traits[index])
    explicitTraitIds.add(typeRef.traits[index].traitId)
  }

  const nativeTraits = instantiateNativeTypeTraits(nativeType, typeRef.args)

  for (let index = 0; index < nativeTraits.length; index = index + 1) {
    if (!explicitTraitIds.has(nativeTraits[index].traitId)) {
      result.push(nativeTraits[index])
    }
  }

  return result
}

export function typeRefTraitArgument(
  typeRef: TypeRef | null | undefined,
  traitId: TypeTraitId,
  argumentIndex: number,
  libraries: CompilerLibrarySet
): TypeRef | null {
  if (typeRef === null || typeof typeRef === 'undefined' || typeRef.kind === 'parameter') {
    return null
  }

  const traits = typeRefTraits(typeRef, libraries)

  for (let index = 0; index < traits.length; index = index + 1) {
    const trait = traits[index]

    if (trait.traitId === traitId && argumentIndex >= 0 && argumentIndex < trait.args.length) {
      return trait.args[argumentIndex]
    }
  }

  return null
}

export function typeRefDeclaredName(
  typeRef: TypeRef | null | undefined,
  libraries: CompilerLibrarySet
): string | null {
  if (typeRef === null || typeof typeRef === 'undefined' || typeRef.kind === 'parameter') {
    return null
  }

  if (typeRef.kind === 'primitive') {
    return typeRef.name
  }

  if (typeRef.kind === 'nominal') {
    const nativeType = compilerLibraryNativeTypeForId(libraries, typeRef.typeId)

    if (nativeType === null || nativeType.declarationNames.length === 0) {
      return null
    }

    const name = nativeType.declarationNames[0]

    if (typeRef.args.length === 0) {
      return name
    }

    const argumentNames: string[] = []

    for (let index = 0; index < typeRef.args.length; index = index + 1) {
      argumentNames.push(typeRefDeclaredName(typeRef.args[index], libraries) ?? 'unknown')
    }

    return `${name}<${argumentNames.join(', ')}>`
  }

  if (typeRef.kind === 'function') {
    return 'function'
  }

  if (typeRef.kind === 'object') {
    return typeRef.declaredName ?? 'object'
  }

  return 'unknown'
}

export function typeRefIterableElementDeclaredName(
  typeRef: TypeRef | null | undefined,
  libraries: CompilerLibrarySet
): string | null {
  let current = typeRef

  for (let depth = 0; depth < 32; depth = depth + 1) {
    const element = typeRefTraitArgument(current, 'iterable', 0, libraries)

    if (element !== null) {
      return typeRefDeclaredName(element, libraries)
    }

    const fulfilled = typeRefTraitArgument(current, 'awaitable', 0, libraries)

    if (fulfilled === null) {
      return null
    }

    current = fulfilled
  }

  return null
}

export function typeRefIterableElementValueType(
  typeRef: TypeRef | null | undefined,
  libraries: CompilerLibrarySet
): ValueType | null {
  let current = typeRef

  for (let depth = 0; depth < 32; depth = depth + 1) {
    const element = typeRefTraitArgument(current, 'iterable', 0, libraries)

    if (element !== null) {
      return typeRefValueType(element, libraries)
    }

    const fulfilled = typeRefTraitArgument(current, 'awaitable', 0, libraries)

    if (fulfilled === null) {
      return null
    }

    current = fulfilled
  }

  return null
}

export function typeRefValueType(typeRef: TypeRef, libraries: CompilerLibrarySet): ValueType {
  const valueType = typeRefValueTypeOrNull(typeRef, libraries)

  if (valueType === null) {
    const typeId = typeRef.kind === 'nominal' ? typeRef.typeId : 'unknown'

    throw new Error(`Missing compiler library native type ${typeId}`)
  }

  return valueType
}

export function typeRefValueTypeOrNull(typeRef: TypeRef, libraries: CompilerLibrarySet): ValueType | null {
  if (typeRef.kind === 'parameter' || typeRef.kind === 'unknown') {
    return 'unknown'
  }

  if (typeRef.kind === 'primitive') {
    return typeRef.name
  }

  if (typeRef.kind === 'function') {
    return 'function'
  }

  if (typeRef.kind === 'object') {
    return 'object'
  }

  const nativeType = compilerLibraryNativeTypeForId(libraries, typeRef.typeId)

  if (nativeType === null) {
    return null
  }

  return nativeType.valueType as ValueType
}

/** Returns the most specific TypeRef shared by two expression paths. */
export function commonTypeRef(left: TypeRef | null, right: TypeRef | null): TypeRef | null {
  if (left === null) {
    return right
  }

  if (right === null) {
    return left
  }

  if (typeRefsEquivalent(left, right)) {
    return left
  }

  if (left.kind === 'unknown' && right.kind !== 'parameter') {
    return commonUnknownTypeRef(left, right)
  }

  if (right.kind === 'unknown' && left.kind !== 'parameter') {
    return commonUnknownTypeRef(right, left)
  }

  if (left.kind === 'nominal' && right.kind === 'nominal' && left.typeId === right.typeId) {
    if (left.args.length !== right.args.length) {
      return null
    }

    const args: TypeRef[] = []

    for (let index = 0; index < left.args.length; index = index + 1) {
      args.push(commonTypeArgument(left.args[index], right.args[index]))
    }

    return {
      ...left,
      args,
      nullable: left.nullable || right.nullable,
      ownership: commonTypeOwnership(left.ownership, right.ownership)
    }
  }

  if (
    left.kind === 'object' &&
    right.kind === 'object' &&
    typeof left.declaredName === 'string' &&
    left.declaredName === right.declaredName
  ) {
    return commonNamedObjectTypeRef(left, right)
  }

  return null
}

function commonNamedObjectTypeRef(left: ObjectTypeRef, right: ObjectTypeRef): ObjectTypeRef {
  if (objectTypeRefFieldNamesEqual(left.fields, right.fields)) {
    return {
      ...left,
      nullable: left.nullable || right.nullable,
      ownership: commonTypeOwnership(left.ownership, right.ownership)
    }
  }

  const fields: ObjectTypeRefField[] = []

  for (const field of left.fields) {
    fields.push(field)
  }

  for (const field of right.fields) {
    let existingIndex = -1

    for (let index = 0; index < fields.length; index = index + 1) {
      if (fields[index].name === field.name) {
        existingIndex = index
        break
      }
    }

    if (existingIndex === -1) {
      fields.push(field)
      continue
    }

    const existing = fields[existingIndex]
    fields[existingIndex] = {
      name: existing.name,
      typeRef: commonNamedObjectFieldTypeRef(existing.typeRef, field.typeRef),
      readonly: existing.readonly && field.readonly,
      optional: existing.optional === true || field.optional === true
    }
  }

  const result: ObjectTypeRef = {
    kind: 'object',
    declaredName: left.declaredName,
    fields,
    nullable: left.nullable || right.nullable,
    ownership: commonTypeOwnership(left.ownership, right.ownership),
    traits: left.traits
  }

  if (left.dynamic === true || right.dynamic === true) {
    result.dynamic = true
  }

  if (left.dynamicField !== null && typeof left.dynamicField !== 'undefined') {
    result.dynamicField = left.dynamicField
  } else if (right.dynamicField !== null && typeof right.dynamicField !== 'undefined') {
    result.dynamicField = right.dynamicField
  }

  return result
}

function objectTypeRefFieldNamesEqual(left: ObjectTypeRefField[], right: ObjectTypeRefField[]): boolean {
  if (left.length !== right.length) {
    return false
  }

  for (let index = 0; index < left.length; index = index + 1) {
    if (left[index].name !== right[index].name) {
      return false
    }
  }

  return true
}

function commonNamedObjectFieldTypeRef(left: TypeRef, right: TypeRef): TypeRef {
  if (typeRefsEquivalent(left, right)) {
    return left
  }

  if (left.kind === 'unknown' && right.kind !== 'parameter') {
    return commonUnknownTypeRef(left, right)
  }

  if (right.kind === 'unknown' && left.kind !== 'parameter') {
    return commonUnknownTypeRef(right, left)
  }

  if (left.kind === 'object' && right.kind === 'object') {
    return left.fields.length >= right.fields.length ? left : right
  }

  return left
}

function commonUnknownTypeRef(unknown: UnknownTypeRef, observed: ConcreteTypeRef): ConcreteTypeRef {
  return {
    ...observed,
    nullable: unknown.nullable || observed.nullable,
    ownership: commonTypeOwnership(unknown.ownership, observed.ownership)
  }
}

function commonTypeArgument(left: TypeRef, right: TypeRef): TypeRef {
  const common = commonTypeRef(left, right)

  if (common !== null) {
    return common
  }

  return {
    kind: 'unknown',
    nullable: left.nullable === true || right.nullable === true,
    ownership: 'value',
    traits: []
  }
}

function commonTypeOwnership(left: ConcreteTypeRef['ownership'], right: ConcreteTypeRef['ownership']): ConcreteTypeRef['ownership'] {
  return left === right ? left : 'value'
}

export function typeRefsEquivalent(left: TypeRef, right: TypeRef): boolean {
  if (left === right) {
    return true
  }

  if (left.kind !== right.kind) {
    return false
  }

  if (left.kind === 'parameter' && right.kind === 'parameter') {
    return left.name === right.name && (left.nullable === true) === (right.nullable === true)
  }

  if (left.kind === 'primitive' && right.kind === 'primitive') {
    return left.name === right.name && concreteTypeRefQualifiersEqual(left, right)
  }

  if (left.kind === 'nominal' && right.kind === 'nominal') {
    return (
      left.typeId === right.typeId &&
      concreteTypeRefQualifiersEqual(left, right) &&
      typeRefListsEquivalent(left.args, right.args)
    )
  }

  if (left.kind === 'function' && right.kind === 'function') {
    return (
      concreteTypeRefQualifiersEqual(left, right) &&
      typeRefListsEquivalent(left.params, right.params) &&
      typeRefsEquivalent(left.result, right.result)
    )
  }

  if (left.kind === 'object' && right.kind === 'object') {
    return false
  }

  return left.kind === 'unknown' && right.kind === 'unknown' && concreteTypeRefQualifiersEqual(left, right)
}

function concreteTypeRefQualifiersEqual(left: ConcreteTypeRef, right: ConcreteTypeRef): boolean {
  return left.nullable === right.nullable && left.ownership === right.ownership
}

function typeRefListsEquivalent(left: TypeRef[], right: TypeRef[]): boolean {
  if (left.length !== right.length) {
    return false
  }

  for (let index = 0; index < left.length; index = index + 1) {
    if (!typeRefsEquivalent(left[index], right[index])) {
      return false
    }
  }

  return true
}

/** Preserves a contextual TypeRef while filling only its unknown leaves from an observed value. */
export function refineTypeRefUnknowns(contextual: TypeRef, observed: TypeRef): TypeRef {
  if (contextual.kind === 'unknown' && observed.kind !== 'parameter') {
    return qualifyObservedTypeRef(observed, contextual)
  }

  if (contextual.kind !== observed.kind || contextual.kind === 'parameter' || contextual.kind === 'primitive') {
    return contextual
  }

  if (contextual.kind === 'nominal' && observed.kind === 'nominal') {
    if (contextual.typeId !== observed.typeId || contextual.args.length !== observed.args.length) {
      return contextual
    }

    return {
      ...contextual,
      args: refineTypeRefList(contextual.args, observed.args),
      traits: refineTypeRefTraits(contextual.traits, observed.traits)
    }
  }

  if (contextual.kind === 'function' && observed.kind === 'function') {
    if (contextual.params.length !== observed.params.length) {
      return contextual
    }

    return {
      ...contextual,
      params: refineTypeRefList(contextual.params, observed.params),
      result: refineTypeRefUnknowns(contextual.result, observed.result),
      traits: refineTypeRefTraits(contextual.traits, observed.traits)
    }
  }

  if (contextual.kind === 'object' && observed.kind === 'object') {
    const fields = []

    for (let index = 0; index < contextual.fields.length; index = index + 1) {
      const contextualField = contextual.fields[index]
      const observedField = observed.fields.find((field) => field.name === contextualField.name)

      fields.push(
        observedField === null || typeof observedField === 'undefined'
          ? contextualField
          : {
              ...contextualField,
              typeRef: refineTypeRefUnknowns(contextualField.typeRef, observedField.typeRef)
            }
      )
    }

    return {
      ...contextual,
      fields,
      dynamicField:
        contextual.dynamicField !== null &&
        typeof contextual.dynamicField !== 'undefined' &&
        observed.dynamicField !== null &&
        typeof observed.dynamicField !== 'undefined'
          ? refineTypeRefUnknowns(contextual.dynamicField, observed.dynamicField)
          : contextual.dynamicField,
      traits: refineTypeRefTraits(contextual.traits, observed.traits)
    }
  }

  return contextual
}

function qualifyObservedTypeRef(observed: ConcreteTypeRef, contextual: ConcreteTypeRef): TypeRef {
  return {
    ...observed,
    nullable: contextual.nullable,
    ownership: contextual.ownership
  }
}

function refineTypeRefList(contextual: TypeRef[], observed: TypeRef[]): TypeRef[] {
  const result: TypeRef[] = []

  for (let index = 0; index < contextual.length; index = index + 1) {
    result.push(refineTypeRefUnknowns(contextual[index], observed[index]))
  }

  return result
}

function refineTypeRefTraits(contextual: TypeTraitRef[], observed: TypeTraitRef[]): TypeTraitRef[] {
  const result: TypeTraitRef[] = []

  for (let index = 0; index < contextual.length; index = index + 1) {
    const contextualTrait = contextual[index]
    const observedTrait = observed.find(
      (trait) => trait.traitId === contextualTrait.traitId && trait.args.length === contextualTrait.args.length
    )

    result.push({
      traitId: contextualTrait.traitId,
      args:
        observedTrait === null || typeof observedTrait === 'undefined'
          ? contextualTrait.args
          : refineTypeRefList(contextualTrait.args, observedTrait.args)
    })
  }

  return result
}

function baseTypeRefCompatibilityMetadata(
  typeRef: ConcreteTypeRef,
  libraries: CompilerLibrarySet,
  loc: SourceLocation
): TypeRefCompatibilityMetadata {
  if (typeRef.kind === 'primitive') {
    return emptyCompatibilityMetadata(typeRef.name, typeRef.nullable, typeRef.ownership === 'owned')
  }

  if (typeRef.kind === 'nominal') {
    const nativeType = compilerLibraryNativeTypeForId(libraries, typeRef.typeId)

    if (nativeType === null) {
      throw new Error(`Missing compiler library native type ${typeRef.typeId}`)
    }

    const metadata = emptyCompatibilityMetadata(
      nativeType.valueType as ValueType,
      typeRef.nullable,
      typeRef.ownership === 'owned'
    )
    const fields: AnyNode[] = []

    for (let index = 0; index < (nativeType.fields ?? []).length; index = index + 1) {
      fields.push(legacyResultShapeField((nativeType.fields ?? [])[index], loc))
    }

    metadata.libraryCppType = nativeType.cppType
    metadata.libraryCAwaitExpression = nativeType.cAwaitExpression ?? null
    metadata.libraryResultTypeId = nativeType.typeId
    metadata.intrinsicRole = compilerLibraryIntrinsicRoleForTypeId(libraries, nativeType.typeId)
    metadata.shape = {
      kind: 'object',
      baseTypes: nativeType.baseTypeIds,
      fields,
      libraryCValueAdapter: nativeType.cValueAdapter ?? null,
      libraryTypeId: nativeType.typeId,
      libraryCppType: nativeType.cppType
    }
    return metadata
  }

  if (typeRef.kind === 'function') {
    return emptyCompatibilityMetadata('function', typeRef.nullable, typeRef.ownership === 'owned')
  }

  if (typeRef.kind === 'object') {
    const metadata = emptyCompatibilityMetadata('object', typeRef.nullable, typeRef.ownership === 'owned')
    const fields: AnyNode[] = []

    for (let index = 0; index < typeRef.fields.length; index = index + 1) {
      const field = typeRef.fields[index]
      const fieldMetadata = typeRefCompatibilityMetadata(field.typeRef, libraries, loc)
      fields.push({
        name: field.name,
        optional: field.optional === true,
        declaredType: typeRefDeclaredName(field.typeRef, libraries),
        valueType: fieldMetadata.valueType,
        readonly: field.readonly,
        nullable: fieldMetadata.nullable,
        typeRef: field.typeRef,
        asyncResultValueType: fieldMetadata.asyncResultValueType,
        asyncResultRejectionValueType: fieldMetadata.asyncResultRejectionValueType,
        asyncResultRejectionIntrinsicRole: fieldMetadata.asyncResultRejectionIntrinsicRole,
        shape: fieldMetadata.shape,
        libraryCMember: null,
        libraryCppType: fieldMetadata.libraryCppType,
        loc
      })
    }

    metadata.shape = {
      kind: 'object',
      dynamic: typeRef.dynamic === true,
      fields,
      libraryCppType: null
    }
    if (typeRef.declaredName === 'AnyNode') {
      metadata.shape.builtin = 'compiler.AnyNode'
    }
    if (typeRef.dynamicField !== null && typeof typeRef.dynamicField !== 'undefined') {
      const dynamicMetadata = typeRefCompatibilityMetadata(typeRef.dynamicField, libraries, loc)
      metadata.shape.dynamicField = {
        name: '',
        optional: true,
        readonly: false,
        valueType: dynamicMetadata.valueType,
        nullable: dynamicMetadata.nullable,
        typeRef: typeRef.dynamicField,
        asyncResultValueType: dynamicMetadata.asyncResultValueType,
        shape: dynamicMetadata.shape,
        loc
      }
    }

    return metadata
  }

  return emptyCompatibilityMetadata('unknown', typeRef.nullable, typeRef.ownership === 'owned')
}

function emptyCompatibilityMetadata(
  valueType: ValueType,
  nullable: boolean,
  owned: boolean
): TypeRefCompatibilityMetadata {
  return {
    intrinsicRole: null,
    valueType,
    nullable,
    owned,
    libraryCppType: null,
    libraryCAwaitExpression: null,
    libraryResultTypeId: null,
    shape: null,
    asyncResultValueType: null,
    asyncResultRejectionValueType: null,
    asyncResultRejectionIntrinsicRole: null
  }
}

function applyCResultMapping(
  metadata: TypeRefCompatibilityMetadata,
  mapping: LibraryCResultMappingDescriptor | null
): void {
  if (mapping === null) {
    return
  }

  metadata.libraryCppType = mapping.cppType
  const shape = metadata.shape

  if (shape === null) {
    if (mapping.fields.length > 0) {
      throw new Error('C++ result field mappings require object compatibility metadata')
    }

    return
  }

  shape.libraryCppType = mapping.cppType
  applyCResultFieldMappings(shape.fields, mapping.fields)
}

function applyCResultFieldMappings(shapeFields: AnyNode[], mappings: LibraryCResultFieldMappingDescriptor[]): void {
  for (let index = 0; index < mappings.length; index = index + 1) {
    const mapping = mappings[index]
    let shapeField: AnyNode | null = null

    for (let fieldIndex = 0; fieldIndex < shapeFields.length; fieldIndex = fieldIndex + 1) {
      if (shapeFields[fieldIndex].name === mapping.name) {
        shapeField = shapeFields[fieldIndex]
        break
      }
    }

    if (shapeField === null) {
      throw new Error(`Missing compatibility field for C++ result mapping ${mapping.name}`)
    }

    shapeField.libraryCMember = mapping.cMember
    const cppType = mapping.cppType

    if (typeof cppType === 'string') {
      shapeField.libraryCppType = cppType

      if (shapeField.shape !== null && typeof shapeField.shape !== 'undefined') {
        shapeField.shape.libraryCppType = cppType
      }
    }

    const nestedMappings = mapping.fields

    if (nestedMappings === null || typeof nestedMappings === 'undefined') {
      continue
    }

    const nestedFields = shapeField.shape?.fields

    if (nestedFields === null || typeof nestedFields === 'undefined') {
      throw new Error(`Missing nested compatibility fields for C++ result mapping ${mapping.name}`)
    }

    applyCResultFieldMappings(nestedFields, nestedMappings)
  }
}

function applyTypeTraits(
  metadata: TypeRefCompatibilityMetadata,
  traits: TypeTraitRef[],
  libraries: CompilerLibrarySet,
  loc: SourceLocation
): void {
  for (let index = 0; index < traits.length; index = index + 1) {
    const trait = traits[index]

    if (trait.traitId === 'awaitable' && trait.args.length > 0) {
      const fulfilled = typeRefCompatibilityMetadata(trait.args[0], libraries, loc)

      metadata.asyncResultValueType = fulfilled.valueType
      metadata.libraryResultTypeId = fulfilled.libraryResultTypeId
      metadata.shape = fulfilled.shape
      if (trait.args.length > 1) {
        const rejected = typeRefCompatibilityMetadata(trait.args[1], libraries, loc)

        metadata.asyncResultRejectionValueType = rejected.valueType
        metadata.asyncResultRejectionIntrinsicRole = rejected.intrinsicRole
      }
    }
  }
}

function legacyResultShapeField(field: LibraryResultShapeFieldDescriptor, loc: SourceLocation): AnyNode {
  const result: AnyNode = {
    name: field.name,
    valueType: field.valueType,
    readonly: field.readonly,
    nullable: field.nullable ?? false,
    libraryCMember: field.cMember ?? null,
    libraryCppType: field.cppType ?? null,
    loc
  }
  const nestedFields = field.resultShapeFields
  const nestedTypeId = field.resultTypeId

  if (
    (nestedFields !== null && typeof nestedFields !== 'undefined') ||
    (nestedTypeId !== null && typeof nestedTypeId !== 'undefined')
  ) {
    const fields: AnyNode[] = []

    for (let index = 0; index < (nestedFields ?? []).length; index = index + 1) {
      fields.push(legacyResultShapeField((nestedFields ?? [])[index], loc))
    }

    result.shape = {
      kind: 'object',
      fields,
      libraryTypeId: nestedTypeId ?? null,
      libraryCppType: field.cppType ?? null
    }
  }

  return result
}
