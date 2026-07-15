import {
  compilerFeatureChildNodes,
  collectCompilerFeatureIrFeatures,
  compilerFeatureRuntimeRequirements,
  sortCompilerFeatures,
  sortCompilerRuntimeRequirements
} from '../features/index.ts'
import type { AnyNode, IrFeature, IrRuntimeRequirement, ProgramNode } from '../types.ts'

type FeatureRawNode = AnyNode
type FeatureNode = AnyNode & {
  type?: string
}
type ChildNode = FeatureNode
type FeatureProgram = {
  features: IrFeature[]
}
type IrFeatureSet = Set<IrFeature>
type RuntimeRequirementProgram = {
  runtimeRequirements: IrRuntimeRequirement[]
}
type IrRuntimeRequirementSet = Set<IrRuntimeRequirement>

export function collectIrFeatures(program: ProgramNode): IrFeature[] {
  const features = createFeatureSet()

  visitNode(program, features)

  const result = sortCompilerFeatures(features)

  return result
}

function featureProgramAt(programs: FeatureProgram[], index: number): FeatureProgram {
  return programs[index]
}

function irFeatureAt(features: IrFeature[], index: number): IrFeature {
  return features[index]
}

function runtimeRequirementProgramAt(programs: RuntimeRequirementProgram[], index: number): RuntimeRequirementProgram {
  return programs[index]
}

function runtimeRequirementAt(requirements: IrRuntimeRequirement[], index: number): IrRuntimeRequirement {
  return requirements[index]
}

function featureArrayNodeAt(nodes: FeatureRawNode[], index: number): FeatureRawNode {
  return nodes[index]
}

export function collectIrFeatureRequirements(programs: FeatureProgram[]): IrFeature[] {
  const features = createFeatureSet()

  for (let programIndex = 0; programIndex < programs.length; programIndex = programIndex + 1) {
    const program = featureProgramAt(programs, programIndex)

    for (let featureIndex = 0; featureIndex < program.features.length; featureIndex = featureIndex + 1) {
      const feature = irFeatureAt(program.features, featureIndex)

      features.add(feature)
    }
  }

  const result = sortCompilerFeatures(features)

  return result
}

export function collectRuntimeRequirements(
  features: IrFeature[],
  program: ProgramNode | null = null
): IrRuntimeRequirement[] {
  const requirements = createRuntimeRequirementSet()

  for (let index = 0; index < features.length; index = index + 1) {
    const feature = irFeatureAt(features, index)
    const featureRequirements = compilerFeatureRuntimeRequirements(feature)

    if (featureRequirements !== null && typeof featureRequirements !== 'undefined') {
      addRuntimeRequirements(requirements, featureRequirements)
    }
  }

  if (program !== null) {
    visitRuntimeRequirementNode(program, requirements)
  }

  const result = sortCompilerRuntimeRequirements(requirements)

  return result
}

function visitRuntimeRequirementNode(
  node: FeatureRawNode | FeatureRawNode[] | null | undefined,
  requirements: IrRuntimeRequirementSet
): void {
  if (node === null || typeof node === 'undefined') {
    return
  }

  if (Array.isArray(node)) {
    for (let index = 0; index < node.length; index = index + 1) {
      visitRuntimeRequirementNode(featureArrayNodeAt(node, index), requirements)
    }
    return
  }

  const item = node as FeatureNode
  const libraryRequirements: unknown = item.libraryRuntimeRequirements

  if (Array.isArray(libraryRequirements)) {
    for (let index = 0; index < libraryRequirements.length; index = index + 1) {
      requirements.add(libraryRequirements[index])
    }
  }

  const featureChildren = compilerFeatureChildNodes(item)

  if (featureChildren !== null && typeof featureChildren !== 'undefined') {
    visitRuntimeRequirementNode(featureChildren, requirements)
    return
  }

  visitRuntimeRequirementChild(item.body, requirements)
  visitRuntimeRequirementChild(item.params, requirements)
  visitRuntimeRequirementChild(item.fields, requirements)
  visitRuntimeRequirementChild(item.methods, requirements)
  visitRuntimeRequirementChild(item.init, requirements)
  visitRuntimeRequirementChild(item.condition, requirements)
  visitRuntimeRequirementChild(item.consequent, requirements)
  visitRuntimeRequirementChild(item.alternate, requirements)
  visitRuntimeRequirementChild(item.test, requirements)
  visitRuntimeRequirementChild(item.update, requirements)
  visitRuntimeRequirementChild(item.iterable, requirements)
  visitRuntimeRequirementChild(item.discriminant, requirements)
  visitRuntimeRequirementChild(item.cases, requirements)
  visitRuntimeRequirementChild(item.block, requirements)
  visitRuntimeRequirementChild(item.handler, requirements)
  visitRuntimeRequirementChild(item.finalizer, requirements)
  visitRuntimeRequirementChild(item.argument, requirements)
  visitRuntimeRequirementChild(item.args, requirements)
  visitRuntimeRequirementChild(item.callee, requirements)
  visitRuntimeRequirementChild(item.object, requirements)
  visitRuntimeRequirementChild(item.index, requirements)
  visitRuntimeRequirementChild(item.target, requirements)
  visitRuntimeRequirementChild(item.value, requirements)
  visitRuntimeRequirementChild(item.left, requirements)
  visitRuntimeRequirementChild(item.right, requirements)
  visitRuntimeRequirementChild(item.elements, requirements)
  visitRuntimeRequirementChild(item.properties, requirements)
  visitRuntimeRequirementChild(item.expression, requirements)
  visitRuntimeRequirementChild(item.expressions, requirements)
}

function visitRuntimeRequirementChild(value: unknown, requirements: IrRuntimeRequirementSet): void {
  if (value === null || typeof value === 'undefined' || typeof value !== 'object') {
    return
  }

  visitRuntimeRequirementNode(value as AnyNode, requirements)
}

export function collectIrRuntimeRequirements(programs: RuntimeRequirementProgram[]): IrRuntimeRequirement[] {
  const requirements = createRuntimeRequirementSet()

  for (let programIndex = 0; programIndex < programs.length; programIndex = programIndex + 1) {
    const program = runtimeRequirementProgramAt(programs, programIndex)

    for (
      let requirementIndex = 0;
      requirementIndex < program.runtimeRequirements.length;
      requirementIndex = requirementIndex + 1
    ) {
      const requirement = runtimeRequirementAt(program.runtimeRequirements, requirementIndex)

      requirements.add(requirement)
    }
  }

  const result = sortCompilerRuntimeRequirements(requirements)

  return result
}

function createFeatureSet(): IrFeatureSet {
  return new Set()
}

function createRuntimeRequirementSet(): IrRuntimeRequirementSet {
  return new Set()
}

function visitNode(node: FeatureRawNode | FeatureRawNode[] | null | undefined, features: IrFeatureSet): void {
  if (node !== null && typeof node !== 'undefined') {
    if (Array.isArray(node)) {
      for (let index = 0; index < node.length; index = index + 1) {
        const item = featureArrayNodeAt(node, index)

        visitNode(item, features)
      }
      return
    }

    const item: FeatureNode = node

    collectCompilerFeatureIrFeatures(item, features)

    const featureChildren = compilerFeatureChildNodes(item)

    if (featureChildren !== null && typeof featureChildren !== 'undefined') {
      for (let childIndex = 0; childIndex < featureChildren.length; childIndex = childIndex + 1) {
        visitNode(featureArrayNodeAt(featureChildren, childIndex), features)
      }

      return
    }

    visitFeatureChildren(item, features)
  }
}

function visitFeatureChild(value: unknown, features: IrFeatureSet): void {
  if (value === null || typeof value === 'undefined' || typeof value !== 'object') {
    return
  }

  visitNode(value as AnyNode, features)
}

function visitFeatureChildren(item: ChildNode, features: IrFeatureSet): void {
  visitFeatureChild(item.body, features)
  visitFeatureChild(item.params, features)
  visitFeatureChild(item.fields, features)
  visitFeatureChild(item.methods, features)
  visitFeatureChild(item.init, features)
  visitFeatureChild(item.condition, features)
  visitFeatureChild(item.consequent, features)
  visitFeatureChild(item.alternate, features)
  visitFeatureChild(item.test, features)
  visitFeatureChild(item.update, features)
  visitFeatureChild(item.iterable, features)
  visitFeatureChild(item.discriminant, features)
  visitFeatureChild(item.cases, features)
  visitFeatureChild(item.block, features)
  visitFeatureChild(item.handler, features)
  visitFeatureChild(item.finalizer, features)
  visitFeatureChild(item.argument, features)
  visitFeatureChild(item.args, features)
  visitFeatureChild(item.callee, features)
  visitFeatureChild(item.object, features)
  visitFeatureChild(item.index, features)
  visitFeatureChild(item.target, features)
  visitFeatureChild(item.value, features)
  visitFeatureChild(item.valueType, features)
  visitFeatureChild(item.functionType, features)
  visitFeatureChild(item.returnShape, features)
  visitFeatureChild(item.left, features)
  visitFeatureChild(item.right, features)
  visitFeatureChild(item.elements, features)
  visitFeatureChild(item.properties, features)
  visitFeatureChild(item.expression, features)
  visitFeatureChild(item.expressions, features)
}

function addRuntimeRequirements(requirements: IrRuntimeRequirementSet, values: IrRuntimeRequirement[]): void {
  for (let index = 0; index < values.length; index = index + 1) {
    requirements.add(values[index])
  }
}
