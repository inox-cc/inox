import { memberExpressionPath } from '../../member-paths.ts'
import { timeRuntimeCFunctionNameFromPath } from '../../stdlib/descriptors/time.ts'
import type { AnyNode } from '../../types.ts'

export function cTimeRuntimeCallName(callee: AnyNode | null | undefined): string | null {
  return timeRuntimeCFunctionNameFromPath(memberExpressionPath(callee))
}
