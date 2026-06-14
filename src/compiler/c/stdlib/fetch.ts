export function cFetchRuntimeExpressionMethod(expression: any): string | null {
  return expression?.fetchRuntimeMethod ?? null
}
