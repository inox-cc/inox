// @targets c
// @expect pass
// @stdout function

type LowerInitNode = {
  type: string
  valueType?: string | null
}

type LowerStatementNode = {
  type: string
  valueType?: string | null
  init?: LowerInitNode | null
}

function nullableString(value: string | null | undefined): string | null {
  if (value !== null && typeof value !== 'undefined') {
    return value
  }

  return null
}

function variableDeclarationValueType(statement: LowerStatementNode, init: LowerInitNode | null): string {
  const statementValueType = nullableString(statement.valueType)

  if (statementValueType !== null && typeof statementValueType !== 'undefined' && statementValueType !== 'unknown') {
    return statementValueType
  }

  if (init !== null && typeof init !== 'undefined') {
    const initValueType = nullableString(init.valueType)

    if (initValueType !== null && typeof initValueType !== 'undefined') {
      return initValueType
    }
  }

  return 'unknown'
}

const statement: LowerStatementNode = {
  type: 'VariableDeclaration',
  valueType: 'unknown'
}

const init: LowerInitNode = {
  type: 'ArrowFunctionExpression',
  valueType: 'function'
}

console.log(variableDeclarationValueType(statement, init))
