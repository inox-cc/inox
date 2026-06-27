import type { AnyNode, IrFeature, IrRuntimeRequirement } from '../../types.ts'
import type { CompilerFeatureDescriptor } from '../types.ts'

type MapAccessFeatureSet = Set<IrFeature>
type MapAccessCPreludeHelper = () => string[]

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

export const mapGetNullFeatureId: IrFeature = 'map-get-null'
export const mapIndexSetFeatureId: IrFeature = 'map-index-set'

export const mapGetNullFeatureRuntimeRequirements: IrRuntimeRequirement[] = []
export const mapIndexSetFeatureRuntimeRequirements: IrRuntimeRequirement[] = []

export const mapGetNullFeatureCPreludeIncludes: string[] = []
export const mapIndexSetFeatureCPreludeIncludes: string[] = []

export const mapGetNullFeatureCPreludeHelpers: MapAccessCPreludeHelper[] = []
export const mapIndexSetFeatureCPreludeHelpers: MapAccessCPreludeHelper[] = []
export const mapGetNullFeature: CompilerFeatureDescriptor = {
  id: mapGetNullFeatureId,
  runtimeRequirements: mapGetNullFeatureRuntimeRequirements,
  cPreludeIncludes: mapGetNullFeatureCPreludeIncludes,
  cPreludeHelpers: mapGetNullFeatureCPreludeHelpers,
  collect: collectMapGetNullIrFeatures
}
export const mapIndexSetFeature: CompilerFeatureDescriptor = {
  id: mapIndexSetFeatureId,
  runtimeRequirements: mapIndexSetFeatureRuntimeRequirements,
  cPreludeIncludes: mapIndexSetFeatureCPreludeIncludes,
  cPreludeHelpers: mapIndexSetFeatureCPreludeHelpers,
  collect: collectMapIndexSetIrFeatures
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

function isNullableMapRead(node: MapAccessFeatureNode): boolean {
  if (node.type === 'IndexExpression' && node.collectionKind === 'map' && node.nullable === true) {
    return true
  }

  if (
    node.type !== 'CallExpression' &&
    node.type !== 'OptionalCallExpression' &&
    node.type !== 'NewExpression'
  ) {
    return false
  }

  if (node.nullable !== true) {
    return false
  }

  const callee = node.callee

  return (
    callee !== null &&
    typeof callee !== 'undefined' &&
    callee.type === 'MemberExpression' &&
    callee.property === 'get'
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
