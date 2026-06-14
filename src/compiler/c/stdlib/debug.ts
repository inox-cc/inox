import { debugRuntimeMethodNameFromPath } from '../../stdlib/descriptors/debug.ts'
import { memberExpressionPath } from '../../member-paths.ts'

export function cDebugRuntimeMethodName(expression: any): string | null {
  if (expression?.type !== 'CallExpression' || typeof expression.debugRuntimeMethod !== 'string') {
    return null
  }

  return debugRuntimeMethodNameFromPath(memberExpressionPath(expression.callee)) === expression.debugRuntimeMethod
    ? expression.debugRuntimeMethod
    : null
}
