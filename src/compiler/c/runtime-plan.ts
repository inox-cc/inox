import {
  isSupportedCCryptoGlobalUsage,
  isSupportedCFetchGlobalUsage,
  isSupportedCMathGlobalUsage
} from './diagnostics.ts'
import { irProgramsUseRuntimeImport } from './runtime-imports.ts'
import { irProgramsUseConsoleRuntime } from './stdlib/console.ts'

export type CRuntimePreludeRequirements = {
  needsRuntime: boolean
  needsTimeRuntime: boolean
  needsMathRuntime: boolean
  needsCryptoRuntime: boolean
  needsDebugMemoryRuntime: boolean
  needsAsyncRuntime: boolean
  needsCallbackRuntime: boolean
  needsStringHeader: boolean
  needsCollectionRuntime: boolean
  needsBinaryRuntime: boolean
  needsObjectRuntime: boolean
  needsChildProcessRuntime: boolean
  needsFsRuntime: boolean
  needsOsRuntime: boolean
  needsPathRuntime: boolean
  needsUrlRuntime: boolean
  needsProcessRuntime: boolean
  needsJsonRuntime: boolean
  needsTimerRuntime: boolean
  needsConsoleRuntime: boolean
  needsDgramRuntime: boolean
  needsFetchRuntime: boolean
  needsHttpRuntime: boolean
  needsNetRuntime: boolean
}

export type CRuntimePreludeRequirementInput = {
  classInfoCount: number
  cryptoContext: any
  globalUsages: any[]
  hasRuntimeCallbackWrapper: boolean
  irPrograms: any[]
  runtimeRequirements: Set<string>
  signatureRuntimeTypes?: Set<string>
  throwingFunctionCount: number
}

export function resolveCRuntimePreludeRequirements(
  input: CRuntimePreludeRequirementInput
): CRuntimePreludeRequirements {
  const signatureRuntimeTypes = input.signatureRuntimeTypes ?? new Set<string>()
  const needsCallbackRuntime =
    input.hasRuntimeCallbackWrapper ||
    input.runtimeRequirements.has('callback-values') ||
    signatureRuntimeTypes.has('function')
  const needsChildProcessRuntime = input.runtimeRequirements.has('child-process')
  const needsFsRuntime = input.runtimeRequirements.has('fs')
  const needsOsRuntime = input.runtimeRequirements.has('os')
  const needsPathRuntime = input.runtimeRequirements.has('path')
  const needsUrlRuntime = input.runtimeRequirements.has('url')
  const needsProcessRuntime = input.runtimeRequirements.has('process')
  const needsJsonRuntime = input.runtimeRequirements.has('json')
  const needsTimerRuntime = input.runtimeRequirements.has('timers')
  const needsDebugMemoryRuntime = input.runtimeRequirements.has('debug-memory')
  const needsFetchRuntime = input.globalUsages.some(isSupportedCFetchGlobalUsage)
  const needsAsyncRuntime =
    input.runtimeRequirements.has('async-runtime') ||
    needsFetchRuntime ||
    needsFsRuntime ||
    needsTimerRuntime ||
    signatureRuntimeTypes.has('promise')
  const needsCollectionRuntime =
    input.runtimeRequirements.has('collections') ||
    signatureRuntimeTypes.has('array') ||
    signatureRuntimeTypes.has('map') ||
    signatureRuntimeTypes.has('set')
  const needsBinaryRuntime = input.runtimeRequirements.has('binary') || signatureRuntimeTypes.has('bytes')
  const needsClassRuntime = input.classInfoCount > 0
  const needsDgramRuntime = irProgramsUseRuntimeImport(input.irPrograms, new Set(['dgram', 'node:dgram']))
  const needsObjectRuntime =
    input.runtimeRequirements.has('objects') ||
    needsFsRuntime ||
    needsFetchRuntime ||
    needsClassRuntime ||
    needsPathRuntime ||
    needsUrlRuntime ||
    signatureRuntimeTypes.has('object')
  const needsHttpRuntime = irProgramsUseRuntimeImport(input.irPrograms, new Set(['http', 'node:http']))
  const needsNetRuntime = irProgramsUseRuntimeImport(input.irPrograms, new Set(['net', 'node:net']))
  const needsRuntime =
    input.throwingFunctionCount > 0 ||
    needsAsyncRuntime ||
    needsDgramRuntime ||
    needsFetchRuntime ||
    needsHttpRuntime ||
    needsNetRuntime ||
    needsCallbackRuntime ||
    needsChildProcessRuntime ||
    needsCollectionRuntime ||
    needsOsRuntime ||
    needsPathRuntime ||
    needsUrlRuntime ||
    needsProcessRuntime ||
    needsObjectRuntime ||
    needsClassRuntime ||
    needsJsonRuntime ||
    signatureRuntimeTypes.size > 0 ||
    input.runtimeRequirements.has('managed-values')
  const needsTimeRuntime =
    input.runtimeRequirements.has('clocks') ||
    needsAsyncRuntime ||
    needsDgramRuntime ||
    needsFetchRuntime ||
    needsHttpRuntime ||
    needsNetRuntime
  const needsMathRuntime = input.globalUsages.some(isSupportedCMathGlobalUsage)
  const needsCryptoRuntime =
    input.runtimeRequirements.has('crypto') ||
    input.globalUsages.some((usage) => isSupportedCCryptoGlobalUsage(usage, input.cryptoContext))
  const needsConsoleRuntime = irProgramsUseConsoleRuntime(input.irPrograms)
  const needsStringHeader =
    input.runtimeRequirements.has('string-bytes') ||
    needsChildProcessRuntime ||
    needsFsRuntime ||
    needsOsRuntime ||
    needsPathRuntime ||
    needsUrlRuntime ||
    needsProcessRuntime ||
    needsDgramRuntime ||
    needsFetchRuntime ||
    needsNetRuntime ||
    signatureRuntimeTypes.has('string')

  return {
    needsRuntime,
    needsTimeRuntime,
    needsMathRuntime,
    needsCryptoRuntime,
    needsDebugMemoryRuntime,
    needsAsyncRuntime,
    needsCallbackRuntime,
    needsStringHeader,
    needsCollectionRuntime,
    needsBinaryRuntime,
    needsObjectRuntime,
    needsChildProcessRuntime,
    needsFsRuntime,
    needsOsRuntime,
    needsPathRuntime,
    needsUrlRuntime,
    needsProcessRuntime,
    needsJsonRuntime,
    needsTimerRuntime,
    needsConsoleRuntime,
    needsDgramRuntime,
    needsFetchRuntime,
    needsHttpRuntime,
    needsNetRuntime
  }
}
