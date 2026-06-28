import type { AnyNode, IrFeature } from '../../../../compiler/types.ts'
import type { CompilerFeatureDescriptor } from '../../../../compiler/features/types.ts'
import { hasStringValue } from '../../../../compiler/features/runtime-backed/common.ts'
import type { RuntimeBackedFeatureNode } from '../../../../compiler/features/runtime-backed/common.ts'

export const osFeature: CompilerFeatureDescriptor = {
  id: 'os',
  runtimeRequirements: ['managed-values', 'os', 'string-bytes'],
  cPreludeIncludes: [],
  hasCPreludeHelpers: false
}

export function collectOsIrFeatures(node: AnyNode, features: Set<IrFeature>): void {
  const item = node as RuntimeBackedFeatureNode

  if (!hasStringValue(item.osRuntimeMethod) && !hasStringValue(item.osRuntimeConstant)) {
    return
  }

  features.add('os')
  features.add('runtime-values')
}
