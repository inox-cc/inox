export function cFetchRuntimeExpressionMethod(expression: any): string | null {
  return expression?.fetchRuntimeMethod ?? null
}

export function isAsyncFetchRuntimeCallExpression(expression: any): boolean {
  const method = cFetchRuntimeExpressionMethod(expression)

  return expression?.valueType === 'promise' && (method === 'fetch' || method === 'text')
}
