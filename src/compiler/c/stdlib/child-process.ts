export function cChildProcessRuntimeMethodName(expression: any): string | null {
  if (expression?.type !== 'CallExpression' || typeof expression.childProcessRuntimeMethod !== 'string') {
    return null
  }

  return expression.childProcessRuntimeMethod
}
