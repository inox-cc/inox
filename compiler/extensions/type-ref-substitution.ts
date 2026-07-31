import type { LibraryNativeTypeDescriptor, NominalTypeRef, ObjectTypeRefField, TypeRef, TypeTraitRef } from './types.ts'

export type TypeRefSubstitution = {
  name: string
  typeRef: TypeRef
}

/** Recursively substitutes data-only TypeRef template parameters. */
export function substituteTypeRef(typeRef: TypeRef, substitutions: TypeRefSubstitution[]): TypeRef {
  return substituteTypeRefInScope(typeRef, substitutions, new Set<string>())
}

/** Instantiates a native nominal TypeRef and its package-owned trait templates. */
export function instantiateNativeTypeRef(
  nativeType: LibraryNativeTypeDescriptor,
  typeArguments: TypeRef[]
): NominalTypeRef {
  return {
    kind: 'nominal',
    typeId: nativeType.typeId,
    args: typeArguments.slice(),
    nullable: false,
    ownership: 'value',
    traits: instantiateNativeTypeTraits(nativeType, typeArguments)
  }
}

/** Instantiates native trait templates using positional type arguments. */
export function instantiateNativeTypeTraits(
  nativeType: LibraryNativeTypeDescriptor,
  typeArguments: TypeRef[]
): TypeTraitRef[] {
  const typeParameters = nativeType.typeParameters

  if (
    typeParameters !== null &&
    typeof typeParameters !== 'undefined' &&
    typeParameters.length !== typeArguments.length
  ) {
    throw new Error(
      `native type ${nativeType.typeId} expects ${typeParameters.length} type argument(s), got ${typeArguments.length}`
    )
  }

  const substitutions: TypeRefSubstitution[] = []

  for (let index = 0; index < (typeParameters ?? []).length; index = index + 1) {
    substitutions.push({ name: (typeParameters ?? [])[index], typeRef: typeArguments[index] })
  }

  return substituteTypeTraits(nativeType.traits ?? [], substitutions, new Set<string>())
}

function substituteTypeRefInScope(
  typeRef: TypeRef,
  substitutions: TypeRefSubstitution[],
  resolving: Set<string>
): TypeRef {
  if (typeRef.kind === 'parameter') {
    const substitution = typeRefSubstitution(substitutions, typeRef.name)

    if (substitution === null) {
      throw new Error(`Missing TypeRef substitution ${typeRef.name}`)
    }

    if (substitution.typeRef.kind === 'parameter') {
      const nested = typeRefSubstitution(substitutions, substitution.typeRef.name)

      if (
        substitution.typeRef.name === typeRef.name ||
        nested === null ||
        nested === substitution
      ) {
        return typeRef.nullable === true ? nullableTypeRef(substitution.typeRef) : substitution.typeRef
      }
    }

    if (resolving.has(typeRef.name)) {
      throw new Error(`Circular TypeRef substitution ${typeRef.name}`)
    }

    resolving.add(typeRef.name)

    try {
      const resolved = substituteTypeRefInScope(substitution.typeRef, substitutions, resolving)

      if (typeRef.nullable === true) {
        return nullableTypeRef(resolved)
      }

      return resolved
    } finally {
      resolving.delete(typeRef.name)
    }
  }

  const traits = substituteTypeTraits(typeRef.traits, substitutions, resolving)

  if (typeRef.kind === 'primitive') {
    return {
      kind: 'primitive',
      name: typeRef.name,
      nullable: typeRef.nullable,
      ownership: typeRef.ownership,
      traits
    }
  }

  if (typeRef.kind === 'nominal') {
    return {
      kind: 'nominal',
      typeId: typeRef.typeId,
      args: substituteTypeRefs(typeRef.args, substitutions, resolving),
      nullable: typeRef.nullable,
      ownership: typeRef.ownership,
      traits
    }
  }

  if (typeRef.kind === 'function') {
    return {
      kind: 'function',
      params: substituteTypeRefs(typeRef.params, substitutions, resolving),
      result: substituteTypeRefInScope(typeRef.result, substitutions, resolving),
      nullable: typeRef.nullable,
      ownership: typeRef.ownership,
      traits
    }
  }

  if (typeRef.kind === 'object') {
    const fields: ObjectTypeRefField[] = []

    for (let index = 0; index < typeRef.fields.length; index = index + 1) {
      const field = typeRef.fields[index]
      fields.push({
        ...field,
        typeRef: substituteTypeRefInScope(field.typeRef, substitutions, resolving)
      })
    }

    if (typeRef.dynamicField !== null && typeof typeRef.dynamicField !== 'undefined') {
      return {
        ...typeRef,
        fields,
        dynamicField: substituteTypeRefInScope(typeRef.dynamicField, substitutions, resolving),
        traits
      }
    }

    return {
      ...typeRef,
      fields,
      traits
    }
  }

  return {
    kind: 'unknown',
    nullable: typeRef.nullable,
    ownership: typeRef.ownership,
    traits
  }
}

function nullableTypeRef(typeRef: TypeRef): TypeRef {
  if (typeRef.kind === 'parameter') {
    return { kind: 'parameter', name: typeRef.name, nullable: true }
  }

  return { ...typeRef, nullable: true }
}

function substituteTypeRefs(
  typeRefs: TypeRef[],
  substitutions: TypeRefSubstitution[],
  resolving: Set<string>
): TypeRef[] {
  const result: TypeRef[] = []

  for (let index = 0; index < typeRefs.length; index = index + 1) {
    result.push(substituteTypeRefInScope(typeRefs[index], substitutions, resolving))
  }

  return result
}

function substituteTypeTraits(
  traits: TypeTraitRef[],
  substitutions: TypeRefSubstitution[],
  resolving: Set<string>
): TypeTraitRef[] {
  const result: TypeTraitRef[] = []

  for (let index = 0; index < traits.length; index = index + 1) {
    result.push({
      traitId: traits[index].traitId,
      args: substituteTypeRefs(traits[index].args, substitutions, resolving)
    })
  }

  return result
}

function typeRefSubstitution(substitutions: TypeRefSubstitution[], name: string): TypeRefSubstitution | null {
  for (let index = 0; index < substitutions.length; index = index + 1) {
    if (substitutions[index].name === name) {
      return substitutions[index]
    }
  }

  return null
}
