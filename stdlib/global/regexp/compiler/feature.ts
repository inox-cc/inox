import type { CompilerFeatureDescriptor } from '../../../../compiler/features/types.ts'
import type { AnyNode, IrFeature, IrRuntimeRequirement } from '../../../../compiler/types.ts'

type RegExpFeatureSet = Set<IrFeature>

type RegExpFeatureNode = AnyNode & {
  regexpRuntimeMethod?: string | null
  type?: string | null
  valueType?: string | null
}

export const regexpFeatureId: IrFeature = 'regexp'
export const regexpFeatureRuntimeRequirements: IrRuntimeRequirement[] = []
export const regexpFeatureCPreludeIncludes: string[] = [
  '#include "inox/regexp.h"'
]
export const regexpFeature: CompilerFeatureDescriptor = {
  id: regexpFeatureId,
  runtimeRequirements: regexpFeatureRuntimeRequirements,
  cPreludeIncludes: regexpFeatureCPreludeIncludes,
  hasCPreludeHelpers: false
}

export function collectRegExpIrFeatures(node: AnyNode, features: RegExpFeatureSet): void {
  const item = node as RegExpFeatureNode

  if (item.type === 'RegExpLiteral' || item.valueType === 'regexp') {
    features.add('regexp')
  }

  if (item.regexpRuntimeMethod === 'test') {
    features.add('regexp')
    features.add('string-bytes')
  }
}

export function emitCRegExpFlags(flags: string | null | undefined): string {
  if (flags !== null && typeof flags !== 'undefined' && flags.includes('i')) {
    return 'REG_ICASE'
  }

  return '0'
}

export function emitCRegExpPreludeHelpers(): string[] {
  return []
}
