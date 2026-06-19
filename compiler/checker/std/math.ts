import { memberExpressionPath } from '../../member-paths.ts'
import { mathRuntimeMethodNameFromPath } from '../../stdlib/descriptors/math.ts'
import type { AnyNode } from '../../types.ts'

export function isMathRuntimeMethod(callee: AnyNode): boolean {
  return !!mathRuntimeMethodNameFromPath(memberExpressionPath(callee))
}
