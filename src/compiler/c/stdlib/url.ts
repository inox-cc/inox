export function cUrlRuntimeMethodName(expression: any): string | null {
  if (
    (expression?.type !== 'CallExpression' && expression?.type !== 'NewExpression') ||
    typeof expression.urlRuntimeMethod !== 'string'
  ) {
    return null
  }

  return expression.urlRuntimeMethod
}
