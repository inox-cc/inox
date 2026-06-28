import type { CompilerFeatureDescriptor } from '../../../compiler/features/types.ts'
import type { AnyNode, IrFeature } from '../../../compiler/types.ts'
import {
  collectNumberFromStringNullIrFeatures,
  collectNumericCastsIrFeatures,
  numberFromStringNullFeature,
  numericCastsFeature
} from '../conversions/compiler/feature.ts'
import { collectJsonIrFeatures, jsonFeature } from '../json/compiler/feature.ts'
import { collectRegExpIrFeatures, emitCRegExpPreludeHelpers, regexpFeature } from '../regexp/compiler/feature.ts'
import { clocksFeature, collectClocksIrFeatures } from '../time/compiler/feature.ts'

export { emitCRegExpFlags } from '../regexp/compiler/feature.ts'

export const globalStdlibFeatures: CompilerFeatureDescriptor[] = [
  clocksFeature,
  jsonFeature,
  numberFromStringNullFeature,
  numericCastsFeature,
  regexpFeature
]

export function collectGlobalStdlibIrFeatures(node: AnyNode, features: Set<IrFeature>): void {
  collectClocksIrFeatures(node, features)
  collectJsonIrFeatures(node, features)
  collectNumberFromStringNullIrFeatures(node, features)
  collectNumericCastsIrFeatures(node, features)
  collectRegExpIrFeatures(node, features)
}

export function emitGlobalStdlibCPreludeHelpers(featureName: IrFeature): string[] {
  if (featureName === 'regexp') {
    return emitCRegExpPreludeHelpers()
  }

  return []
}
