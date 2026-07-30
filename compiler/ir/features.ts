import {
  compilerFeatureChildNodes,
  collectCompilerFeatureIrFeatures,
  compilerFeatureRuntimeRequirements,
  sortCompilerFeatures,
  sortCompilerRuntimeRequirements
} from '../features/index.ts'
import { addTypeRefRuntimeRequirements } from '../extensions/type-ref-runtime.ts'
import type { CompilerLibrarySet, TypeRef } from '../extensions/types.ts'
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

export function collectIrFeatureRequirements(programs: FeatureProgram[]): IrFeature[] {
  const features = createFeatureSet()

  for (let programIndex = 0; programIndex < programs.length; programIndex = programIndex + 1) {
    const program = programs[programIndex]

    for (let featureIndex = 0; featureIndex < program.features.length; featureIndex = featureIndex + 1) {
      const feature = program.features[featureIndex]

      features.add(feature)
    }
  }

  const result = sortCompilerFeatures(features)

  return result
}

export function collectRuntimeRequirements(
  features: IrFeature[],
  program: ProgramNode | null = null,
  libraries: CompilerLibrarySet | null = null
): IrRuntimeRequirement[] {
  const requirements = createRuntimeRequirementSet()

  for (let index = 0; index < features.length; index = index + 1) {
    const feature = features[index]
    const featureRequirements = compilerFeatureRuntimeRequirements(feature)

    if (featureRequirements !== null && typeof featureRequirements !== 'undefined') {
      addRuntimeRequirements(requirements, featureRequirements)
    }
  }

  if (program !== null) {
    visitRuntimeRequirementNode(program, requirements, libraries)
  }

  const result = sortCompilerRuntimeRequirements(requirements)

  return result
}

function visitRuntimeRequirementNode(
  node: FeatureRawNode | FeatureRawNode[] | null | undefined,
  requirements: IrRuntimeRequirementSet,
  libraries: CompilerLibrarySet | null
): void {
  if (node === null || typeof node === 'undefined') {
    return
  }

  if (Array.isArray(node)) {
    for (let index = 0; index < node.length; index = index + 1) {
      visitRuntimeRequirementNode(node[index], requirements, libraries)
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

  if (libraries !== null) {
    addTypeRefRuntimeRequirements(requirements, item.typeRef as TypeRef | null | undefined, libraries)
    addTypeRefRuntimeRequirements(requirements, item.returnTypeRef as TypeRef | null | undefined, libraries)
  }

  const featureChildren = compilerFeatureChildNodes(item)

  if (featureChildren !== null && typeof featureChildren !== 'undefined') {
    visitRuntimeRequirementNode(featureChildren, requirements, libraries)
    return
  }

  visitRuntimeRequirementChild(item.body, requirements, libraries)
  visitRuntimeRequirementChild(item.params, requirements, libraries)
  visitRuntimeRequirementChild(item.fields, requirements, libraries)
  visitRuntimeRequirementChild(item.methods, requirements, libraries)
  visitRuntimeRequirementChild(item.init, requirements, libraries)
  visitRuntimeRequirementChild(item.condition, requirements, libraries)
  visitRuntimeRequirementChild(item.consequent, requirements, libraries)
  visitRuntimeRequirementChild(item.alternate, requirements, libraries)
  visitRuntimeRequirementChild(item.test, requirements, libraries)
  visitRuntimeRequirementChild(item.update, requirements, libraries)
  visitRuntimeRequirementChild(item.iterable, requirements, libraries)
  visitRuntimeRequirementChild(item.discriminant, requirements, libraries)
  visitRuntimeRequirementChild(item.cases, requirements, libraries)
  visitRuntimeRequirementChild(item.block, requirements, libraries)
  visitRuntimeRequirementChild(item.handler, requirements, libraries)
  visitRuntimeRequirementChild(item.finalizer, requirements, libraries)
  visitRuntimeRequirementChild(item.argument, requirements, libraries)
  visitRuntimeRequirementChild(item.args, requirements, libraries)
  visitRuntimeRequirementChild(item.callee, requirements, libraries)
  visitRuntimeRequirementChild(item.object, requirements, libraries)
  visitRuntimeRequirementChild(item.index, requirements, libraries)
  visitRuntimeRequirementChild(item.target, requirements, libraries)
  visitRuntimeRequirementChild(item.value, requirements, libraries)
  visitRuntimeRequirementChild(item.left, requirements, libraries)
  visitRuntimeRequirementChild(item.right, requirements, libraries)
  visitRuntimeRequirementChild(item.elements, requirements, libraries)
  visitRuntimeRequirementChild(item.properties, requirements, libraries)
  visitRuntimeRequirementChild(item.expression, requirements, libraries)
  visitRuntimeRequirementChild(item.expressions, requirements, libraries)
}

function visitRuntimeRequirementChild(
  value: unknown,
  requirements: IrRuntimeRequirementSet,
  libraries: CompilerLibrarySet | null
): void {
  if (value === null || typeof value === 'undefined' || typeof value !== 'object') {
    return
  }

  visitRuntimeRequirementNode(value as AnyNode, requirements, libraries)
}

export function collectIrRuntimeRequirements(programs: RuntimeRequirementProgram[]): IrRuntimeRequirement[] {
  const requirements = createRuntimeRequirementSet()

  for (let programIndex = 0; programIndex < programs.length; programIndex = programIndex + 1) {
    const program = programs[programIndex]

    for (
      let requirementIndex = 0;
      requirementIndex < program.runtimeRequirements.length;
      requirementIndex = requirementIndex + 1
    ) {
      const requirement = program.runtimeRequirements[requirementIndex]

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
        const item = node[index]

        visitNode(item, features)
      }
      return
    }

    const item: FeatureNode = node

    collectCompilerFeatureIrFeatures(item, features)

    const featureChildren = compilerFeatureChildNodes(item)

    if (featureChildren !== null && typeof featureChildren !== 'undefined') {
      for (let childIndex = 0; childIndex < featureChildren.length; childIndex = childIndex + 1) {
        visitNode(featureChildren[childIndex], features)
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
