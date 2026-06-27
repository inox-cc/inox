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
  binaryFeatureCPreludeHelpers,
  binaryFeatureCPreludeIncludes,
  binaryFeatureId,
  binaryFeatureRuntimeRequirements,
  childProcessFeatureCPreludeHelpers,
  childProcessFeatureCPreludeIncludes,
  childProcessFeatureId,
  childProcessFeatureRuntimeRequirements,
  clocksFeatureCPreludeHelpers,
  clocksFeatureCPreludeIncludes,
  clocksFeatureId,
  clocksFeatureRuntimeRequirements,
  collectRuntimeBackedIrFeature,
  cryptoFeatureCPreludeHelpers,
  cryptoFeatureCPreludeIncludes,
  cryptoFeatureId,
  cryptoFeatureRuntimeRequirements,
  debugMemoryFeatureCPreludeHelpers,
  debugMemoryFeatureCPreludeIncludes,
  debugMemoryFeatureId,
  debugMemoryFeatureRuntimeRequirements,
  fsFeatureCPreludeHelpers,
  fsFeatureCPreludeIncludes,
  fsFeatureId,
  fsFeatureRuntimeRequirements,
  jsonFeatureCPreludeHelpers,
  jsonFeatureCPreludeIncludes,
  jsonFeatureId,
  jsonFeatureRuntimeRequirements,
  osFeatureCPreludeHelpers,
  osFeatureCPreludeIncludes,
  osFeatureId,
  osFeatureRuntimeRequirements,
  pathFeatureCPreludeHelpers,
  pathFeatureCPreludeIncludes,
  pathFeatureId,
  pathFeatureRuntimeRequirements,
  processFeatureCPreludeHelpers,
  processFeatureCPreludeIncludes,
  processFeatureId,
  processFeatureRuntimeRequirements,
  timersFeatureCPreludeHelpers,
  timersFeatureCPreludeIncludes,
  timersFeatureId,
  timersFeatureRuntimeRequirements,
  urlFeatureCPreludeHelpers,
  urlFeatureCPreludeIncludes,
  urlFeatureId,
  urlFeatureRuntimeRequirements
} from './runtime-backed/index.ts'
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
  binaryFeatureId,
  childProcessFeatureId,
  clocksFeatureId,
  cryptoFeatureId,
  debugMemoryFeatureId,
  fsFeatureId,
  jsonFeatureId,
  mapGetNullFeatureId,
  mapIndexSetFeatureId,
  numberFromStringNullFeatureId,
  numericCastsFeatureId,
  osFeatureId,
  pathFeatureId,
  processFeatureId,
  regexpFeatureId,
  timersFeatureId,
  urlFeatureId,
  weakReferencesFeatureId
]

const compilerFeatureRuntimeRequirementRows: IrRuntimeRequirement[][] = [
  arrayPopNullFeatureRuntimeRequirements,
  binaryFeatureRuntimeRequirements,
  childProcessFeatureRuntimeRequirements,
  clocksFeatureRuntimeRequirements,
  cryptoFeatureRuntimeRequirements,
  debugMemoryFeatureRuntimeRequirements,
  fsFeatureRuntimeRequirements,
  jsonFeatureRuntimeRequirements,
  mapGetNullFeatureRuntimeRequirements,
  mapIndexSetFeatureRuntimeRequirements,
  numberFromStringNullFeatureRuntimeRequirements,
  numericCastsFeatureRuntimeRequirements,
  osFeatureRuntimeRequirements,
  pathFeatureRuntimeRequirements,
  processFeatureRuntimeRequirements,
  regexpFeatureRuntimeRequirements,
  timersFeatureRuntimeRequirements,
  urlFeatureRuntimeRequirements,
  weakReferencesFeatureRuntimeRequirements
]
const compilerFeatureCPreludeIncludeRows: string[][] = [
  arrayPopNullFeatureCPreludeIncludes,
  binaryFeatureCPreludeIncludes,
  childProcessFeatureCPreludeIncludes,
  clocksFeatureCPreludeIncludes,
  cryptoFeatureCPreludeIncludes,
  debugMemoryFeatureCPreludeIncludes,
  fsFeatureCPreludeIncludes,
  jsonFeatureCPreludeIncludes,
  mapGetNullFeatureCPreludeIncludes,
  mapIndexSetFeatureCPreludeIncludes,
  numberFromStringNullFeatureCPreludeIncludes,
  numericCastsFeatureCPreludeIncludes,
  osFeatureCPreludeIncludes,
  pathFeatureCPreludeIncludes,
  processFeatureCPreludeIncludes,
  regexpFeatureCPreludeIncludes,
  timersFeatureCPreludeIncludes,
  urlFeatureCPreludeIncludes,
  weakReferencesFeatureCPreludeIncludes
]
const compilerFeatureCPreludeHelperRows: CompilerFeatureHelperEmitter[][] = [
  arrayPopNullFeatureCPreludeHelpers,
  binaryFeatureCPreludeHelpers,
  childProcessFeatureCPreludeHelpers,
  clocksFeatureCPreludeHelpers,
  cryptoFeatureCPreludeHelpers,
  debugMemoryFeatureCPreludeHelpers,
  fsFeatureCPreludeHelpers,
  jsonFeatureCPreludeHelpers,
  mapGetNullFeatureCPreludeHelpers,
  mapIndexSetFeatureCPreludeHelpers,
  numberFromStringNullFeatureCPreludeHelpers,
  numericCastsFeatureCPreludeHelpers,
  osFeatureCPreludeHelpers,
  pathFeatureCPreludeHelpers,
  processFeatureCPreludeHelpers,
  regexpFeatureCPreludeHelpers,
  timersFeatureCPreludeHelpers,
  urlFeatureCPreludeHelpers,
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
  if (collectRuntimeBackedIrFeature(featureName, node, features)) {
    return
  }

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
