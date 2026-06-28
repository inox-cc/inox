import type { AnyNode, IrFeature } from '../../../../compiler/types.ts'
import type { CompilerFeatureDescriptor } from '../../../../compiler/features/types.ts'
import { hasStringValue, nullableString } from '../../../../compiler/ir/node-utils.ts'

type PathFeatureNode = AnyNode & {
  pathRuntimeConstant?: string | null
  pathRuntimeMethod?: string | null
  type?: string | null
}

export const pathFeature: CompilerFeatureDescriptor = {
  id: 'path',
  runtimeRequirements: ['managed-values', 'path', 'string-bytes'],
  cPreludeIncludes: [],
  hasCPreludeHelpers: false
}

export function collectPathIrFeatures(node: AnyNode, features: Set<IrFeature>): void {
  const item = node as PathFeatureNode

  if (!hasStringValue(item.pathRuntimeConstant) && !pathRuntimeMethodName(item)) {
    return
  }

  features.add('path')
  features.add('runtime-values')
  features.add('string-bytes')
}

function pathRuntimeMethodName(expression: PathFeatureNode): string | null {
  const method = nullableString(expression.pathRuntimeMethod)

  if (expression.type !== 'CallExpression' || method === null || typeof method === 'undefined') {
    return null
  }

  return method
}
