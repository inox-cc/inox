import { compilerLibraryNativeTypeForId } from './library-set.ts'
import type { CompilerLibrarySet, TypeRef, TypeTraitRef } from './types.ts'

/** Adds runtime requirements for every package-native type reachable from a TypeRef. */
export function addTypeRefRuntimeRequirements(
  requirements: Set<string>,
  typeRef: TypeRef | null | undefined,
  libraries: CompilerLibrarySet
): void {
  if (typeRef === null || typeof typeRef === 'undefined') {
    return
  }

  visitTypeRefRuntimeRequirements(typeRef, requirements, libraries, new Set<TypeRef>(), new Set<string>())
}

function visitTypeRefRuntimeRequirements(
  typeRef: TypeRef | null | undefined,
  requirements: Set<string>,
  libraries: CompilerLibrarySet,
  seenTypeRefs: Set<TypeRef>,
  seenNativeTypeIds: Set<string>
): void {
  if (typeRef === null || typeof typeRef === 'undefined' || seenTypeRefs.has(typeRef)) {
    return
  }

  seenTypeRefs.add(typeRef)

  if (typeRef.kind === 'parameter') {
    return
  }

  if (typeRef.kind === 'nominal') {
    addNativeTypeRuntimeRequirements(
      requirements,
      typeRef.typeId,
      libraries,
      seenTypeRefs,
      seenNativeTypeIds
    )

    for (let index = 0; index < typeRef.args.length; index = index + 1) {
      visitTypeRefRuntimeRequirements(
        typeRef.args[index],
        requirements,
        libraries,
        seenTypeRefs,
        seenNativeTypeIds
      )
    }
  } else if (typeRef.kind === 'function') {
    for (let index = 0; index < typeRef.params.length; index = index + 1) {
      visitTypeRefRuntimeRequirements(
        typeRef.params[index],
        requirements,
        libraries,
        seenTypeRefs,
        seenNativeTypeIds
      )
    }

    visitTypeRefRuntimeRequirements(typeRef.result, requirements, libraries, seenTypeRefs, seenNativeTypeIds)
  } else if (typeRef.kind === 'object') {
    for (let index = 0; index < typeRef.fields.length; index = index + 1) {
      visitTypeRefRuntimeRequirements(
        typeRef.fields[index].typeRef,
        requirements,
        libraries,
        seenTypeRefs,
        seenNativeTypeIds
      )
    }

    visitTypeRefRuntimeRequirements(
      typeRef.dynamicField,
      requirements,
      libraries,
      seenTypeRefs,
      seenNativeTypeIds
    )
  }

  visitTypeTraitRuntimeRequirements(
    typeRef.traits,
    requirements,
    libraries,
    seenTypeRefs,
    seenNativeTypeIds
  )
}

function addNativeTypeRuntimeRequirements(
  requirements: Set<string>,
  typeId: string,
  libraries: CompilerLibrarySet,
  seenTypeRefs: Set<TypeRef>,
  seenNativeTypeIds: Set<string>
): void {
  if (seenNativeTypeIds.has(typeId)) {
    return
  }

  seenNativeTypeIds.add(typeId)
  const nativeType = compilerLibraryNativeTypeForId(libraries, typeId)

  if (nativeType === null) {
    return
  }

  for (let index = 0; index < nativeType.runtimeRequirements.length; index = index + 1) {
    requirements.add(nativeType.runtimeRequirements[index])
  }

  for (let index = 0; index < nativeType.baseTypeIds.length; index = index + 1) {
    addNativeTypeRuntimeRequirements(
      requirements,
      nativeType.baseTypeIds[index],
      libraries,
      seenTypeRefs,
      seenNativeTypeIds
    )
  }

  visitTypeTraitRuntimeRequirements(
    nativeType.traits ?? [],
    requirements,
    libraries,
    seenTypeRefs,
    seenNativeTypeIds
  )
}

function visitTypeTraitRuntimeRequirements(
  traits: TypeTraitRef[],
  requirements: Set<string>,
  libraries: CompilerLibrarySet,
  seenTypeRefs: Set<TypeRef>,
  seenNativeTypeIds: Set<string>
): void {
  for (let traitIndex = 0; traitIndex < traits.length; traitIndex = traitIndex + 1) {
    const trait = traits[traitIndex]

    for (let argumentIndex = 0; argumentIndex < trait.args.length; argumentIndex = argumentIndex + 1) {
      visitTypeRefRuntimeRequirements(
        trait.args[argumentIndex],
        requirements,
        libraries,
        seenTypeRefs,
        seenNativeTypeIds
      )
    }
  }
}
