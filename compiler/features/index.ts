import type { IrFeature, IrProgram, IrRuntimeRequirement } from '../types.ts'
import { regexpFeature } from './regexp/index.ts'
import type { CompilerFeature, FeatureSet } from './types.ts'

export const compilerFeatures: CompilerFeature[] = [regexpFeature]

export function collectCompilerFeatureIrFeatures(node: unknown, features: FeatureSet): void {
  if (node === null || typeof node === 'undefined' || typeof node !== 'object') {
    return
  }

  for (let index = 0; index < compilerFeatures.length; index = index + 1) {
    const feature = compilerFeatureAt(index)
    const collect = feature.collectIrFeatures

    if (collect !== null && typeof collect !== 'undefined') {
      collect(node, features)
    }
  }
}

export function compilerFeatureRuntimeRequirements(featureName: IrFeature): IrRuntimeRequirement[] | null {
  const feature = findCompilerFeature(featureName)

  if (feature === null || typeof feature === 'undefined') {
    return null
  }

  return compilerFeatureRequirementsOrEmpty(feature)
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
  const feature = findCompilerFeature(featureName)

  if (feature === null || typeof feature === 'undefined') {
    return []
  }

  const cPrelude = feature.cPrelude

  if (cPrelude === null || typeof cPrelude === 'undefined') {
    return []
  }

  const includes = cPrelude.includes

  if (includes === null || typeof includes === 'undefined') {
    return []
  }

  return copyStrings(includes)
}

export function emitCompilerFeatureCPreludeHelpers(featureName: IrFeature): string[] {
  const feature = findCompilerFeature(featureName)

  if (feature === null || typeof feature === 'undefined') {
    return []
  }

  const cPrelude = feature.cPrelude

  if (cPrelude === null || typeof cPrelude === 'undefined') {
    return []
  }

  const helpers = cPrelude.helpers

  if (helpers === null || typeof helpers === 'undefined') {
    return []
  }

  const lines: string[] = []

  for (let index = 0; index < helpers.length; index = index + 1) {
    const emit = helpers[index]

    pushAll(lines, emit())
  }

  return lines
}

function compilerFeatureAt(index: number): CompilerFeature {
  return compilerFeatures[index]
}

function findCompilerFeature(featureName: IrFeature): CompilerFeature | null {
  for (let index = 0; index < compilerFeatures.length; index = index + 1) {
    const feature = compilerFeatureAt(index)

    if (feature.id === featureName) {
      return feature
    }
  }

  return null
}

function compilerFeatureHasCPrelude(featureName: IrFeature): boolean {
  const feature = findCompilerFeature(featureName)

  return (
    feature !== null &&
    typeof feature !== 'undefined' &&
    feature.cPrelude !== null &&
    typeof feature.cPrelude !== 'undefined'
  )
}

function compilerFeatureRequirementsOrEmpty(feature: CompilerFeature): IrRuntimeRequirement[] {
  const requirements = feature.runtimeRequirements

  if (requirements === null || typeof requirements === 'undefined') {
    return []
  }

  const result: IrRuntimeRequirement[] = []

  for (let index = 0; index < requirements.length; index = index + 1) {
    result.push(requirements[index])
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
