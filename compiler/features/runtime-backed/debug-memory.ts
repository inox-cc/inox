import { memberExpressionPath } from '../../member-paths.ts'
import { debugRuntimeMethodNameFromPath } from '../../../stdlib/global/compiler/descriptor.ts'
import type { AnyNode, IrFeature } from '../../types.ts'
import type { CompilerFeatureDescriptor } from '../types.ts'
import { nullableString } from './common.ts'
import type { RuntimeBackedFeatureNode } from './common.ts'

export const debugMemoryFeature: CompilerFeatureDescriptor = {
  id: 'debug-memory',
  runtimeRequirements: ['debug-memory', 'managed-values', 'objects'],
  cPreludeIncludes: [],
  hasCPreludeHelpers: false
}

export function collectDebugMemoryIrFeatures(node: AnyNode, features: Set<IrFeature>): void {
  const item = node as RuntimeBackedFeatureNode

  if (!debugRuntimeMethodName(item)) {
    return
  }

  features.add('debug-memory')
  features.add('objects')
  features.add('runtime-values')
}

function debugRuntimeMethodName(expression: RuntimeBackedFeatureNode): string | null {
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
