import { typeRefTraits } from './type-ref-compatibility.ts'
import { substituteTypeRef } from './type-ref-substitution.ts'
import type {
  CompilerLibrarySet,
  LibraryOperationDescriptor,
  LibraryOperationTypeParameterSourceDescriptor,
  TypeRef
} from './types.ts'

export type LibraryOperationTypeRefContext = {
  explicitTypeArguments: TypeRef[]
  receiverTypeRef: TypeRef | null
  contextualTypeRef: TypeRef | null
  argumentTypeRefs: TypeRef[]
}

/** Resolves a data-only operation TypeRef template for one call site. */
export function instantiateLibraryOperationTypeRef(
  operation: LibraryOperationDescriptor,
  typeRef: TypeRef,
  context: LibraryOperationTypeRefContext,
  libraries: CompilerLibrarySet
): TypeRef {
  const parameters = operation.typeParameters ?? []
  const substitutions = []

  for (let index = 0; index < parameters.length; index = index + 1) {
    const parameter = parameters[index]
    substitutions.push({
      name: parameter.name,
      typeRef: resolveOperationTypeParameter(parameter.sources, context, libraries) ?? unknownTypeRef()
    })
  }

  return substituteTypeRef(typeRef, substitutions)
}

function resolveOperationTypeParameter(
  sources: LibraryOperationTypeParameterSourceDescriptor[],
  context: LibraryOperationTypeRefContext,
  libraries: CompilerLibrarySet
): TypeRef | null {
  for (let index = 0; index < sources.length; index = index + 1) {
    const resolved = resolveOperationTypeParameterSource(sources[index], context, libraries)

    if (resolved !== null && resolved.kind !== 'unknown') {
      return resolved
    }
  }

  return null
}

function resolveOperationTypeParameterSource(
  source: LibraryOperationTypeParameterSourceDescriptor,
  context: LibraryOperationTypeRefContext,
  libraries: CompilerLibrarySet
): TypeRef | null {
  if (source.source === 'explicit-type-argument') {
    return typeRefAt(context.explicitTypeArguments, source.argumentIndex)
  }

  if (source.source === 'receiver-type-argument') {
    return nominalTypeArgument(context.receiverTypeRef, source.argumentIndex)
  }

  if (source.source === 'contextual-type-argument') {
    return nominalTypeArgument(context.contextualTypeRef, source.argumentIndex)
  }

  if (source.source !== 'argument-trait') {
    return null
  }

  const traitArgumentIndex = source.traitArgumentIndex

  if (typeof traitArgumentIndex !== 'number') {
    return null
  }

  const argumentTypeRef = typeRefAt(context.argumentTypeRefs, source.argumentIndex)

  if (argumentTypeRef === null || argumentTypeRef.kind === 'parameter') {
    return null
  }

  const traits = typeRefTraits(argumentTypeRef, libraries)

  for (let index = 0; index < traits.length; index = index + 1) {
    const trait = traits[index]

    if (trait.traitId === source.traitId) {
      return typeRefAt(trait.args, traitArgumentIndex)
    }
  }

  return null
}

function nominalTypeArgument(typeRef: TypeRef | null, index: number): TypeRef | null {
  if (typeRef === null || typeRef.kind !== 'nominal') {
    return null
  }

  return typeRefAt(typeRef.args, index)
}

function typeRefAt(typeRefs: TypeRef[], index: number): TypeRef | null {
  if (index < 0 || index >= typeRefs.length) {
    return null
  }

  return typeRefs[index]
}

function unknownTypeRef(): TypeRef {
  return {
    kind: 'unknown',
    nullable: false,
    ownership: 'value',
    traits: []
  }
}
