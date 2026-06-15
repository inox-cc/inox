export function cryptoRuntimeMethodName(expression: any): string | null {
  if (expression?.type !== 'CallExpression' || typeof expression.cryptoRuntimeMethod !== 'string') {
    return null
  }

  return expression.cryptoRuntimeMethod
}
