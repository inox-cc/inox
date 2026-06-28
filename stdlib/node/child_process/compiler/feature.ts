import type { AnyNode, IrFeature } from '../../../../compiler/types.ts'
import type { CompilerFeatureDescriptor } from '../../../../compiler/features/types.ts'
import { nullableString } from '../../../../compiler/ir/node-utils.ts'

type ChildProcessFeatureNode = AnyNode & {
  childProcessRuntimeMethod?: string | null
  type?: string | null
}

export const childProcessFeature: CompilerFeatureDescriptor = {
  id: 'child-process',
  runtimeRequirements: ['child-process', 'managed-values', 'string-bytes'],
  cPreludeIncludes: [],
  hasCPreludeHelpers: false
}

export function collectChildProcessIrFeatures(node: AnyNode, features: Set<IrFeature>): void {
  const item = node as ChildProcessFeatureNode

  if (!childProcessRuntimeMethodName(item)) {
    return
  }

  features.add('child-process')
  features.add('runtime-values')
  features.add('string-bytes')
}

function childProcessRuntimeMethodName(expression: ChildProcessFeatureNode): string | null {
  const method = nullableString(expression.childProcessRuntimeMethod)

  if (expression.type !== 'CallExpression' || method === null || typeof method === 'undefined') {
    return null
  }

  return method
}
