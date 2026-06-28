import type { AnyNode, IrFeature } from '../../../../compiler/types.ts'
import type { CompilerFeatureDescriptor } from '../../../../compiler/features/types.ts'
import { nullableString } from '../../../../compiler/features/runtime-backed/common.ts'
import type { RuntimeBackedFeatureNode } from '../../../../compiler/features/runtime-backed/common.ts'

export const urlFeature: CompilerFeatureDescriptor = {
  id: 'url',
  runtimeRequirements: ['managed-values', 'objects', 'string-bytes', 'url'],
  cPreludeIncludes: [],
  hasCPreludeHelpers: false
}

export function collectUrlIrFeatures(node: AnyNode, features: Set<IrFeature>): void {
  const item = node as RuntimeBackedFeatureNode

  if (!urlRuntimeMethodName(item)) {
    return
  }

  features.add('url')
  features.add('runtime-values')
  features.add('string-bytes')
}

function urlRuntimeMethodName(expression: RuntimeBackedFeatureNode): string | null {
  const method = nullableString(expression.urlRuntimeMethod)

  if (
    (expression.type !== 'CallExpression' && expression.type !== 'NewExpression') ||
    method === null ||
    typeof method === 'undefined'
  ) {
    return null
  }

  return method
}
