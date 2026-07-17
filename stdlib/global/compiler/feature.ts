import type { CompilerFeatureDescriptor } from '../../../compiler/features/types.ts'
import type { AnyNode, IrFeature } from '../../../compiler/types.ts'
import {
  arrayPopNullFeature,
  collectArrayPopNullIrFeatures
} from '../collections/compiler/feature.ts'

export const globalStdlibFeatures: CompilerFeatureDescriptor[] = [
  arrayPopNullFeature
]

export function collectGlobalStdlibIrFeatures(node: AnyNode, features: Set<IrFeature>): void {
  collectArrayPopNullIrFeatures(node, features)
}

export function emitGlobalStdlibCPreludeHelpers(_featureName: IrFeature): string[] {
  return []
}
