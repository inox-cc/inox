// @targets c
// @expect pass
// @stdout function

type InitNode = {
  type: string
}

type StatementNode = {
  valueType?: string | null
  init: InitNode
}

function inferExpressionType(_expression: InitNode): string {
  return 'unknown'
}

function variableDeclarationType(statement: StatementNode): string {
  const inferred = inferExpressionType(statement.init)
  return statement.valueType === 'function' || statement.init.type === 'ArrowFunctionExpression' ? 'function' : inferred
}

const statement: StatementNode = {
  valueType: 'unknown',
  init: {
    type: 'ArrowFunctionExpression'
  }
}

console.log(variableDeclarationType(statement))
