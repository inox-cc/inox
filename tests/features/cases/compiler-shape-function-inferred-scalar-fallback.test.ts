// @targets cc
// @expect pass
// @stdout function

type StatementNode = {
  name: string
}

function emitFunctionScalarVariableDeclaration(_statement: StatementNode, inferred: string): string | null {
  if (inferred !== 'function') {
    return null
  }

  return 'function'
}

function cUnsupportedExpressionCode(valueType: string): string {
  if (valueType === 'function') {
    return 'INOX_C_FUNCTION_VALUE'
  }

  return 'INOX_C_UNSUPPORTED_EXPR'
}

function emitNumberBooleanScalarVariableDeclaration(statement: StatementNode, inferred: string): string {
  if (inferred === 'function') {
    const functionDeclaration = emitFunctionScalarVariableDeclaration(statement, inferred)

    if (functionDeclaration !== null && typeof functionDeclaration !== 'undefined') {
      return functionDeclaration
    }
  }

  return cUnsupportedExpressionCode(inferred)
}

const statement: StatementNode = {
  name: 'fn'
}

console.log(emitNumberBooleanScalarVariableDeclaration(statement, 'function'))
