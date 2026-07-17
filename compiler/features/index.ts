import type { AnyNode, IrFeature, IrProgram, IrRuntimeRequirement } from '../types.ts'
import { collectCoreRuntimeIrFeatures, coreRuntimeFeatures } from './core-runtime/index.ts'
import type { CompilerFeatureDescriptor } from './types.ts'

const compilerFeatureDescriptorRows: CompilerFeatureDescriptor[][] = [
  coreRuntimeFeatures
]

const compilerFeatureDescriptors = createCompilerFeatureDescriptors()
const compilerFeatureOrder = createCompilerFeatureOrder()
const compilerRuntimeRequirementOrder = createCompilerRuntimeRequirementOrder()

export const compilerFeatures: IrFeature[] = copyCompilerFeatureOrder()

export function collectCompilerFeatureIrFeatures(node: unknown, features: Set<IrFeature>): void {
  if (node === null || typeof node === 'undefined' || typeof node !== 'object') {
    return
  }

  const featureNode = node as AnyNode

  collectCoreRuntimeIrFeatures(featureNode, features)
}

export function compilerFeatureChildNodes(node: unknown): AnyNode[] | null {
  if (node === null || typeof node === 'undefined' || typeof node !== 'object') {
    return null
  }

  return null
}

export function compilerFeatureRuntimeRequirements(featureName: IrFeature): IrRuntimeRequirement[] | null {
  const descriptor = findCompilerFeatureDescriptor(featureName)

  if (descriptor === null || typeof descriptor === 'undefined') {
    return null
  }

  return copyRuntimeRequirements(descriptor.runtimeRequirements)
}

export function irProgramsUseCPreludeFeature(programs: IrProgram[], featureName: IrFeature): boolean {
  if (!compilerFeatureHasCPrelude(featureName)) {
    return false
  }

  for (let programIndex = 0; programIndex < programs.length; programIndex = programIndex + 1) {
    const program = programs[programIndex]

    for (let featureIndex = 0; featureIndex < program.features.length; featureIndex = featureIndex + 1) {
      if (program.features[featureIndex] === featureName) {
        return true
      }
    }
  }

  return false
}

export function emitCompilerFeatureCPreludeIncludes(featureName: IrFeature): string[] {
  const descriptor = findCompilerFeatureDescriptor(featureName)

  if (descriptor === null || typeof descriptor === 'undefined') {
    return []
  }

  return copyStrings(descriptor.cPreludeIncludes)
}

export function emitCompilerFeatureCPreludeHelpers(_featureName: IrFeature): string[] {
  return []
}

export function sortCompilerFeatures(features: Set<IrFeature>): IrFeature[] {
  const result: IrFeature[] = []

  for (let index = 0; index < compilerFeatureOrder.length; index = index + 1) {
    const feature = compilerFeatureOrderAt(index)

    if (features.has(feature)) {
      result.push(feature)
    }
  }

  return result
}

export function sortCompilerRuntimeRequirements(requirements: Set<IrRuntimeRequirement>): IrRuntimeRequirement[] {
  const result: IrRuntimeRequirement[] = []
  const extensionRequirements: IrRuntimeRequirement[] = []

  for (let index = 0; index < compilerRuntimeRequirementOrder.length; index = index + 1) {
    const requirement = compilerRuntimeRequirementOrderAt(index)

    if (requirements.has(requirement)) {
      result.push(requirement)
    }
  }

  for (const requirement of requirements) {
    if (!compilerRuntimeRequirementOrderHas(requirement)) {
      insertOrderedRuntimeRequirement(extensionRequirements, requirement)
    }
  }

  for (let index = 0; index < extensionRequirements.length; index = index + 1) {
    result.push(extensionRequirements[index])
  }

  return result
}

function compilerRuntimeRequirementOrderHas(requirement: IrRuntimeRequirement): boolean {
  for (let index = 0; index < compilerRuntimeRequirementOrder.length; index = index + 1) {
    if (compilerRuntimeRequirementOrderAt(index) === requirement) {
      return true
    }
  }

  return false
}

function insertOrderedRuntimeRequirement(
  requirements: IrRuntimeRequirement[],
  requirement: IrRuntimeRequirement
): void {
  requirements.push(requirement)
  let index = requirements.length - 1

  while (index > 0 && requirements[index - 1] > requirement) {
    requirements[index] = requirements[index - 1]
    index = index - 1
  }

  requirements[index] = requirement
}

function createCompilerFeatureDescriptors(): CompilerFeatureDescriptor[] {
  const result: CompilerFeatureDescriptor[] = []

  for (let rowIndex = 0; rowIndex < compilerFeatureDescriptorRows.length; rowIndex = rowIndex + 1) {
    const row = compilerFeatureDescriptorRowAt(rowIndex)

    pushAllDescriptors(result, row)
  }

  return result
}

function createCompilerFeatureOrder(): IrFeature[] {
  const result: IrFeature[] = []

  for (let index = 0; index < compilerFeatureDescriptors.length; index = index + 1) {
    result.push(compilerFeatureDescriptorAt(index).id)
  }

  return result
}

function createCompilerRuntimeRequirementOrder(): IrRuntimeRequirement[] {
  const result: IrRuntimeRequirement[] = []
  const seen: Set<IrRuntimeRequirement> = new Set()

  for (let descriptorIndex = 0; descriptorIndex < compilerFeatureDescriptors.length; descriptorIndex = descriptorIndex + 1) {
    const descriptor = compilerFeatureDescriptorAt(descriptorIndex)

    for (
      let requirementIndex = 0;
      requirementIndex < descriptor.runtimeRequirements.length;
      requirementIndex = requirementIndex + 1
    ) {
      const requirement = descriptor.runtimeRequirements[requirementIndex]

      if (!seen.has(requirement)) {
        seen.add(requirement)
        result.push(requirement)
      }
    }
  }

  return result
}

function copyCompilerFeatureOrder(): IrFeature[] {
  const result: IrFeature[] = []

  for (let index = 0; index < compilerFeatureOrder.length; index = index + 1) {
    result.push(compilerFeatureOrderAt(index))
  }

  return result
}

function compilerFeatureOrderAt(index: number): IrFeature {
  return compilerFeatureOrder[index]
}

function compilerRuntimeRequirementOrderAt(index: number): IrRuntimeRequirement {
  return compilerRuntimeRequirementOrder[index]
}

function compilerFeatureDescriptorRowAt(index: number): CompilerFeatureDescriptor[] {
  return compilerFeatureDescriptorRows[index]
}

function compilerFeatureDescriptorAt(index: number): CompilerFeatureDescriptor {
  return compilerFeatureDescriptors[index]
}

function findCompilerFeatureDescriptor(featureName: IrFeature): CompilerFeatureDescriptor | null {
  for (let index = 0; index < compilerFeatureDescriptors.length; index = index + 1) {
    const descriptor = compilerFeatureDescriptorAt(index)

    if (descriptor.id === featureName) {
      return descriptor
    }
  }

  return null
}

function compilerFeatureHasCPrelude(featureName: IrFeature): boolean {
  const descriptor = findCompilerFeatureDescriptor(featureName)

  if (descriptor === null || typeof descriptor === 'undefined') {
    return false
  }

  return descriptor.cPreludeIncludes.length > 0 || descriptor.hasCPreludeHelpers
}

function copyRuntimeRequirements(values: IrRuntimeRequirement[]): IrRuntimeRequirement[] {
  const result: IrRuntimeRequirement[] = []

  for (let index = 0; index < values.length; index = index + 1) {
    result.push(values[index])
  }

  return result
}

function copyStrings(values: string[]): string[] {
  const result: string[] = []

  for (let index = 0; index < values.length; index = index + 1) {
    result.push(values[index])
  }

  return result
}

function pushAll(target: string[], values: string[]): void {
  for (let index = 0; index < values.length; index = index + 1) {
    target.push(values[index])
  }
}

function pushAllDescriptors(target: CompilerFeatureDescriptor[], values: CompilerFeatureDescriptor[]): void {
  for (let index = 0; index < values.length; index = index + 1) {
    target.push(values[index])
  }
}
