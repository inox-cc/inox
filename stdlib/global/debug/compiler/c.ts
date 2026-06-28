import { memberExpressionPath } from '../../../../compiler/member-paths.ts'
import type { AnyNode } from '../../../../compiler/types.ts'
import { isDebugRuntimeMethodPath } from './descriptor.ts'

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
