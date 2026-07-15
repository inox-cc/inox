import {
  compilerLibraryIntrinsicRoleForTypeId,
  compilerLibraryNativeTypeForId
} from './library-set.ts'
import type {
  CompilerLibrarySet,
  IntrinsicRole,
  LibraryCResultFieldMappingDescriptor,
  LibraryCResultMappingDescriptor,
  LibraryResultShapeFieldDescriptor,
  TypeRef,
  TypeTraitRef
} from './types.ts'
import type { AnyNode, ObjectShapeInfo, SourceLocation, ValueType } from '../types.ts'

export type TypeRefCompatibilityMetadata = {
  intrinsicRole: IntrinsicRole | null
  valueType: ValueType
  nullable: boolean
  owned: boolean
  libraryCppType: string | null
  libraryResultTypeId: string | null
  shape: ObjectShapeInfo | null
  arrayElementType: ValueType | null
  arrayElementTypeId: string | null
  arrayElementDeclaredType: string | null
  mapKeyType: ValueType | null
  mapValueType: ValueType | null
  promiseValueType: ValueType | null
  promiseRejectionValueType: ValueType | null
  promiseRejectionIntrinsicRole: IntrinsicRole | null
  setElementType: ValueType | null
}

export function typeRefCompatibilityMetadata(
  typeRef: TypeRef,
  libraries: CompilerLibrarySet,
  loc: SourceLocation,
  cResultMapping: LibraryCResultMappingDescriptor | null = null
): TypeRefCompatibilityMetadata {
  const metadata = baseTypeRefCompatibilityMetadata(typeRef, libraries, loc)

  applyTypeTraits(metadata, typeRef.traits, libraries, loc)
  applyCResultMapping(metadata, cResultMapping)
  return metadata
}

function baseTypeRefCompatibilityMetadata(
  typeRef: TypeRef,
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
    metadata.libraryResultTypeId = nativeType.typeId
    metadata.intrinsicRole = compilerLibraryIntrinsicRoleForTypeId(libraries, nativeType.typeId)
    metadata.shape = {
      kind: 'object',
      baseTypes: nativeType.baseTypeIds,
      fields,
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
        valueType: fieldMetadata.valueType,
        readonly: field.readonly,
        nullable: fieldMetadata.nullable,
        arrayElementType: fieldMetadata.arrayElementType,
        arrayElementDeclaredType: fieldMetadata.arrayElementDeclaredType,
        mapKeyType: fieldMetadata.mapKeyType,
        mapValueType: fieldMetadata.mapValueType,
        promiseValueType: fieldMetadata.promiseValueType,
        promiseRejectionValueType: fieldMetadata.promiseRejectionValueType,
        promiseRejectionIntrinsicRole: fieldMetadata.promiseRejectionIntrinsicRole,
        setElementType: fieldMetadata.setElementType,
        shape: fieldMetadata.shape,
        libraryCMember: null,
        libraryCppType: fieldMetadata.libraryCppType,
        loc
      })
    }

    metadata.shape = { kind: 'object', fields, libraryCppType: null }
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
    libraryResultTypeId: null,
    shape: null,
    arrayElementType: null,
    arrayElementTypeId: null,
    arrayElementDeclaredType: null,
    mapKeyType: null,
    mapValueType: null,
    promiseValueType: null,
    promiseRejectionValueType: null,
    promiseRejectionIntrinsicRole: null,
    setElementType: null
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

    if (trait.traitId === 'iterable' && trait.args.length > 0) {
      const element = typeRefCompatibilityMetadata(trait.args[0], libraries, loc)

      if (metadata.valueType === 'set') {
        metadata.setElementType = element.valueType
      } else {
        metadata.arrayElementType = element.valueType
        metadata.arrayElementTypeId = element.libraryResultTypeId
        metadata.arrayElementDeclaredType = nativeDeclarationName(element.libraryResultTypeId, libraries)
      }
    }

    if (trait.traitId === 'indexable' && trait.args.length > 1) {
      metadata.mapKeyType = typeRefCompatibilityMetadata(trait.args[0], libraries, loc).valueType
      metadata.mapValueType = typeRefCompatibilityMetadata(trait.args[1], libraries, loc).valueType
    }

    if (trait.traitId === 'awaitable' && trait.args.length > 0) {
      const fulfilled = typeRefCompatibilityMetadata(trait.args[0], libraries, loc)

      metadata.promiseValueType = fulfilled.valueType
      metadata.libraryResultTypeId = fulfilled.libraryResultTypeId
      metadata.shape = fulfilled.shape
      metadata.arrayElementType = fulfilled.arrayElementType
      metadata.arrayElementTypeId = fulfilled.arrayElementTypeId
      metadata.arrayElementDeclaredType = fulfilled.arrayElementDeclaredType
      metadata.mapKeyType = fulfilled.mapKeyType
      metadata.mapValueType = fulfilled.mapValueType
      metadata.setElementType = fulfilled.setElementType

      if (trait.args.length > 1) {
        const rejected = typeRefCompatibilityMetadata(trait.args[1], libraries, loc)

        metadata.promiseRejectionValueType = rejected.valueType
        metadata.promiseRejectionIntrinsicRole = rejected.intrinsicRole
      }
    }
  }
}

function nativeDeclarationName(typeId: string | null, libraries: CompilerLibrarySet): string | null {
  if (typeId === null) {
    return null
  }

  const nativeType = compilerLibraryNativeTypeForId(libraries, typeId)

  if (nativeType === null || nativeType.declarationNames.length === 0) {
    return null
  }

  return nativeType.declarationNames[0]
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
