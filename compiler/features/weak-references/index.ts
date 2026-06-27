import type { AnyNode, IrFeature, IrRuntimeRequirement } from '../../types.ts'
import type { CompilerFeatureDescriptor } from '../types.ts'

type WeakReferencesFeatureSet = Set<IrFeature>

type WeakReferencesFeatureNode = AnyNode & {
  ownership?: string | null
}

export const weakReferencesFeatureId: IrFeature = 'weak-references'
export const weakReferencesFeatureRuntimeRequirements: IrRuntimeRequirement[] = [
  'managed-values',
  'objects',
  'weak-references'
]
export const weakReferencesFeatureCPreludeIncludes: string[] = []
export const weakReferencesFeatureCPreludeHelpers: (() => string[])[] = []
export const weakReferencesFeature: CompilerFeatureDescriptor = {
  id: weakReferencesFeatureId,
  runtimeRequirements: weakReferencesFeatureRuntimeRequirements,
  cPreludeIncludes: weakReferencesFeatureCPreludeIncludes,
  cPreludeHelpers: weakReferencesFeatureCPreludeHelpers,
  collect: collectWeakReferencesIrFeatures
}

export function collectWeakReferencesIrFeatures(node: AnyNode, features: WeakReferencesFeatureSet): void {
  const item = node as WeakReferencesFeatureNode

  if (item.ownership !== 'weak') {
    return
  }

  features.add('runtime-values')
  features.add('objects')
  features.add('weak-references')
}
