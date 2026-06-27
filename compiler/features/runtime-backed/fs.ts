import { memberExpressionPath } from '../../member-paths.ts'
import { fsRuntimeMethodForPath } from '../../stdlib/descriptors/fs.ts'
import type { AnyNode, IrFeature } from '../../types.ts'
import type { CompilerFeatureDescriptor } from '../types.ts'
import { hasStringValue, nullableString } from './common.ts'
import type { RuntimeBackedFeatureNode } from './common.ts'

export const fsFeature: CompilerFeatureDescriptor = {
  id: 'fs',
  runtimeRequirements: ['async-runtime', 'collections', 'fs', 'managed-values'],
  cPreludeIncludes: [],
  cPreludeHelpers: [],
  collect: collectFsIrFeatures
}

export function collectFsIrFeatures(node: AnyNode, features: Set<IrFeature>): void {
  const item = node as RuntimeBackedFeatureNode

  if (item.type === 'MemberExpression' && hasStringValue(item.fsRuntimeConstant)) {
    features.add('fs')
  }

  if (!fsRuntimeMethodName(item)) {
    return
  }

  features.add('fs')
}

function fsRuntimeMethodName(expression: RuntimeBackedFeatureNode): string | null {
  const method = nullableString(expression.fsRuntimeMethod)

  if (expression.type !== 'CallExpression') {
    return null
  }

  if (method !== null && typeof method !== 'undefined') {
    return method
  }

  return fsRuntimeMethodForPath(memberExpressionPath(expression.callee))
}
