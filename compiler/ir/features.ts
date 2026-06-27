import {
  compilerFeatureChildNodes,
  collectCompilerFeatureIrFeatures,
  compilerFeatureRuntimeRequirements
} from '../features/index.ts'
import type { AnyNode, IrFeature, IrRuntimeRequirement, IrSyntaxFeatureUsage, ProgramNode } from '../types.ts'

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
type SyntaxFeatureProgram = {
  syntaxFeatures: IrSyntaxFeatureUsage[]
}

export function collectIrFeatures(program: ProgramNode): IrFeature[] {
  const features = createFeatureSet()

  visitNode(program, features)

  const result = sortedIrFeatures(features)

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

function syntaxFeatureProgramAt(programs: SyntaxFeatureProgram[], index: number): SyntaxFeatureProgram {
  return programs[index]
}

function syntaxFeatureUsageAt(usages: IrSyntaxFeatureUsage[], index: number): IrSyntaxFeatureUsage {
  return usages[index]
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

  const result = sortedIrFeatures(features)

  return result
}

export function collectRuntimeRequirements(features: IrFeature[]): IrRuntimeRequirement[] {
  const requirements = createRuntimeRequirementSet()

  for (let index = 0; index < features.length; index = index + 1) {
    const feature = irFeatureAt(features, index)
    const featureRequirements = compilerFeatureRuntimeRequirements(feature)

    if (featureRequirements !== null && typeof featureRequirements !== 'undefined') {
      addRuntimeRequirements(requirements, featureRequirements)
    }
  }

  const result = sortedRuntimeRequirements(requirements)

  return result
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

  const result = sortedRuntimeRequirements(requirements)

  return result
}

export function collectSyntaxFeatureUsages(program: ProgramNode): IrSyntaxFeatureUsage[] {
  const usages: IrSyntaxFeatureUsage[] = []

  visitSyntaxFeatureUsage(program, usages)

  return usages
}

export function collectIrSyntaxFeatureUsages(programs: SyntaxFeatureProgram[]): IrSyntaxFeatureUsage[] {
  const usages: IrSyntaxFeatureUsage[] = []

  for (let programIndex = 0; programIndex < programs.length; programIndex = programIndex + 1) {
    const program = syntaxFeatureProgramAt(programs, programIndex)

    for (let usageIndex = 0; usageIndex < program.syntaxFeatures.length; usageIndex = usageIndex + 1) {
      const usage = syntaxFeatureUsageAt(program.syntaxFeatures, usageIndex)

      usages.push(usage)
    }
  }

  return usages
}

function sortedIrFeatures(features: IrFeatureSet): IrFeature[] {
  const result: IrFeature[] = []

  pushIrFeatureIfPresent(features, result, 'array-pop-null')
  pushIrFeatureIfPresent(features, result, 'async-runtime')
  pushIrFeatureIfPresent(features, result, 'binary')
  pushIrFeatureIfPresent(features, result, 'callback-values')
  pushIrFeatureIfPresent(features, result, 'child-process')
  pushIrFeatureIfPresent(features, result, 'clocks')
  pushIrFeatureIfPresent(features, result, 'collections')
  pushIrFeatureIfPresent(features, result, 'crypto')
  pushIrFeatureIfPresent(features, result, 'debug-memory')
  pushIrFeatureIfPresent(features, result, 'fs')
  pushIrFeatureIfPresent(features, result, 'json')
  pushIrFeatureIfPresent(features, result, 'map-get-null')
  pushIrFeatureIfPresent(features, result, 'map-index-set')
  pushIrFeatureIfPresent(features, result, 'number-from-string-null')
  pushIrFeatureIfPresent(features, result, 'numeric-casts')
  pushIrFeatureIfPresent(features, result, 'objects')
  pushIrFeatureIfPresent(features, result, 'os')
  pushIrFeatureIfPresent(features, result, 'path')
  pushIrFeatureIfPresent(features, result, 'process')
  pushIrFeatureIfPresent(features, result, 'regexp')
  pushIrFeatureIfPresent(features, result, 'runtime-values')
  pushIrFeatureIfPresent(features, result, 'string-bytes')
  pushIrFeatureIfPresent(features, result, 'timers')
  pushIrFeatureIfPresent(features, result, 'url')
  pushIrFeatureIfPresent(features, result, 'weak-references')

  return result
}

function sortedRuntimeRequirements(requirements: IrRuntimeRequirementSet): IrRuntimeRequirement[] {
  const result: IrRuntimeRequirement[] = []

  pushRuntimeRequirementIfPresent(requirements, result, 'async-runtime')
  pushRuntimeRequirementIfPresent(requirements, result, 'binary')
  pushRuntimeRequirementIfPresent(requirements, result, 'callback-values')
  pushRuntimeRequirementIfPresent(requirements, result, 'child-process')
  pushRuntimeRequirementIfPresent(requirements, result, 'clocks')
  pushRuntimeRequirementIfPresent(requirements, result, 'collections')
  pushRuntimeRequirementIfPresent(requirements, result, 'crypto')
  pushRuntimeRequirementIfPresent(requirements, result, 'debug-memory')
  pushRuntimeRequirementIfPresent(requirements, result, 'fs')
  pushRuntimeRequirementIfPresent(requirements, result, 'json')
  pushRuntimeRequirementIfPresent(requirements, result, 'managed-values')
  pushRuntimeRequirementIfPresent(requirements, result, 'objects')
  pushRuntimeRequirementIfPresent(requirements, result, 'os')
  pushRuntimeRequirementIfPresent(requirements, result, 'path')
  pushRuntimeRequirementIfPresent(requirements, result, 'process')
  pushRuntimeRequirementIfPresent(requirements, result, 'string-bytes')
  pushRuntimeRequirementIfPresent(requirements, result, 'timers')
  pushRuntimeRequirementIfPresent(requirements, result, 'url')
  pushRuntimeRequirementIfPresent(requirements, result, 'weak-references')

  return result
}

function pushIrFeatureIfPresent(features: IrFeatureSet, result: IrFeature[], feature: IrFeature): void {
  if (features.has(feature)) {
    result.push(feature)
  }
}

function pushRuntimeRequirementIfPresent(
  requirements: IrRuntimeRequirementSet,
  result: IrRuntimeRequirement[],
  requirement: IrRuntimeRequirement
): void {
  if (requirements.has(requirement)) {
    result.push(requirement)
  }
}

function createFeatureSet(): IrFeatureSet {
  return new Set()
}

function createRuntimeRequirementSet(): IrRuntimeRequirementSet {
  return new Set()
}

function visitSyntaxFeatureUsage(
  node: FeatureRawNode | FeatureRawNode[] | null | undefined,
  usages: IrSyntaxFeatureUsage[]
): void {
  if (node !== null && typeof node !== 'undefined') {
    if (Array.isArray(node)) {
      for (let index = 0; index < node.length; index = index + 1) {
        const item = featureArrayNodeAt(node, index)

        visitSyntaxFeatureUsage(item, usages)
      }
      return
    }

    const item: FeatureNode = node

    if (item.type === 'ClassDeclaration') {
      usages.push({
        feature: 'class',
        loc: item.loc
      })
    } else if (item.type === 'FunctionDeclaration' && item.async === true) {
      usages.push({
        feature: 'async-function',
        loc: item.loc
      })
    }

    visitSyntaxFeatureChildren(item, usages)
  }
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

function visitSyntaxFeatureChild(value: unknown, usages: IrSyntaxFeatureUsage[]): void {
  if (value === null || typeof value === 'undefined' || typeof value !== 'object') {
    return
  }

  visitSyntaxFeatureUsage(value as AnyNode, usages)
}

function visitSyntaxFeatureChildren(item: ChildNode, usages: IrSyntaxFeatureUsage[]): void {
  visitSyntaxFeatureChild(item.body, usages)
  visitSyntaxFeatureChild(item.params, usages)
  visitSyntaxFeatureChild(item.fields, usages)
  visitSyntaxFeatureChild(item.methods, usages)
  visitSyntaxFeatureChild(item.init, usages)
  visitSyntaxFeatureChild(item.condition, usages)
  visitSyntaxFeatureChild(item.consequent, usages)
  visitSyntaxFeatureChild(item.alternate, usages)
  visitSyntaxFeatureChild(item.test, usages)
  visitSyntaxFeatureChild(item.update, usages)
  visitSyntaxFeatureChild(item.iterable, usages)
  visitSyntaxFeatureChild(item.discriminant, usages)
  visitSyntaxFeatureChild(item.cases, usages)
  visitSyntaxFeatureChild(item.block, usages)
  visitSyntaxFeatureChild(item.handler, usages)
  visitSyntaxFeatureChild(item.finalizer, usages)
  visitSyntaxFeatureChild(item.argument, usages)
  visitSyntaxFeatureChild(item.args, usages)
  visitSyntaxFeatureChild(item.callee, usages)
  visitSyntaxFeatureChild(item.object, usages)
  visitSyntaxFeatureChild(item.index, usages)
  visitSyntaxFeatureChild(item.target, usages)
  visitSyntaxFeatureChild(item.value, usages)
  visitSyntaxFeatureChild(item.valueType, usages)
  visitSyntaxFeatureChild(item.functionType, usages)
  visitSyntaxFeatureChild(item.returnShape, usages)
  visitSyntaxFeatureChild(item.left, usages)
  visitSyntaxFeatureChild(item.right, usages)
  visitSyntaxFeatureChild(item.elements, usages)
  visitSyntaxFeatureChild(item.properties, usages)
  visitSyntaxFeatureChild(item.expression, usages)
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
}

function addRuntimeRequirements(requirements: IrRuntimeRequirementSet, values: IrRuntimeRequirement[]): void {
  for (let index = 0; index < values.length; index = index + 1) {
    requirements.add(values[index])
  }
}
