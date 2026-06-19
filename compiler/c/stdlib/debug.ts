import { memberExpressionPath } from '../../member-paths.ts'
import { isDebugRuntimeMethodPath } from '../../stdlib/descriptors/debug.ts'
import type { AnyNode } from '../../types.ts'

export function cDebugRuntimeMethodName(expression: AnyNode | null | undefined): string | null {
  if (
    expression === null ||
    typeof expression === 'undefined' ||
    expression.type !== 'CallExpression' ||
    expression.debugRuntimeMethod === null ||
    typeof expression.debugRuntimeMethod === 'undefined'
  ) {
    return null
  }

  if (!isDebugRuntimeMethodPath(memberExpressionPath(expression.callee))) {
    return null
  }

  return expression.debugRuntimeMethod
}
