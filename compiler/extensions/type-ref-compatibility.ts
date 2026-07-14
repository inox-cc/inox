import { compilerLibraryNativeTypeForId } from './library-set.ts'
import type {
  CompilerLibrarySet,
  LibraryResultShapeFieldDescriptor,
  TypeRef,
  TypeTraitRef
} from './types.ts'
import type { AnyNode, ObjectShapeInfo, SourceLocation, ValueType } from '../types.ts'

export type TypeRefCompatibilityMetadata = {
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
  setElementType: ValueType | null
}

export function typeRefCompatibilityMetadata(
  typeRef: TypeRef,
  libraries: CompilerLibrarySet,
  loc: SourceLocation
): TypeRefCompatibilityMetadata {
  const metadata = baseTypeRefCompatibilityMetadata(typeRef, libraries, loc)

  applyTypeTraits(metadata, typeRef.traits, libraries, loc)
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
        setElementType: fieldMetadata.setElementType,
        shape: fieldMetadata.shape,
        libraryCppType: fieldMetadata.libraryCppType,
        loc
      })
    }

    metadata.shape = { kind: 'object', fields }
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
    setElementType: null
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
      metadata.promiseValueType = typeRefCompatibilityMetadata(trait.args[0], libraries, loc).valueType

      if (trait.args.length > 1) {
        metadata.promiseRejectionValueType = typeRefCompatibilityMetadata(trait.args[1], libraries, loc).valueType
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
