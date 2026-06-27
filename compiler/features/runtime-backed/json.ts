import { memberExpressionPath } from '../../member-paths.ts'
import { jsonRuntimeMethodNameFromPath } from '../../stdlib/descriptors/json.ts'
import type { AnyNode, IrFeature } from '../../types.ts'
import type { CompilerFeatureDescriptor } from '../types.ts'
import { isCallLikeNode } from './common.ts'
import type { RuntimeBackedFeatureNode } from './common.ts'

export const jsonFeature: CompilerFeatureDescriptor = {
  id: 'json',
  runtimeRequirements: ['collections', 'json', 'managed-values', 'objects', 'string-bytes'],
  cPreludeIncludes: [],
  cPreludeHelpers: [],
  collect: collectJsonIrFeatures
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
