import { memberExpressionPath } from '../../../../compiler/member-paths.ts'
import type { AnyNode, ValueType } from '../../../../compiler/types.ts'
import { jsonRuntimeMethodNameFromPath } from './descriptor.ts'

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
