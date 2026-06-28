import { memberExpressionPath } from '../../../../compiler/member-paths.ts'
import { fsRuntimeMethodForPath } from './descriptor.ts'
import type { AnyNode, IrFeature } from '../../../../compiler/types.ts'
import type { CompilerFeatureDescriptor } from '../../../../compiler/features/types.ts'
import { hasStringValue, nullableString } from '../../../../compiler/ir/node-utils.ts'

type FsFeatureNode = AnyNode & {
  callee?: AnyNode | null
  fsRuntimeConstant?: string | null
  fsRuntimeMethod?: string | null
  type?: string | null
}

export const fsFeature: CompilerFeatureDescriptor = {
  id: 'fs',
  runtimeRequirements: ['async-runtime', 'collections', 'fs', 'managed-values'],
  cPreludeIncludes: [],
  hasCPreludeHelpers: false
}

export function collectFsIrFeatures(node: AnyNode, features: Set<IrFeature>): void {
  const item = node as FsFeatureNode

  if (item.type === 'MemberExpression' && hasStringValue(item.fsRuntimeConstant)) {
    features.add('fs')
  }

  if (!fsRuntimeMethodName(item)) {
    return
  }

  features.add('fs')
}

function fsRuntimeMethodName(expression: FsFeatureNode): string | null {
  const method = nullableString(expression.fsRuntimeMethod)

  if (expression.type !== 'CallExpression') {
    return null
  }

  if (method !== null && typeof method !== 'undefined') {
    return method
  }

  return fsRuntimeMethodForPath(memberExpressionPath(expression.callee))
}
