// @targets c
// @expect pass
// @stdout function

type InitNode = {
  type: string
}

type ScalarDeclaration = {
  name: string
  valueType?: string | null
  init: InitNode
}

function knownValueType(valueType: string | null | undefined): string | null {
  if (valueType === null || typeof valueType === 'undefined' || valueType === 'unknown') {
    return null
  }

  return valueType
}

function inferScalarDeclarationValueType(statement: ScalarDeclaration): string {
  if (statement.init.type === 'ArrowFunctionExpression') {
    return 'function'
  }

  return 'unknown'
}

function scalarDeclarationVariableType(statement: ScalarDeclaration): string {
  const inferred = inferScalarDeclarationValueType(statement)
  const declared = knownValueType(statement.valueType)

  return inferred === 'function' ? 'function' : declared ?? inferred
}

const statement: ScalarDeclaration = {
  name: 'fn',
  valueType: 'number',
  init: {
    type: 'ArrowFunctionExpression'
  }
}

console.log(scalarDeclarationVariableType(statement))
