import { runtimeObjectLikeTagMatchCondition } from './runtime-values.ts'
import type {
  CCompilerLibrarySet,
  CRuntimeTypeAlternative
} from './types.ts'
import {
  cRuntimeValueTag,
  compilerLibraryNativeRuntimeValueValidExpressionForTypeRef
} from './value-types.ts'

export function runtimeTypeAlternativeValidExpressions(
  alternatives: CRuntimeTypeAlternative[] | null | undefined,
  value: string,
  libraries: CCompilerLibrarySet
): string[] | null {
  if (alternatives === null || typeof alternatives === 'undefined') {
    return null
  }

  const expressions: string[] = []

  for (let index = 0; index < alternatives.length; index = index + 1) {
    const expression = runtimeTypeAlternativeValidExpression(alternatives[index], value, libraries)

    if (expression === null) {
      return []
    }

    if (!expressions.includes(expression)) {
      expressions.push(expression)
    }
  }

  return expressions
}

function runtimeTypeAlternativeValidExpression(
  alternative: CRuntimeTypeAlternative,
  value: string,
  libraries: CCompilerLibrarySet
): string | null {
  const nativeValidExpression = compilerLibraryNativeRuntimeValueValidExpressionForTypeRef(
    libraries,
    alternative.typeRef
  )

  if (nativeValidExpression !== null) {
    return `(${nativeValidExpression.split('$value').join(value)})`
  }

  const tag = cRuntimeValueTag(alternative.valueType)

  if (tag === null) {
    return null
  }

  if (tag === 'INOX_TAG_BOOL' || tag === 'INOX_TAG_NUMBER') {
    return `${value}.tag == ${tag}`
  }

  if (tag === 'INOX_TAG_OBJECT') {
    return `(${runtimeObjectLikeTagMatchCondition(value)} && ${value}.as.ref != 0)`
  }

  return `(${value}.tag == ${tag} && ${value}.as.ref != 0)`
}
