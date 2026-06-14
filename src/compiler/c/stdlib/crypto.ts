export function cCryptoRuntimeCallName(callee: any): string | null {
  if (callee?.type !== 'MemberExpression' || callee.object.type !== 'Reference' || callee.object.path.length !== 1) {
    return null
  }

  if (callee.object.path[0] !== 'crypto') {
    return null
  }

  return callee.property === 'getRandomValues' ? callee.property : null
}

export function cryptoRuntimeMethodName(expression: any): string | null {
  if (expression?.type !== 'CallExpression' || typeof expression.cryptoRuntimeMethod !== 'string') {
    return null
  }

  return cCryptoRuntimeCallName(expression.callee) === expression.cryptoRuntimeMethod
    ? expression.cryptoRuntimeMethod
    : null
}
