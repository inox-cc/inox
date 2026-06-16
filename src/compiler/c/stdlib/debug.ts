import { debugRuntimeMethodNameFromPath } from '../../stdlib/descriptors/debug.ts'
import { memberExpressionPath } from '../../member-paths.ts'
import type { AnyNode } from '../../types.ts'

export function cDebugRuntimeMethodName(expression: AnyNode): string | null {
  if (expression.type !== 'CallExpression' || expression.debugRuntimeMethod == null) {
    return null
  }

  const expected = debugRuntimeMethodNameFromPath(memberExpressionPath(expression.callee))

  if (expected !== expression.debugRuntimeMethod) {
    return null
  }

  return expression.debugRuntimeMethod
}
