import { timeRuntimeCFunctionNameFromPath } from '../../stdlib/descriptors/time.ts'

export function cTimeRuntimeCallName(callee: any): string | null {
  if (callee?.type !== 'MemberExpression' || callee.object.type !== 'Reference' || callee.object.path.length !== 1) {
    return null
  }

  return timeRuntimeCFunctionNameFromPath([callee.object.path[0], callee.property])
}
