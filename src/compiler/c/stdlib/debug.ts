import { isDebugRuntimeMethodPath } from '../../stdlib/descriptors/debug.ts'
import { memberExpressionPath } from '../../member-paths.ts'
import type { AnyNode } from '../../types.ts'

export function cDebugRuntimeMethodName(expression: AnyNode | null | undefined): string | null {
  if (expression == null || expression.type !== 'CallExpression' || expression.debugRuntimeMethod == null) {
    return null
  }

  if (!isDebugRuntimeMethodPath(memberExpressionPath(expression.callee))) {
    return null
  }

  return expression.debugRuntimeMethod
}
