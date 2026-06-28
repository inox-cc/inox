import { memberExpressionPath } from '../../../../compiler/member-paths.ts'
import type { AnyNode, IrFeature } from '../../../../compiler/types.ts'
import type { CompilerFeatureDescriptor } from '../../../../compiler/features/types.ts'
import { isCallLikeNode } from '../../../../compiler/features/runtime-backed/common.ts'
import type { RuntimeBackedFeatureNode } from '../../../../compiler/features/runtime-backed/common.ts'
import { jsonRuntimeMethodNameFromPath } from './descriptor.ts'

export const jsonFeature: CompilerFeatureDescriptor = {
  id: 'json',
  runtimeRequirements: ['collections', 'json', 'managed-values', 'objects', 'string-bytes'],
  cPreludeIncludes: [],
  hasCPreludeHelpers: false
}

export function collectJsonIrFeatures(node: AnyNode, features: Set<IrFeature>): void {
  const item = node as RuntimeBackedFeatureNode

  if (!jsonRuntimeCallName(item)) {
    return
  }

  features.add('json')
  features.add('runtime-values')
}

function jsonRuntimeCallName(expression: RuntimeBackedFeatureNode): string | null {
  const callee = expression.callee

  if (!isCallLikeNode(expression) || callee === null || typeof callee === 'undefined') {
    return null
  }

  return jsonRuntimeMethodNameFromPath(memberExpressionPath(callee))
}
