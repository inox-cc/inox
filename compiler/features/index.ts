import type { AnyNode, IrFeature, IrProgram, IrRuntimeRequirement } from '../types.ts'
import { collectCoreRuntimeIrFeatures, coreRuntimeFeatures } from './core-runtime/index.ts'
import {
  collectMapGetNullIrFeatures,
  collectMapIndexSetIrFeatures,
  mapGetNullFeature,
  mapIndexSetFeature
} from './map-access/index.ts'
import { collectDebugMemoryIrFeatures } from './runtime-backed/debug-memory.ts'
import {
  collectNodeStdlibIrFeatures,
  nodeStdlibFeatureChildNodes,
  nodeStdlibFeatures
} from '../../stdlib/node/compiler/feature.ts'
import {
  collectGlobalStdlibIrFeatures,
  emitGlobalStdlibCPreludeHelpers,
  globalStdlibFeatures
} from '../../stdlib/global/compiler/feature.ts'
import { runtimeBackedFeatures } from './runtime-backed/index.ts'
import type { CompilerFeatureDescriptor } from './types.ts'
import { collectWeakReferencesIrFeatures, weakReferencesFeature } from './weak-references/index.ts'

const compilerFeatureDescriptorRows: CompilerFeatureDescriptor[][] = [
  coreRuntimeFeatures,
  runtimeBackedFeatures,
  globalStdlibFeatures,
  nodeStdlibFeatures,
  [
    mapGetNullFeature,
    mapIndexSetFeature,
    weakReferencesFeature
  ]
]

const compilerFeatureDescriptors = createCompilerFeatureDescriptors()

const compilerFeatureOrder: IrFeature[] = [
  'array-pop-null',
  'async-runtime',
  'binary',
  'callback-values',
  'child-process',
  'clocks',
  'collections',
  'crypto',
  'debug-memory',
  'fs',
  'json',
  'map-get-null',
  'map-index-set',
  'number-from-string-null',
  'numeric-casts',
  'objects',
  'os',
  'path',
  'process',
  'regexp',
  'runtime-values',
  'string-bytes',
  'timers',
  'url',
  'weak-references'
]

const compilerRuntimeRequirementOrder: IrRuntimeRequirement[] = [
  'async-runtime',
  'binary',
  'callback-values',
  'child-process',
  'clocks',
  'collections',
  'crypto',
  'debug-memory',
  'fs',
  'json',
  'managed-values',
  'objects',
  'os',
  'path',
  'process',
  'string-bytes',
  'timers',
  'url',
  'weak-references'
]

export const compilerFeatures: IrFeature[] = copyCompilerFeatureOrder()

export function collectCompilerFeatureIrFeatures(node: unknown, features: Set<IrFeature>): void {
  if (node === null || typeof node === 'undefined' || typeof node !== 'object') {
    return
  }

  const featureNode = node as AnyNode

  collectCoreRuntimeIrFeatures(featureNode, features)
  collectNodeStdlibIrFeatures(featureNode, features)
  collectGlobalStdlibIrFeatures(featureNode, features)
  collectDebugMemoryIrFeatures(featureNode, features)
  collectMapGetNullIrFeatures(featureNode, features)
  collectMapIndexSetIrFeatures(featureNode, features)
  collectWeakReferencesIrFeatures(featureNode, features)
}

export function compilerFeatureChildNodes(node: unknown): AnyNode[] | null {
  if (node === null || typeof node === 'undefined' || typeof node !== 'object') {
    return null
  }

  const featureNode = node as AnyNode

  return nodeStdlibFeatureChildNodes(featureNode)
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

  if (descriptor.hasCPreludeHelpers) {
    pushAll(lines, emitGlobalStdlibCPreludeHelpers(featureName))
  }

  return lines
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

  for (let index = 0; index < compilerRuntimeRequirementOrder.length; index = index + 1) {
    const requirement = compilerRuntimeRequirementOrderAt(index)

    if (requirements.has(requirement)) {
      result.push(requirement)
    }
  }

  return result
}

function createCompilerFeatureDescriptors(): CompilerFeatureDescriptor[] {
  const result: CompilerFeatureDescriptor[] = []

  for (let rowIndex = 0; rowIndex < compilerFeatureDescriptorRows.length; rowIndex = rowIndex + 1) {
    const row = compilerFeatureDescriptorRowAt(rowIndex)

    pushAllDescriptors(result, row)
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
