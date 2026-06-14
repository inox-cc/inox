import { mathRuntimeMethodNameFromPath } from '../../stdlib/descriptors/math.ts'
import type { AnyNode } from '../../types.ts'
import { memberExpressionPath } from './paths.ts'

export function isMathRuntimeMethod(callee: AnyNode): boolean {
  return mathRuntimeMethodNameFromPath(memberExpressionPath(callee)) != null
}
