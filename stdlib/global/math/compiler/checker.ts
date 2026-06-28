import { memberExpressionPath } from '../../../../compiler/member-paths.ts'
import type { AnyNode } from '../../../../compiler/types.ts'
import { mathRuntimeMethodNameFromPath } from './descriptor.ts'

export function isMathRuntimeMethod(callee: AnyNode): boolean {
  return !!mathRuntimeMethodNameFromPath(memberExpressionPath(callee))
}
