import type { AnyNode, IrFeature } from '../../../../compiler/types.ts'
import type { CompilerFeatureDescriptor } from '../../../../compiler/features/types.ts'
import { nullableString } from '../../../../compiler/ir/node-utils.ts'

type UrlFeatureNode = AnyNode & {
  type?: string | null
  urlRuntimeMethod?: string | null
}

export const urlFeature: CompilerFeatureDescriptor = {
  id: 'url',
  runtimeRequirements: ['managed-values', 'objects', 'string-bytes', 'url'],
  cPreludeIncludes: [],
  hasCPreludeHelpers: false
}

export function collectUrlIrFeatures(node: AnyNode, features: Set<IrFeature>): void {
  const item = node as UrlFeatureNode

  if (!urlRuntimeMethodName(item)) {
    return
  }

  features.add('url')
  features.add('runtime-values')
  features.add('string-bytes')
}

function urlRuntimeMethodName(expression: UrlFeatureNode): string | null {
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
