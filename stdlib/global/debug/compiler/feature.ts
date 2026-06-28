import { memberExpressionPath } from '../../../../compiler/member-paths.ts'
import { nullableString } from '../../../../compiler/ir/node-utils.ts'
import type { AnyNode, IrFeature } from '../../../../compiler/types.ts'
import type { CompilerFeatureDescriptor } from '../../../../compiler/features/types.ts'
import { debugRuntimeMethodNameFromPath } from './descriptor.ts'

type DebugMemoryFeatureNode = AnyNode & {
  callee?: AnyNode | null
  debugRuntimeMethod?: string | null
  type?: string | null
}

export const debugMemoryFeature: CompilerFeatureDescriptor = {
  id: 'debug-memory',
  runtimeRequirements: ['debug-memory', 'managed-values', 'objects'],
  cPreludeIncludes: [],
  hasCPreludeHelpers: false
}

export function collectDebugMemoryIrFeatures(node: AnyNode, features: Set<IrFeature>): void {
  const item = node as DebugMemoryFeatureNode

  if (!debugRuntimeMethodName(item)) {
    return
  }

  features.add('debug-memory')
  features.add('objects')
  features.add('runtime-values')
}

function debugRuntimeMethodName(expression: DebugMemoryFeatureNode): string | null {
  const callee = expression.callee
  const method = nullableString(expression.debugRuntimeMethod)

  if (
    expression.type !== 'CallExpression' ||
    callee === null ||
    typeof callee === 'undefined' ||
    callee.type !== 'MemberExpression' ||
    method === null ||
    typeof method === 'undefined'
  ) {
    return null
  }

  if (debugRuntimeMethodNameFromPath(memberExpressionPath(callee)) === method) {
    return method
  }

  return null
}
