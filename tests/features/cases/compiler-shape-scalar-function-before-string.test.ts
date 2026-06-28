// @targets cc
// @expect pass
// @stdout function

function emitFunctionScalarVariableDeclaration(variableType: string): string | null {
  if (variableType !== 'function') {
    return null
  }

  return 'function'
}

function emitStringScalarVariableDeclaration(inferred: string): string | null {
  if (inferred !== 'string') {
    return null
  }

  return 'string'
}

function emitScalarVariableDeclaration(inferred: string, variableType: string): string {
  const functionDeclaration = emitFunctionScalarVariableDeclaration(variableType)

  if (functionDeclaration !== null && typeof functionDeclaration !== 'undefined') {
    return functionDeclaration
  }

  const stringDeclaration = emitStringScalarVariableDeclaration(inferred)

  if (stringDeclaration !== null && typeof stringDeclaration !== 'undefined') {
    return stringDeclaration
  }

  return 'fallback'
}

console.log(emitScalarVariableDeclaration('string', 'function'))
