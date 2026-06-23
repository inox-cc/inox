// @targets c
// @expect pass
// @stdout function:number

function knownValueType(valueType: string): string | null {
  if (valueType === 'function') {
    return 'function'
  }

  return null
}

function emitFunctionScalarVariableDeclaration(valueType: string, returnType: string): string | null {
  if (valueType !== 'function') {
    return null
  }

  return `function:${returnType}`
}

function inferScalarDeclarationValueType(initType: string, inferred: string): string {
  if (initType === 'ArrowFunctionExpression') {
    return 'function'
  }

  return inferred
}

function emitScalarVariableDeclaration(statementValueType: string, initType: string, inferred: string): string {
  const declarationInferred = inferScalarDeclarationValueType(initType, inferred)
  const declared = knownValueType(statementValueType)
  let variableType = declarationInferred

  if (declared !== null && typeof declared !== 'undefined') {
    variableType = declared
  }

  const functionDeclaration = emitFunctionScalarVariableDeclaration(variableType, 'number')

  if (functionDeclaration !== null && typeof functionDeclaration !== 'undefined') {
    return functionDeclaration
  }

  return `unsupported:${declarationInferred}`
}

console.log(emitScalarVariableDeclaration('function', 'ArrowFunctionExpression', 'unknown'))
