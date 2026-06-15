export function cProcessRuntimeMethodName(expression: any): string | null {
  if (expression?.type !== 'CallExpression' || typeof expression.processRuntimeMethod !== 'string') {
    return null
  }

  return expression.processRuntimeMethod
}

export function cProcessRuntimePropertyName(expression: any): string | null {
  if (typeof expression?.processRuntimeProperty !== 'string') {
    return null
  }

  return expression.processRuntimeProperty
}

export function cProcessRuntimeEnvName(expression: any): string | null {
  return typeof expression?.processRuntimeEnvName === 'string' ? expression.processRuntimeEnvName : null
}
