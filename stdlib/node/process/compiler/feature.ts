import type { AnyNode, IrFeature } from '../../../../compiler/types.ts'
import type { CompilerFeatureDescriptor } from '../../../../compiler/features/types.ts'
import { hasStringValue, nullableString } from '../../../../compiler/ir/node-utils.ts'

type ProcessFeatureNode = AnyNode & {
  processRuntimeEnvName?: string | null
  processRuntimeMethod?: string | null
  processRuntimeProperty?: string | null
  type?: string | null
}

export const processFeature: CompilerFeatureDescriptor = {
  id: 'process',
  runtimeRequirements: ['managed-values', 'process', 'string-bytes'],
  cPreludeIncludes: [],
  hasCPreludeHelpers: false
}

export function collectProcessIrFeatures(node: AnyNode, features: Set<IrFeature>): void {
  const item = node as ProcessFeatureNode

  if (!hasStringValue(item.processRuntimeProperty) && !hasStringValue(item.processRuntimeEnvName) && !processRuntimeMethodName(item)) {
    return
  }

  features.add('process')
  features.add('runtime-values')
  features.add('string-bytes')
}

function processRuntimeMethodName(expression: ProcessFeatureNode): string | null {
  const method = nullableString(expression.processRuntimeMethod)

  if (expression.type !== 'CallExpression' || method === null || typeof method === 'undefined') {
    return null
  }

  return method
}
