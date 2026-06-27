import type { IrFeature, IrRuntimeRequirement } from '../types.ts'

export type CompilerFeatureDescriptor = {
  id: IrFeature
  runtimeRequirements: IrRuntimeRequirement[]
  cPreludeIncludes: string[]
  hasCPreludeHelpers: boolean
}
