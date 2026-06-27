import type { AnyNode, IrFeature, IrProgram, IrRuntimeRequirement } from '../types.ts'
import {
  arrayPopNullFeatureCPreludeHelpers,
  arrayPopNullFeatureCPreludeIncludes,
  arrayPopNullFeatureId,
  arrayPopNullFeatureRuntimeRequirements,
  collectArrayPopNullIrFeatures
} from './array-pop-null/index.ts'
import {
  collectMapGetNullIrFeatures,
  collectMapIndexSetIrFeatures,
  mapGetNullFeatureCPreludeHelpers,
  mapGetNullFeatureCPreludeIncludes,
  mapGetNullFeatureId,
  mapGetNullFeatureRuntimeRequirements,
  mapIndexSetFeatureCPreludeHelpers,
  mapIndexSetFeatureCPreludeIncludes,
  mapIndexSetFeatureId,
  mapIndexSetFeatureRuntimeRequirements
} from './map-access/index.ts'
import {
  collectNumberFromStringNullIrFeatures,
  collectNumericCastsIrFeatures,
  numberFromStringNullFeatureCPreludeHelpers,
  numberFromStringNullFeatureCPreludeIncludes,
  numberFromStringNullFeatureId,
  numberFromStringNullFeatureRuntimeRequirements,
  numericCastsFeatureCPreludeHelpers,
  numericCastsFeatureCPreludeIncludes,
  numericCastsFeatureId,
  numericCastsFeatureRuntimeRequirements
} from './numeric-conversions/index.ts'
import {
  collectRegExpIrFeatures,
  regexpFeatureCPreludeHelpers,
  regexpFeatureCPreludeIncludes,
  regexpFeatureId,
  regexpFeatureRuntimeRequirements
} from './regexp/index.ts'
import {
  collectWeakReferencesIrFeatures,
  weakReferencesFeatureCPreludeHelpers,
  weakReferencesFeatureCPreludeIncludes,
  weakReferencesFeatureId,
  weakReferencesFeatureRuntimeRequirements
} from './weak-references/index.ts'

type CompilerFeatureHelperEmitter = () => string[]

export const compilerFeatures: IrFeature[] = [
  arrayPopNullFeatureId,
  mapGetNullFeatureId,
  mapIndexSetFeatureId,
  numberFromStringNullFeatureId,
  numericCastsFeatureId,
  regexpFeatureId,
  weakReferencesFeatureId
]

const compilerFeatureRuntimeRequirementRows: IrRuntimeRequirement[][] = [
  arrayPopNullFeatureRuntimeRequirements,
  mapGetNullFeatureRuntimeRequirements,
  mapIndexSetFeatureRuntimeRequirements,
  numberFromStringNullFeatureRuntimeRequirements,
  numericCastsFeatureRuntimeRequirements,
  regexpFeatureRuntimeRequirements,
  weakReferencesFeatureRuntimeRequirements
]
const compilerFeatureCPreludeIncludeRows: string[][] = [
  arrayPopNullFeatureCPreludeIncludes,
  mapGetNullFeatureCPreludeIncludes,
  mapIndexSetFeatureCPreludeIncludes,
  numberFromStringNullFeatureCPreludeIncludes,
  numericCastsFeatureCPreludeIncludes,
  regexpFeatureCPreludeIncludes,
  weakReferencesFeatureCPreludeIncludes
]
const compilerFeatureCPreludeHelperRows: CompilerFeatureHelperEmitter[][] = [
  arrayPopNullFeatureCPreludeHelpers,
  mapGetNullFeatureCPreludeHelpers,
  mapIndexSetFeatureCPreludeHelpers,
  numberFromStringNullFeatureCPreludeHelpers,
  numericCastsFeatureCPreludeHelpers,
  regexpFeatureCPreludeHelpers,
  weakReferencesFeatureCPreludeHelpers
]

export function collectCompilerFeatureIrFeatures(node: unknown, features: Set<IrFeature>): void {
  if (node === null || typeof node === 'undefined' || typeof node !== 'object') {
    return
  }

  const featureNode = node as AnyNode

  for (let index = 0; index < compilerFeatures.length; index = index + 1) {
    const feature = compilerFeatureAt(index)

    collectCompilerFeatureIrFeature(feature, featureNode, features)
  }
}

export function compilerFeatureRuntimeRequirements(featureName: IrFeature): IrRuntimeRequirement[] | null {
  const featureIndex = findCompilerFeatureIndex(featureName)

  if (featureIndex < 0) {
    return null
  }

  return copyRuntimeRequirements(compilerFeatureRuntimeRequirementsAt(featureIndex))
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
  const featureIndex = findCompilerFeatureIndex(featureName)

  if (featureIndex < 0) {
    return []
  }

  return copyStrings(compilerFeatureCPreludeIncludesAt(featureIndex))
}

export function emitCompilerFeatureCPreludeHelpers(featureName: IrFeature): string[] {
  const featureIndex = findCompilerFeatureIndex(featureName)

  if (featureIndex < 0) {
    return []
  }

  const featureHelpers = compilerFeatureCPreludeHelpersAt(featureIndex)
  const lines: string[] = []

  for (let index = 0; index < featureHelpers.length; index = index + 1) {
    const emit = featureHelpers[index]

    pushAll(lines, emit())
  }

  return lines
}

function compilerFeatureAt(index: number): IrFeature {
  return compilerFeatures[index]
}

function compilerFeatureRuntimeRequirementsAt(index: number): IrRuntimeRequirement[] {
  return compilerFeatureRuntimeRequirementRows[index]
}

function compilerFeatureCPreludeIncludesAt(index: number): string[] {
  return compilerFeatureCPreludeIncludeRows[index]
}

function compilerFeatureCPreludeHelpersAt(index: number): CompilerFeatureHelperEmitter[] {
  return compilerFeatureCPreludeHelperRows[index]
}

function findCompilerFeatureIndex(featureName: IrFeature): number {
  for (let index = 0; index < compilerFeatures.length; index = index + 1) {
    if (compilerFeatureAt(index) === featureName) {
      return index
    }
  }

  return -1
}

function collectCompilerFeatureIrFeature(featureName: IrFeature, node: AnyNode, features: Set<IrFeature>): void {
  if (featureName === arrayPopNullFeatureId) {
    collectArrayPopNullIrFeatures(node, features)
    return
  }

  if (featureName === mapGetNullFeatureId) {
    collectMapGetNullIrFeatures(node, features)
    return
  }

  if (featureName === mapIndexSetFeatureId) {
    collectMapIndexSetIrFeatures(node, features)
    return
  }

  if (featureName === numberFromStringNullFeatureId) {
    collectNumberFromStringNullIrFeatures(node, features)
    return
  }

  if (featureName === numericCastsFeatureId) {
    collectNumericCastsIrFeatures(node, features)
    return
  }

  if (featureName === regexpFeatureId) {
    collectRegExpIrFeatures(node, features)
    return
  }

  if (featureName === weakReferencesFeatureId) {
    collectWeakReferencesIrFeatures(node, features)
  }
}

function compilerFeatureHasCPrelude(featureName: IrFeature): boolean {
  const featureIndex = findCompilerFeatureIndex(featureName)

  if (featureIndex < 0) {
    return false
  }

  return compilerFeatureCPreludeIncludesAt(featureIndex).length > 0
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
