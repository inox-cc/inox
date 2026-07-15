import type { CompilerFeatureDescriptor } from '../../../../compiler/features/types.ts'
import type { AnyNode, IrFeature, IrRuntimeRequirement } from '../../../../compiler/types.ts'

type ArrayPopNullFeatureSet = Set<IrFeature>

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

type MapAccessFeatureSet = Set<IrFeature>

type MapAccessCalleeNode = AnyNode & {
  property?: string | null
  type?: string | null
}

type MapAccessIndexTargetNode = AnyNode & {
  collectionKind?: string | null
  type?: string | null
}

type MapAccessFeatureNode = AnyNode & {
  callee?: MapAccessCalleeNode | null
  collectionKind?: string | null
  nullable?: boolean
  target?: MapAccessIndexTargetNode | null
  type?: string | null
}

export const arrayPopNullFeatureId: IrFeature = 'array-pop-null'
export const mapGetNullFeatureId: IrFeature = 'map-get-null'
export const mapIndexSetFeatureId: IrFeature = 'map-index-set'

export const arrayPopNullFeatureRuntimeRequirements: IrRuntimeRequirement[] = []
export const mapGetNullFeatureRuntimeRequirements: IrRuntimeRequirement[] = []
export const mapIndexSetFeatureRuntimeRequirements: IrRuntimeRequirement[] = []

export const arrayPopNullFeatureCPreludeIncludes: string[] = []
export const mapGetNullFeatureCPreludeIncludes: string[] = []
export const mapIndexSetFeatureCPreludeIncludes: string[] = []

export const arrayPopNullFeature: CompilerFeatureDescriptor = {
  id: arrayPopNullFeatureId,
  runtimeRequirements: arrayPopNullFeatureRuntimeRequirements,
  cPreludeIncludes: arrayPopNullFeatureCPreludeIncludes,
  hasCPreludeHelpers: false
}
export const mapGetNullFeature: CompilerFeatureDescriptor = {
  id: mapGetNullFeatureId,
  runtimeRequirements: mapGetNullFeatureRuntimeRequirements,
  cPreludeIncludes: mapGetNullFeatureCPreludeIncludes,
  hasCPreludeHelpers: false
}
export const mapIndexSetFeature: CompilerFeatureDescriptor = {
  id: mapIndexSetFeatureId,
  runtimeRequirements: mapIndexSetFeatureRuntimeRequirements,
  cPreludeIncludes: mapIndexSetFeatureCPreludeIncludes,
  hasCPreludeHelpers: false
}

export function collectArrayPopNullIrFeatures(node: AnyNode, features: ArrayPopNullFeatureSet): void {
  const item = node as ArrayPopNullFeatureNode

  if (!isArrayPopCall(item)) {
    return
  }

  features.add('array-pop-null')
}

export function collectMapGetNullIrFeatures(node: AnyNode, features: MapAccessFeatureSet): void {
  const item = node as MapAccessFeatureNode

  if (!isNullableMapRead(item)) {
    return
  }

  features.add('map-get-null')
}

export function collectMapIndexSetIrFeatures(node: AnyNode, features: MapAccessFeatureSet): void {
  const item = node as MapAccessFeatureNode

  if (!isMapIndexAssignment(item)) {
    return
  }

  features.add('map-index-set')
}

function isArrayPopCall(node: ArrayPopNullFeatureNode): boolean {
  if (node.type !== 'CallExpression' && node.type !== 'OptionalCallExpression' && node.type !== 'NewExpression') {
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

function isNullableMapRead(node: MapAccessFeatureNode): boolean {
  if (node.type === 'IndexExpression' && node.collectionKind === 'map' && node.nullable === true) {
    return true
  }

  if (node.type !== 'CallExpression' && node.type !== 'OptionalCallExpression' && node.type !== 'NewExpression') {
    return false
  }

  if (node.nullable !== true) {
    return false
  }

  const callee = node.callee

  return (
    callee !== null && typeof callee !== 'undefined' && callee.type === 'MemberExpression' && callee.property === 'get'
  )
}

function isMapIndexAssignment(node: MapAccessFeatureNode): boolean {
  if (node.type !== 'AssignmentExpression') {
    return false
  }

  const target = node.target

  return (
    target !== null &&
    typeof target !== 'undefined' &&
    target.type === 'IndexExpression' &&
    target.collectionKind === 'map'
  )
}
