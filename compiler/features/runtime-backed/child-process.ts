import type { AnyNode, IrFeature } from '../../types.ts'
import type { CompilerFeatureDescriptor } from '../types.ts'
import { nullableString } from './common.ts'
import type { RuntimeBackedFeatureNode } from './common.ts'

export const childProcessFeature: CompilerFeatureDescriptor = {
  id: 'child-process',
  runtimeRequirements: ['child-process', 'managed-values', 'string-bytes'],
  cPreludeIncludes: [],
  cPreludeHelpers: [],
  collect: collectChildProcessIrFeatures
}

export function collectChildProcessIrFeatures(node: AnyNode, features: Set<IrFeature>): void {
  const item = node as RuntimeBackedFeatureNode

  if (!childProcessRuntimeMethodName(item)) {
    return
  }

  features.add('child-process')
  features.add('runtime-values')
  features.add('string-bytes')
}

function childProcessRuntimeMethodName(expression: RuntimeBackedFeatureNode): string | null {
  const method = nullableString(expression.childProcessRuntimeMethod)

  if (expression.type !== 'CallExpression' || method === null || typeof method === 'undefined') {
    return null
  }

  return method
}
