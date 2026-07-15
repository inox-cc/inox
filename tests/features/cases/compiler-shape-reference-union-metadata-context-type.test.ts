// @targets cc
// @expect pass
// @stdout number

type ReferenceNode = {
  type: string
  path: string[]
  valueType?: string | null
}

type TypeContext = {
  variables: Map<string, string>
}

function isUnionMetadataType(valueType: string | null | undefined): boolean {
  return valueType !== null && typeof valueType !== 'undefined' && valueType.startsWith('union<')
}

function isConcreteContextValueType(valueType: string | null | undefined): boolean {
  return (
    valueType !== null && typeof valueType !== 'undefined' && valueType !== 'unknown' && !isUnionMetadataType(valueType)
  )
}

function shouldPreferReferenceMetadataType(
  variableType: string | null | undefined,
  metadataType: string | null | undefined
): boolean {
  if (metadataType === null || typeof metadataType === 'undefined') {
    return false
  }

  if (variableType === null || typeof variableType === 'undefined') {
    return true
  }

  if (isUnionMetadataType(metadataType) && isConcreteContextValueType(variableType)) {
    return false
  }

  if (variableType === 'number' && metadataType !== 'number') {
    return true
  }

  return false
}

function referenceExpressionType(expression: ReferenceNode, context: TypeContext): string {
  const variableType = context.variables.get(expression.path[0])
  let metadataType: string | null = null

  if (
    expression.valueType !== null &&
    typeof expression.valueType !== 'undefined' &&
    expression.valueType !== 'unknown'
  ) {
    metadataType = expression.valueType
  }

  if (shouldPreferReferenceMetadataType(variableType, metadataType)) {
    if (metadataType !== null && typeof metadataType !== 'undefined') {
      return metadataType
    }
  }

  if (variableType !== null && typeof variableType !== 'undefined') {
    return variableType
  }

  return 'number'
}

const context: TypeContext = {
  variables: new Map()
}

context.variables.set('value', 'number')

const expression: ReferenceNode = {
  type: 'Reference',
  path: ['value'],
  valueType: 'union<string,number>'
}

console.log(referenceExpressionType(expression, context))
