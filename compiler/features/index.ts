import type { AnyNode, IrFeature, IrProgram, IrRuntimeRequirement } from '../types.ts'
import { arrayPopNullFeature, collectArrayPopNullIrFeatures } from './array-pop-null/index.ts'
import { collectCoreRuntimeIrFeatures, coreRuntimeFeatures } from './core-runtime/index.ts'
import {
  collectMapGetNullIrFeatures,
  collectMapIndexSetIrFeatures,
  mapGetNullFeature,
  mapIndexSetFeature
} from './map-access/index.ts'
import {
  collectNumberFromStringNullIrFeatures,
  collectNumericCastsIrFeatures,
  numberFromStringNullFeature,
  numericCastsFeature
} from './numeric-conversions/index.ts'
import { collectRegExpIrFeatures, emitCRegExpPreludeHelpers, regexpFeature } from './regexp/index.ts'
import { binaryFeatureChildNodes, collectBinaryIrFeatures } from './runtime-backed/binary.ts'
import { collectChildProcessIrFeatures } from './runtime-backed/child-process.ts'
import { collectClocksIrFeatures } from './runtime-backed/clocks.ts'
import { collectCryptoIrFeatures } from './runtime-backed/crypto.ts'
import { collectDebugMemoryIrFeatures } from './runtime-backed/debug-memory.ts'
import { collectFsIrFeatures } from './runtime-backed/fs.ts'
import { runtimeBackedFeatures } from './runtime-backed/index.ts'
import { collectJsonIrFeatures } from './runtime-backed/json.ts'
import { collectOsIrFeatures } from './runtime-backed/os.ts'
import { collectPathIrFeatures } from './runtime-backed/path.ts'
import { collectProcessIrFeatures } from './runtime-backed/process.ts'
import { collectTimersIrFeatures } from './runtime-backed/timers.ts'
import { collectUrlIrFeatures } from './runtime-backed/url.ts'
import type { CompilerFeatureDescriptor } from './types.ts'
import { collectWeakReferencesIrFeatures, weakReferencesFeature } from './weak-references/index.ts'

const compilerFeatureDescriptorRows: CompilerFeatureDescriptor[][] = [
  [arrayPopNullFeature],
  coreRuntimeFeatures,
  runtimeBackedFeatures,
  [
    mapGetNullFeature,
    mapIndexSetFeature,
    numberFromStringNullFeature,
    numericCastsFeature,
    regexpFeature,
    weakReferencesFeature
  ]
]

const compilerFeatureDescriptors = createCompilerFeatureDescriptors()

export const compilerFeatures: IrFeature[] = createCompilerFeatureIds()

export function collectCompilerFeatureIrFeatures(node: unknown, features: Set<IrFeature>): void {
  if (node === null || typeof node === 'undefined' || typeof node !== 'object') {
    return
  }

  const featureNode = node as AnyNode

  collectArrayPopNullIrFeatures(featureNode, features)
  collectCoreRuntimeIrFeatures(featureNode, features)
  collectBinaryIrFeatures(featureNode, features)
  collectChildProcessIrFeatures(featureNode, features)
  collectClocksIrFeatures(featureNode, features)
  collectCryptoIrFeatures(featureNode, features)
  collectDebugMemoryIrFeatures(featureNode, features)
  collectFsIrFeatures(featureNode, features)
  collectJsonIrFeatures(featureNode, features)
  collectOsIrFeatures(featureNode, features)
  collectPathIrFeatures(featureNode, features)
  collectProcessIrFeatures(featureNode, features)
  collectTimersIrFeatures(featureNode, features)
  collectUrlIrFeatures(featureNode, features)
  collectMapGetNullIrFeatures(featureNode, features)
  collectMapIndexSetIrFeatures(featureNode, features)
  collectNumberFromStringNullIrFeatures(featureNode, features)
  collectNumericCastsIrFeatures(featureNode, features)
  collectRegExpIrFeatures(featureNode, features)
  collectWeakReferencesIrFeatures(featureNode, features)
}

export function compilerFeatureChildNodes(node: unknown): AnyNode[] | null {
  if (node === null || typeof node === 'undefined' || typeof node !== 'object') {
    return null
  }

  const featureNode = node as AnyNode

  return binaryFeatureChildNodes(featureNode)
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

export function emitCompilerFeatureCPreludeHelpers(featureName: IrFeature): string[] {
  const descriptor = findCompilerFeatureDescriptor(featureName)

  if (descriptor === null || typeof descriptor === 'undefined') {
    return []
  }

  const lines: string[] = []

  if (descriptor.id === 'regexp') {
    pushAll(lines, emitCRegExpPreludeHelpers())
  }

  return lines
}

function createCompilerFeatureDescriptors(): CompilerFeatureDescriptor[] {
  const result: CompilerFeatureDescriptor[] = []

  for (let rowIndex = 0; rowIndex < compilerFeatureDescriptorRows.length; rowIndex = rowIndex + 1) {
    const row = compilerFeatureDescriptorRowAt(rowIndex)

    pushAllDescriptors(result, row)
  }

  return result
}

function createCompilerFeatureIds(): IrFeature[] {
  const result: IrFeature[] = []

  for (let index = 0; index < compilerFeatureDescriptors.length; index = index + 1) {
    result.push(compilerFeatureDescriptorAt(index).id)
  }

  return result
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

  return descriptor.cPreludeIncludes.length > 0 || descriptor.cPreludeHelpers.length > 0
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
