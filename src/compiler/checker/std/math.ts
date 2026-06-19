import { mathRuntimeMethodNameFromPath } from '../../stdlib/descriptors/math.ts'
import type { AnyNode } from '../../types.ts'
import { memberExpressionPath } from '../../member-paths.ts'
import { isPresent } from '../../nullish.ts'

export function isMathRuntimeMethod(callee: AnyNode): boolean {
  return isPresent(mathRuntimeMethodNameFromPath(memberExpressionPath(callee)))
}
