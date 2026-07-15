import type { CompilerFeatureDescriptor } from '../../../../compiler/features/types.ts'
import type { AnyNode, IrFeature, IrRuntimeRequirement } from '../../../../compiler/types.ts'
import { isNumericCastName } from './descriptor.ts'

type NumericConversionFeatureSet = Set<IrFeature>

type NumericConversionCalleeNode = AnyNode & {
  path?: string[] | null
  type?: string | null
}

type NumericConversionFeatureNode = AnyNode & {
  callee?: NumericConversionCalleeNode | null
  type?: string | null
}

export const numericCastsFeatureId: IrFeature = 'numeric-casts'

export const numericCastsFeatureRuntimeRequirements: IrRuntimeRequirement[] = []

export const numericCastsFeatureCPreludeIncludes: string[] = []

export const numericCastsFeature: CompilerFeatureDescriptor = {
  id: numericCastsFeatureId,
  runtimeRequirements: numericCastsFeatureRuntimeRequirements,
  cPreludeIncludes: numericCastsFeatureCPreludeIncludes,
  hasCPreludeHelpers: false
}

export function collectNumericCastsIrFeatures(node: AnyNode, features: NumericConversionFeatureSet): void {
  const item = node as NumericConversionFeatureNode

  if (!isNumericCastCall(item)) {
    return
  }

  features.add('numeric-casts')
}

function isNumericCastCall(node: NumericConversionFeatureNode): boolean {
  return isNumericCastName(referenceCallName(node))
}

function referenceCallName(node: NumericConversionFeatureNode): string | null {
  if (!isCallLikeNode(node)) {
    return null
  }

  const callee = node.callee

  if (callee === null || typeof callee === 'undefined' || callee.type !== 'Reference') {
    return null
  }

  const path = callee.path

  if (path === null || typeof path === 'undefined' || path.length !== 1) {
    return null
  }

  return path[0]
}

function isCallLikeNode(node: NumericConversionFeatureNode): boolean {
  return node.type === 'CallExpression' || node.type === 'OptionalCallExpression' || node.type === 'NewExpression'
}
