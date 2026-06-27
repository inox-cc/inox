import type { AnyNode, IrFeature } from '../../types.ts'
import type { CompilerFeatureDescriptor } from '../types.ts'
import { hasStringValue, nullableString } from './common.ts'
import type { RuntimeBackedFeatureNode } from './common.ts'

export const pathFeature: CompilerFeatureDescriptor = {
  id: 'path',
  runtimeRequirements: ['managed-values', 'path', 'string-bytes'],
  cPreludeIncludes: [],
  cPreludeHelpers: [],
  collect: collectPathIrFeatures
}

export function collectPathIrFeatures(node: AnyNode, features: Set<IrFeature>): void {
  const item = node as RuntimeBackedFeatureNode

  if (!hasStringValue(item.pathRuntimeConstant) && !pathRuntimeMethodName(item)) {
    return
  }

  features.add('path')
  features.add('runtime-values')
  features.add('string-bytes')
}

function pathRuntimeMethodName(expression: RuntimeBackedFeatureNode): string | null {
  const method = nullableString(expression.pathRuntimeMethod)

  if (expression.type !== 'CallExpression' || method === null || typeof method === 'undefined') {
    return null
  }

  return method
}
