import type { AnyNode, IrFeature } from '../../../../compiler/types.ts'
import type { CompilerFeatureDescriptor } from '../../../../compiler/features/types.ts'
import { nullableString } from '../../../../compiler/features/runtime-backed/common.ts'
import type { RuntimeBackedFeatureNode } from '../../../../compiler/features/runtime-backed/common.ts'

export const childProcessFeature: CompilerFeatureDescriptor = {
  id: 'child-process',
  runtimeRequirements: ['child-process', 'managed-values', 'string-bytes'],
  cPreludeIncludes: [],
  hasCPreludeHelpers: false
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
