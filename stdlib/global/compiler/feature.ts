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
import { collectDebugMemoryIrFeatures, debugMemoryFeature } from '../debug/compiler/feature.ts'
import { collectJsonIrFeatures, jsonFeature } from '../json/compiler/feature.ts'
import { collectRegExpIrFeatures, emitCRegExpPreludeHelpers, regexpFeature } from '../regexp/compiler/feature.ts'
import { clocksFeature, collectClocksIrFeatures } from '../time/compiler/feature.ts'

export { emitCRegExpFlags } from '../regexp/compiler/feature.ts'

export const globalStdlibFeatures: CompilerFeatureDescriptor[] = [
  arrayPopNullFeature,
  clocksFeature,
  debugMemoryFeature,
  jsonFeature,
  mapGetNullFeature,
  mapIndexSetFeature,
  numberFromStringNullFeature,
  numericCastsFeature,
  regexpFeature
]

export function collectGlobalStdlibIrFeatures(node: AnyNode, features: Set<IrFeature>): void {
  collectArrayPopNullIrFeatures(node, features)
  collectClocksIrFeatures(node, features)
  collectDebugMemoryIrFeatures(node, features)
  collectJsonIrFeatures(node, features)
  collectMapGetNullIrFeatures(node, features)
  collectMapIndexSetIrFeatures(node, features)
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
