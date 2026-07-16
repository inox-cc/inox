import type { CompilerFeatureDescriptor } from '../../../compiler/features/types.ts'
import type { AnyNode, IrFeature } from '../../../compiler/types.ts'
import {
  arrayPopNullFeature,
  collectArrayPopNullIrFeatures
} from '../collections/compiler/feature.ts'
import { collectNumericCastsIrFeatures, numericCastsFeature } from '../conversions/compiler/feature.ts'

export const globalStdlibFeatures: CompilerFeatureDescriptor[] = [
  arrayPopNullFeature,
  numericCastsFeature
]

export function collectGlobalStdlibIrFeatures(node: AnyNode, features: Set<IrFeature>): void {
  collectArrayPopNullIrFeatures(node, features)
  collectNumericCastsIrFeatures(node, features)
}

export function emitGlobalStdlibCPreludeHelpers(_featureName: IrFeature): string[] {
  return []
}
