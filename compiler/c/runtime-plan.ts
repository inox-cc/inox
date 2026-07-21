import type { IrGlobalUsage, IrProgram, IrRuntimeRequirement } from '../types.ts'
import type {
  CompilerLibrarySet,
  RuntimeEntrypointAdapterDescriptor,
  RuntimeRequirementDescriptor
} from '../extensions/types.ts'
import { cOptionalCompilerLibrarySetValue } from './types.ts'
import type { CCompilerLibrarySet } from './types.ts'

export type CRuntimePreludeRequirements = {
  needsRuntime: boolean
  needsAsyncRuntime: boolean
  needsCallbackRuntime: boolean
  needsClassDescriptorRuntime: boolean
  needsCppValueRuntime: boolean
  needsStringHeader: boolean
  needsObjectRuntime: boolean
  runtimeEntrypointAdapter: RuntimeEntrypointAdapterDescriptor | null
  libraryCPreludeIncludes: string[]
  libraryRuntimeRequirements: string[]
}

export type CRuntimePreludeRequirementInput = {
  classDescriptorCount: number
  cppValueRuntime: boolean
  globalUsages: IrGlobalUsage[]
  hasRuntimeCallbackWrapper: boolean
  irPrograms: IrProgram[]
  libraries?: CCompilerLibrarySet
  runtimeRequirements: Set<IrRuntimeRequirement>
  signatureRuntimeTypes?: Set<string>
  throwingFunctionCount: number
}

export function resolveCRuntimePreludeRequirements(
  input: CRuntimePreludeRequirementInput
): CRuntimePreludeRequirements {
  const libraryRuntime = resolveLibraryRuntimeRequirements(
    input.runtimeRequirements,
    cOptionalCompilerLibrarySetValue(input.libraries)
  )
  const runtimeRequirements = libraryRuntime.requirements
  const signatureRuntimeTypes: Set<string> = input.signatureRuntimeTypes ?? new Set()
  const needsCallbackRuntime =
    input.hasRuntimeCallbackWrapper ||
    runtimeRequirements.has('callback-values') ||
    signatureRuntimeTypes.has('function')
  const needsAsyncRuntime = runtimeRequirements.has('async-runtime') || signatureRuntimeTypes.has('async-result')
  const needsClassRuntime = input.classDescriptorCount > 0
  const needsClassDescriptorRuntime = needsClassRuntime
  const needsCppValueRuntime =
    input.cppValueRuntime ||
    runtimeRequirements.has('managed-values') ||
    runtimeRequirements.has('string-bytes') ||
    needsAsyncRuntime ||
    signatureRuntimeTypes.size > 0
  const needsObjectRuntime =
    runtimeRequirements.has('objects') || needsClassRuntime || signatureRuntimeTypes.has('object')
  const needsRuntime =
    input.throwingFunctionCount > 0 ||
    needsAsyncRuntime ||
    needsCallbackRuntime ||
    needsObjectRuntime ||
    needsClassRuntime ||
    needsCppValueRuntime ||
    signatureRuntimeTypes.size > 0 ||
    runtimeRequirements.has('managed-values')
  const needsStringHeader = runtimeRequirements.has('string-bytes') || signatureRuntimeTypes.has('string')

  return {
    needsRuntime,
    needsAsyncRuntime,
    needsCallbackRuntime,
    needsClassDescriptorRuntime,
    needsCppValueRuntime,
    needsStringHeader,
    needsObjectRuntime,
    runtimeEntrypointAdapter: libraryRuntime.entrypointAdapter,
    libraryCPreludeIncludes: libraryRuntime.includes,
    libraryRuntimeRequirements: orderedRuntimeRequirementIds(libraryRuntime.requirements)
  }
}

type CLibraryRuntimeResolution = {
  entrypointAdapter: RuntimeEntrypointAdapterDescriptor | null
  includes: string[]
  requirements: Set<string>
}

function resolveLibraryRuntimeRequirements(
  selected: Set<IrRuntimeRequirement>,
  libraries: CompilerLibrarySet | null | undefined
): CLibraryRuntimeResolution {
  const requirements: Set<string> = new Set()
  const includes: string[] = []
  let entrypointAdapter: RuntimeEntrypointAdapterDescriptor | null = null

  for (const requirement of selected) {
    requirements.add(requirement)
  }

  if (libraries === null || typeof libraries === 'undefined') {
    return { entrypointAdapter, includes, requirements }
  }

  const pending = orderedRuntimeRequirementIds(requirements)

  for (let index = 0; index < pending.length; index = index + 1) {
    const descriptor = findRuntimeRequirementDescriptor(libraries.runtimeRequirements, pending[index])

    if (descriptor === null) {
      continue
    }

    const descriptorAdapter = descriptor.cEntrypointAdapter

    if (descriptorAdapter !== null && typeof descriptorAdapter !== 'undefined') {
      if (
        entrypointAdapter !== null &&
        (entrypointAdapter.cFunction !== descriptorAdapter.cFunction ||
          entrypointAdapter.acceptsEntryPath !== descriptorAdapter.acceptsEntryPath)
      ) {
        throw new Error(
          `runtime requirements select multiple entrypoint adapters: ${entrypointAdapter.cFunction}, ${descriptorAdapter.cFunction}`
        )
      }

      entrypointAdapter = descriptorAdapter
    }

    for (
      let dependencyIndex = 0;
      dependencyIndex < descriptor.dependencies.length;
      dependencyIndex = dependencyIndex + 1
    ) {
      const dependency = descriptor.dependencies[dependencyIndex]

      if (!requirements.has(dependency)) {
        requirements.add(dependency)
        pending.push(dependency)
      }
    }

    for (let includeIndex = 0; includeIndex < descriptor.cPreludeIncludes.length; includeIndex = includeIndex + 1) {
      insertOrderedRuntimeRequirementId(includes, descriptor.cPreludeIncludes[includeIndex])
    }
  }

  return { entrypointAdapter, includes, requirements }
}

export function resolveLibraryRuntimeCPreludeIncludes(
  selected: Set<IrRuntimeRequirement>,
  libraries: CCompilerLibrarySet | null | undefined
): string[] {
  return resolveLibraryRuntimeRequirements(selected, cOptionalCompilerLibrarySetValue(libraries)).includes
}

function findRuntimeRequirementDescriptor(
  descriptors: RuntimeRequirementDescriptor[],
  id: string
): RuntimeRequirementDescriptor | null {
  for (let index = 0; index < descriptors.length; index = index + 1) {
    const descriptor = descriptors[index]

    if (descriptor.id === id) {
      return descriptor
    }
  }

  return null
}

function orderedRuntimeRequirementIds(values: Set<string>): string[] {
  const ordered: string[] = []

  for (const value of values) {
    insertOrderedRuntimeRequirementId(ordered, value)
  }

  return ordered
}

function insertOrderedRuntimeRequirementId(values: string[], value: string): void {
  for (let index = 0; index < values.length; index = index + 1) {
    if (values[index] === value) {
      return
    }
  }

  values.push(value)
  let index = values.length - 1

  while (index > 0 && values[index - 1] > value) {
    values[index] = values[index - 1]
    index = index - 1
  }

  values[index] = value
}
