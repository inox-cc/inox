// @targets cc
// @expect pass
// @stdout function

type InitNode = {
  type: string
}

type StatementNode = {
  valueType?: string | null
  init: InitNode
}

function preparedDeclarationKind(statement: StatementNode, inferred: string): string {
  const variableType =
    statement.valueType === 'function' || statement.init.type === 'ArrowFunctionExpression' ? 'function' : inferred

  if (variableType === 'function') {
    return 'function'
  }

  if (inferred === 'string') {
    return 'string'
  }

  return 'fallback'
}

const statement: StatementNode = {
  valueType: 'unknown',
  init: {
    type: 'ArrowFunctionExpression'
  }
}

console.log(preparedDeclarationKind(statement, 'string'))
