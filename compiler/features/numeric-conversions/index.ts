import type { AnyNode, IrFeature, IrRuntimeRequirement } from '../../types.ts'

type NumericConversionFeatureSet = Set<IrFeature>
type NumericConversionCPreludeHelper = () => string[]

type NumericConversionCalleeNode = AnyNode & {
  path?: string[] | null
  type?: string | null
}

type NumericConversionFeatureNode = AnyNode & {
  callee?: NumericConversionCalleeNode | null
  type?: string | null
}

export const numberFromStringNullFeatureId: IrFeature = 'number-from-string-null'
export const numericCastsFeatureId: IrFeature = 'numeric-casts'

export const numberFromStringNullFeatureRuntimeRequirements: IrRuntimeRequirement[] = []
export const numericCastsFeatureRuntimeRequirements: IrRuntimeRequirement[] = []

export const numberFromStringNullFeatureCPreludeIncludes: string[] = []
export const numericCastsFeatureCPreludeIncludes: string[] = []

export const numberFromStringNullFeatureCPreludeHelpers: NumericConversionCPreludeHelper[] = []
export const numericCastsFeatureCPreludeHelpers: NumericConversionCPreludeHelper[] = []

export function collectNumberFromStringNullIrFeatures(
  node: AnyNode,
  features: NumericConversionFeatureSet
): void {
  const item = node as NumericConversionFeatureNode

  if (!isNumberConversionCall(item)) {
    return
  }

  features.add('number-from-string-null')
}

export function collectNumericCastsIrFeatures(node: AnyNode, features: NumericConversionFeatureSet): void {
  const item = node as NumericConversionFeatureNode

  if (!isNumericCastCall(item)) {
    return
  }

  features.add('numeric-casts')
}

function isNumberConversionCall(node: NumericConversionFeatureNode): boolean {
  return referenceCallName(node) === 'Number'
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
  return (
    node.type === 'CallExpression' ||
    node.type === 'OptionalCallExpression' ||
    node.type === 'NewExpression'
  )
}

function isNumericCastName(name: string | null): boolean {
  return name === 'i32' || name === 'u32' || name === 'u64' || name === 'f32' || name === 'f64'
}
