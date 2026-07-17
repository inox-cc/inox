import { typeRefTraits } from './type-ref-compatibility.ts'
import { substituteTypeRef } from './type-ref-substitution.ts'
import type {
  CompilerLibrarySet,
  LibraryOperationDescriptor,
  LibraryOperationTypeParameterSourceDescriptor,
  TypeTraitId,
  TypeRef
} from './types.ts'

export type LibraryOperationTypeRefContext = {
  explicitTypeArguments: TypeRef[]
  receiverTypeRef: TypeRef | null
  contextualTypeRef: TypeRef | null
  argumentTypeRefs: TypeRef[]
  argumentFunctionReturnTypeRefs: TypeRef[]
  argumentArrayLiteralColumns: TypeRef[][]
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
    const argumentIndex = source.argumentIndex

    if (typeof argumentIndex !== 'number') {
      return null
    }

    return typeRefAt(context.explicitTypeArguments, argumentIndex)
  }

  if (source.source === 'receiver-type-argument') {
    const argumentIndex = source.argumentIndex

    if (typeof argumentIndex !== 'number') {
      return null
    }

    return nominalTypeArgument(context.receiverTypeRef, argumentIndex)
  }

  if (source.source === 'contextual-type-argument') {
    const argumentIndex = source.argumentIndex

    if (typeof argumentIndex !== 'number') {
      return null
    }

    return nominalTypeArgument(context.contextualTypeRef, argumentIndex)
  }

  if (source.source === 'argument-function-return') {
    const argumentIndex = source.argumentIndex

    if (typeof argumentIndex !== 'number') {
      return null
    }

    return typeRefAt(context.argumentFunctionReturnTypeRefs, argumentIndex)
  }

  if (source.source === 'argument-type') {
    const argumentIndex = source.argumentIndex

    if (typeof argumentIndex !== 'number') {
      return null
    }

    return typeRefAt(context.argumentTypeRefs, argumentIndex)
  }

  if (source.source === 'argument-array-literal-column') {
    const argumentIndex = source.argumentIndex
    const elementIndex = source.elementIndex

    if (typeof argumentIndex !== 'number' || typeof elementIndex !== 'number') {
      return null
    }

    const columns = typeRefListAt(context.argumentArrayLiteralColumns, argumentIndex)

    if (columns === null) {
      return null
    }

    return typeRefAt(columns, elementIndex)
  }

  if (source.source === 'receiver-trait') {
    const traitId = source.traitId
    const traitArgumentIndex = source.traitArgumentIndex

    if (typeof traitId !== 'string' || typeof traitArgumentIndex !== 'number') {
      return null
    }

    return traitArgument(context.receiverTypeRef, traitId, traitArgumentIndex, libraries)
  }

  if (source.source !== 'argument-trait') {
    return null
  }

  const argumentIndex = source.argumentIndex
  const traitId = source.traitId
  const traitArgumentIndex = source.traitArgumentIndex

  if (
    typeof argumentIndex !== 'number' ||
    typeof traitId !== 'string' ||
    typeof traitArgumentIndex !== 'number'
  ) {
    return null
  }

  const argumentTypeRef = typeRefAt(context.argumentTypeRefs, argumentIndex)

  return traitArgument(argumentTypeRef, traitId, traitArgumentIndex, libraries)
}

function traitArgument(
  typeRef: TypeRef | null,
  traitId: TypeTraitId,
  traitArgumentIndex: number,
  libraries: CompilerLibrarySet
): TypeRef | null {
  const argumentTypeRef = typeRef

  if (argumentTypeRef === null || argumentTypeRef.kind === 'parameter') {
    return null
  }

  const traits = typeRefTraits(argumentTypeRef, libraries)

  for (let index = 0; index < traits.length; index = index + 1) {
    const trait = traits[index]

    if (trait.traitId === traitId) {
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

function typeRefListAt(typeRefs: TypeRef[][], index: number): TypeRef[] | null {
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
