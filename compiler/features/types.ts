import type { AnyNode, IrFeature, IrRuntimeRequirement } from '../types.ts'

export type CompilerFeatureHelperEmitter = () => string[]
export type CompilerFeatureSet = Set<IrFeature>

export type CompilerFeatureDescriptor = {
  id: IrFeature
  runtimeRequirements: IrRuntimeRequirement[]
  cPreludeIncludes: string[]
  cPreludeHelpers: CompilerFeatureHelperEmitter[]
  collect: (node: AnyNode, features: CompilerFeatureSet) => void
}
