import type { CompilerFeatureDescriptor } from '../../../compiler/features/types.ts'
import type { AnyNode, IrFeature } from '../../../compiler/types.ts'
import {
  arrayPopNullFeature,
  collectArrayPopNullIrFeatures,
  collectMapGetNullIrFeatures,
  collectMapIndexSetIrFeatures,
  mapGetNullFeature,
  mapIndexSetFeature
} from '../collections/compiler/feature.ts'
import {
  collectNumberFromStringNullIrFeatures,
  collectNumericCastsIrFeatures,
  numberFromStringNullFeature,
  numericCastsFeature
} from '../conversions/compiler/feature.ts'
import { collectJsonIrFeatures, jsonFeature } from '../json/compiler/feature.ts'

export const globalStdlibFeatures: CompilerFeatureDescriptor[] = [
  arrayPopNullFeature,
  jsonFeature,
  mapGetNullFeature,
  mapIndexSetFeature,
  numberFromStringNullFeature,
  numericCastsFeature
]

export function collectGlobalStdlibIrFeatures(node: AnyNode, features: Set<IrFeature>): void {
  collectArrayPopNullIrFeatures(node, features)
  collectJsonIrFeatures(node, features)
  collectMapGetNullIrFeatures(node, features)
  collectMapIndexSetIrFeatures(node, features)
  collectNumberFromStringNullIrFeatures(node, features)
  collectNumericCastsIrFeatures(node, features)
}

export function emitGlobalStdlibCPreludeHelpers(_featureName: IrFeature): string[] {
  return []
}
