import type { AnyNode, IrFeature } from '../../types.ts'
import type { CompilerFeatureDescriptor } from '../types.ts'
import { hasStringValue, nullableString } from './common.ts'
import type { RuntimeBackedFeatureNode } from './common.ts'

export const processFeature: CompilerFeatureDescriptor = {
  id: 'process',
  runtimeRequirements: ['managed-values', 'process', 'string-bytes'],
  cPreludeIncludes: [],
  cPreludeHelpers: [],
  collect: collectProcessIrFeatures
}

export function collectProcessIrFeatures(node: AnyNode, features: Set<IrFeature>): void {
  const item = node as RuntimeBackedFeatureNode

  if (!hasStringValue(item.processRuntimeProperty) && !hasStringValue(item.processRuntimeEnvName) && !processRuntimeMethodName(item)) {
    return
  }

  features.add('process')
  features.add('runtime-values')
  features.add('string-bytes')
}

function processRuntimeMethodName(expression: RuntimeBackedFeatureNode): string | null {
  const method = nullableString(expression.processRuntimeMethod)

  if (expression.type !== 'CallExpression' || method === null || typeof method === 'undefined') {
    return null
  }

  return method
}
