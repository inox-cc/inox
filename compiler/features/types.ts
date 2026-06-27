import type { AnyNode, IrFeature, IrRuntimeRequirement } from '../types.ts'

export type FeatureSet = Set<IrFeature>

export type CPreludeFeatureHooks = {
  includes?: string[]
  helpers?: Array<() => string[]>
}

export type CompilerFeature = {
  id: IrFeature
  runtimeRequirements?: IrRuntimeRequirement[]
  collectIrFeatures?: (node: AnyNode, features: FeatureSet) => void
  cPrelude?: CPreludeFeatureHooks
}
