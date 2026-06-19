import { memberExpressionPath } from '../../member-paths.ts'
import { jsonRuntimeMethodNameFromPath } from '../../stdlib/descriptors/json.ts'
import type { AnyNode, ValueType } from '../../types.ts'

export function jsonRuntimeMethodName(callee: AnyNode): string | null {
  return jsonRuntimeMethodNameFromPath(memberExpressionPath(callee))
}

export function isJsonParseDeclaredType(valueType: ValueType): boolean {
  return (
    valueType === 'array' ||
    valueType === 'boolean' ||
    valueType === 'number' ||
    valueType === 'object' ||
    valueType === 'string'
  )
}
