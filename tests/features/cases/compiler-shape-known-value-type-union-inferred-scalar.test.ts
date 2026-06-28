// @targets cc
// @expect pass
// @stdout number

type ScalarNode = {
  type: string
  valueType?: string | null
}

type ScalarDeclaration = {
  name: string
  valueType?: string | null
  init: ScalarNode
}

function knownValueType(valueType: string | null | undefined): string | null {
  if (valueType === null || typeof valueType === 'undefined' || valueType === 'unknown') {
    return null
  }

  if (valueType.startsWith('union<')) {
    return null
  }

  return valueType
}

function inferExpressionType(expression: ScalarNode): string {
  if (
    expression.valueType !== null &&
    typeof expression.valueType !== 'undefined' &&
    expression.valueType !== 'unknown'
  ) {
    return expression.valueType
  }

  if (expression.type === 'NumberLiteral') {
    return 'number'
  }

  return 'unknown'
}

function scalarDeclarationContextType(statement: ScalarDeclaration): string {
  const inferred = inferExpressionType(statement.init)
  const declared = knownValueType(statement.valueType)

  return declared ?? inferred
}

const statement: ScalarDeclaration = {
  name: 'value',
  valueType: 'union<string,number>',
  init: {
    type: 'NumberLiteral',
    valueType: 'number'
  }
}

console.log(scalarDeclarationContextType(statement))
