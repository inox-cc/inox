import type { AnyNode, IrFeature, IrRuntimeRequirement } from '../../types.ts'
import type { CompilerFeatureDescriptor } from '../types.ts'

type ArrayPopNullFeatureSet = Set<IrFeature>
type ArrayPopNullCPreludeHelper = () => string[]

type ArrayPopNullReceiverNode = AnyNode & {
  valueType?: string | null
}

type ArrayPopNullCalleeNode = AnyNode & {
  object?: ArrayPopNullReceiverNode | null
  property?: string | null
  type?: string | null
}

type ArrayPopNullFeatureNode = AnyNode & {
  callee?: ArrayPopNullCalleeNode | null
  type?: string | null
}

export const arrayPopNullFeatureId: IrFeature = 'array-pop-null'
export const arrayPopNullFeatureRuntimeRequirements: IrRuntimeRequirement[] = []
export const arrayPopNullFeatureCPreludeIncludes: string[] = []
export const arrayPopNullFeatureCPreludeHelpers: ArrayPopNullCPreludeHelper[] = []
export const arrayPopNullFeature: CompilerFeatureDescriptor = {
  id: arrayPopNullFeatureId,
  runtimeRequirements: arrayPopNullFeatureRuntimeRequirements,
  cPreludeIncludes: arrayPopNullFeatureCPreludeIncludes,
  cPreludeHelpers: arrayPopNullFeatureCPreludeHelpers,
  collect: collectArrayPopNullIrFeatures
}

export function collectArrayPopNullIrFeatures(node: AnyNode, features: ArrayPopNullFeatureSet): void {
  const item = node as ArrayPopNullFeatureNode

  if (!isArrayPopCall(item)) {
    return
  }

  features.add('array-pop-null')
}

function isArrayPopCall(node: ArrayPopNullFeatureNode): boolean {
  if (
    node.type !== 'CallExpression' &&
    node.type !== 'OptionalCallExpression' &&
    node.type !== 'NewExpression'
  ) {
    return false
  }

  const callee = node.callee

  if (callee === null || typeof callee === 'undefined' || callee.type !== 'MemberExpression') {
    return false
  }

  if (callee.property !== 'pop') {
    return false
  }

  const object = callee.object

  return object !== null && typeof object !== 'undefined' && object.valueType === 'array'
}
