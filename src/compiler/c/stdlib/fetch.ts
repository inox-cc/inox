import { isAsyncFetchRuntimeMethod } from '../../stdlib/descriptors/fetch.ts'

type PreparedExpression = {
  lines: string[]
  expression: string
}

export type FetchDeclarationDependencies = {
  emitPreparedFetchHeadersCallExpression: (
    expression: any,
    context: any,
    options?: any
  ) => PreparedExpression | null
}

export function cFetchRuntimeExpressionMethod(expression: any): string | null {
  return expression?.fetchRuntimeMethod ?? null
}

export function isAsyncFetchRuntimeCallExpression(expression: any): boolean {
  const method = cFetchRuntimeExpressionMethod(expression)

  return expression?.valueType === 'promise' && isAsyncFetchRuntimeMethod(method)
}

export function emitFetchHeadersBooleanVariableDeclaration(
  statement: any,
  context: any,
  dependencies: FetchDeclarationDependencies
): string[] | null {
  const fetchHeadersCall = dependencies.emitPreparedFetchHeadersCallExpression(statement.init, context, {
    out: statement.name
  })

  if (fetchHeadersCall == null || statement.valueType !== 'boolean') {
    return null
  }

  context.variables.set(statement.name, 'boolean')

  return fetchHeadersCall.lines
}
