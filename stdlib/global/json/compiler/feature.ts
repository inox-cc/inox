import { memberExpressionPath } from '../../../../compiler/member-paths.ts'
import type { AnyNode, IrFeature } from '../../../../compiler/types.ts'
import type { CompilerFeatureDescriptor } from '../../../../compiler/features/types.ts'
import { isCallLikeNode } from '../../../../compiler/ir/node-utils.ts'
import { jsonRuntimeMethodNameFromPath } from './descriptor.ts'

type JsonFeatureNode = AnyNode & {
  callee?: AnyNode | null
  type?: string | null
}

export const jsonFeature: CompilerFeatureDescriptor = {
  id: 'json',
  runtimeRequirements: ['collections', 'json', 'managed-values', 'objects', 'string-bytes'],
  cPreludeIncludes: [],
  hasCPreludeHelpers: false
}

export function collectJsonIrFeatures(node: AnyNode, features: Set<IrFeature>): void {
  const item = node as JsonFeatureNode

  if (!jsonRuntimeCallName(item)) {
    return
  }

  features.add('json')
  features.add('runtime-values')
}

function jsonRuntimeCallName(expression: JsonFeatureNode): string | null {
  const callee = expression.callee

  if (!isCallLikeNode(expression) || callee === null || typeof callee === 'undefined') {
    return null
  }

  return jsonRuntimeMethodNameFromPath(memberExpressionPath(callee))
}
