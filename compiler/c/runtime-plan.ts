import {
  irProgramsUseCPreludeFeature
} from '../features/index.ts'
import {
  dateInstanceRuntimeMethodName,
  dateInstanceRuntimeMethodReturnType
} from '../../stdlib/global/compiler/descriptor.ts'
import type { AnyNode, IrGlobalUsage, IrProgram, IrRuntimeRequirement } from '../types.ts'
import type { CGlobalUsageSupportContext } from './diagnostics.ts'
import {
  isSupportedCFetchGlobalUsage,
  isSupportedCMathGlobalUsage
} from './diagnostics.ts'
import { irProgramsUseConsoleRuntime } from '../../stdlib/global/console/compiler/c.ts'
import { nodeStdlibHasSupportedCryptoGlobalUsage, nodeStdlibRuntimeImportUsage } from '../../stdlib/node/compiler/c.ts'

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
  needsRegexpRuntime: boolean
  needsTimerRuntime: boolean
  needsConsoleRuntime: boolean
  needsDgramRuntime: boolean
  needsFetchRuntime: boolean
  needsHttpRuntime: boolean
  needsNetRuntime: boolean
}

export type CRuntimePreludeRequirementInput = {
  classInfoCount: number
  cryptoContext: CGlobalUsageSupportContext
  globalUsages: IrGlobalUsage[]
  hasRuntimeCallbackWrapper: boolean
  irPrograms: IrProgram[]
  runtimeRequirements: Set<IrRuntimeRequirement>
  signatureRuntimeTypes?: Set<string>
  throwingFunctionCount: number
}

type CDateStringRuntimeContext = {
  moduleValueTypes: Map<string, string>
}

export function addDateStringRuntimeRequirements(
  requirements: Set<IrRuntimeRequirement>,
  programs: IrProgram[],
  context: CDateStringRuntimeContext
): void {
  if (!irProgramsUseDateStringRuntime(programs, context)) {
    return
  }

  requirements.add('managed-values')
  requirements.add('string-bytes')
}

export function resolveCRuntimePreludeRequirements(
  input: CRuntimePreludeRequirementInput
): CRuntimePreludeRequirements {
  const signatureRuntimeTypes: Set<string> = input.signatureRuntimeTypes ?? new Set()
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
  const needsRegexpRuntime = irProgramsUseCPreludeFeature(input.irPrograms, 'regexp')
  const needsTimerRuntime = input.runtimeRequirements.has('timers')
  const needsDebugMemoryRuntime = input.runtimeRequirements.has('debug-memory')
  const needsFetchRuntime = runtimePlanHasSupportedFetchGlobalUsage(input.globalUsages)
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
  const nodeRuntimeImports = nodeStdlibRuntimeImportUsage(input.irPrograms)
  const needsDgramRuntime = nodeRuntimeImports.dgram
  const needsObjectRuntime =
    input.runtimeRequirements.has('objects') ||
    needsFsRuntime ||
    needsFetchRuntime ||
    needsClassRuntime ||
    needsPathRuntime ||
    needsUrlRuntime ||
    signatureRuntimeTypes.has('object')
  const needsHttpRuntime = nodeRuntimeImports.http
  const needsNetRuntime = nodeRuntimeImports.net
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
  const needsMathRuntime = runtimePlanHasSupportedMathGlobalUsage(input.globalUsages)
  const needsCryptoRuntime =
    input.runtimeRequirements.has('crypto') ||
    nodeStdlibHasSupportedCryptoGlobalUsage(input.globalUsages, input.cryptoContext)
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
    needsRegexpRuntime,
    needsTimerRuntime,
    needsConsoleRuntime,
    needsDgramRuntime,
    needsFetchRuntime,
    needsHttpRuntime,
    needsNetRuntime
  }
}

function runtimePlanHasSupportedFetchGlobalUsage(globalUsages: IrGlobalUsage[]): boolean {
  for (let index = 0; index < globalUsages.length; index = index + 1) {
    const usage = globalUsages[index] as IrGlobalUsage

    if (isSupportedCFetchGlobalUsage(usage)) {
      return true
    }
  }

  return false
}

function runtimePlanHasSupportedMathGlobalUsage(globalUsages: IrGlobalUsage[]): boolean {
  for (let index = 0; index < globalUsages.length; index = index + 1) {
    const usage = globalUsages[index] as IrGlobalUsage

    if (isSupportedCMathGlobalUsage(usage)) {
      return true
    }
  }

  return false
}

function irProgramsUseDateStringRuntime(programs: IrProgram[], context: CDateStringRuntimeContext): boolean {
  for (let index = 0; index < programs.length; index = index + 1) {
    const program = programs[index] as IrProgram

    if (nodeUsesDateStringRuntime(program.body, context)) {
      return true
    }
  }

  return false
}

function nodeUsesDateStringRuntime(value: any, context: CDateStringRuntimeContext): boolean {
  if (value === null || typeof value === 'undefined' || typeof value !== 'object') {
    return false
  }

  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index = index + 1) {
      if (nodeUsesDateStringRuntime(value[index], context)) {
        return true
      }
    }

    return false
  }

  const node = value as AnyNode

  if (dateStringRuntimeCall(node, context)) {
    return true
  }

  return nodeChildrenUseDateStringRuntime(node, context)
}

function nodeChildrenUseDateStringRuntime(node: AnyNode, context: CDateStringRuntimeContext): boolean {
  return (
    nodeUsesDateStringRuntime(node.body, context) ||
    nodeUsesDateStringRuntime(node.params, context) ||
    nodeUsesDateStringRuntime(node.fields, context) ||
    nodeUsesDateStringRuntime(node.methods, context) ||
    nodeUsesDateStringRuntime(node.init, context) ||
    nodeUsesDateStringRuntime(node.condition, context) ||
    nodeUsesDateStringRuntime(node.consequent, context) ||
    nodeUsesDateStringRuntime(node.alternate, context) ||
    nodeUsesDateStringRuntime(node.test, context) ||
    nodeUsesDateStringRuntime(node.update, context) ||
    nodeUsesDateStringRuntime(node.iterable, context) ||
    nodeUsesDateStringRuntime(node.discriminant, context) ||
    nodeUsesDateStringRuntime(node.cases, context) ||
    nodeUsesDateStringRuntime(node.block, context) ||
    nodeUsesDateStringRuntime(node.handler, context) ||
    nodeUsesDateStringRuntime(node.finalizer, context) ||
    nodeUsesDateStringRuntime(node.argument, context) ||
    nodeUsesDateStringRuntime(node.args, context) ||
    nodeUsesDateStringRuntime(node.callee, context) ||
    nodeUsesDateStringRuntime(node.object, context) ||
    nodeUsesDateStringRuntime(node.index, context) ||
    nodeUsesDateStringRuntime(node.target, context) ||
    nodeUsesDateStringRuntime(node.value, context) ||
    nodeUsesDateStringRuntime(node.functionType, context) ||
    nodeUsesDateStringRuntime(node.returnShape, context) ||
    nodeUsesDateStringRuntime(node.left, context) ||
    nodeUsesDateStringRuntime(node.right, context) ||
    nodeUsesDateStringRuntime(node.elements, context) ||
    nodeUsesDateStringRuntime(node.properties, context) ||
    nodeUsesDateStringRuntime(node.expression, context)
  )
}

function dateStringRuntimeCall(node: AnyNode, context: CDateStringRuntimeContext): boolean {
  if (node.type !== 'CallExpression' || node.callee.type !== 'MemberExpression') {
    return false
  }

  if (!isDateRuntimeReceiver(node.callee.object, context)) {
    return false
  }

  const method = dateInstanceRuntimeMethodName(node.callee.property)

  return dateInstanceRuntimeMethodReturnType(method) === 'string'
}

function isDateRuntimeReceiver(expression: AnyNode, context: CDateStringRuntimeContext): boolean {
  if (expression.valueType === 'date') {
    return true
  }

  if (expression.type !== 'Reference' || expression.path.length !== 1) {
    return false
  }

  return context.moduleValueTypes.get(expression.path[0]) === 'date'
}
