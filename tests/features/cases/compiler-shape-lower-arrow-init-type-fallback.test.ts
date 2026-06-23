// @targets c
// @expect pass
// @stdout function

type LowerInitNode = {
  type: string
  valueType?: string | null
}

type LowerStatementNode = {
  valueType?: string | null
  declaredType?: string | null
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

  const statementDeclaredType = nullableString(statement.declaredType)

  if (statementDeclaredType !== null && typeof statementDeclaredType !== 'undefined') {
    return statementDeclaredType
  }

  if (init !== null && typeof init !== 'undefined') {
    if (init.type === 'ArrowFunctionExpression') {
      return 'function'
    }

    const initValueType = nullableString(init.valueType)

    if (initValueType !== null && typeof initValueType !== 'undefined') {
      return initValueType
    }
  }

  return 'unknown'
}

const statement: LowerStatementNode = {
  valueType: 'unknown'
}

const init: LowerInitNode = {
  type: 'ArrowFunctionExpression'
}

console.log(variableDeclarationValueType(statement, init))
