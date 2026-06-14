import { jsonRuntimeMethodNameFromPath } from '../../stdlib/descriptors/json.ts'

export function cJsonRuntimeCallName(callee: any): string | null {
  if (callee?.type !== 'MemberExpression' || callee.object.type !== 'Reference' || callee.object.path.length !== 1) {
    return null
  }

  return jsonRuntimeMethodNameFromPath([callee.object.path[0], callee.property])
}
