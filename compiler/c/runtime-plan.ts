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
import { nodeStdlibHasSupportedCryptoGlobalUsage, nodeStdlibRuntimeImportUsage } from '../stdlib/node/c.ts'

export type CRuntimePreludeRequirements = {
  needsRuntime: boolean
  needsTimeRuntime: boolean
  needsMathRuntime: boolean
  needsCryptoRuntime: boolean
  needsDebugMemoryRuntime: boolean
  needsAsyncRuntime: boolean
  needsCallbackRuntime: boolean
  needsClassDescriptorRuntime: boolean
  needsCppValueRuntime: boolean
  needsStringHeader: boolean
  needsCollectionRuntime: boolean
  needsHashRuntime: boolean
  needsMapRuntime: boolean
  needsSetRuntime: boolean
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
  classDescriptorCount: number
  cppValueRuntime: boolean
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
  const needsMapRuntime =
    signatureRuntimeTypes.has('map') ||
    irProgramsUseCollectionKind(input.irPrograms, 'map')
  const needsSetRuntime =
    signatureRuntimeTypes.has('set') ||
    irProgramsUseCollectionKind(input.irPrograms, 'set')
  const needsHashRuntime =
    needsMapRuntime ||
    needsSetRuntime ||
    irProgramsUseArrayIncludes(input.irPrograms)
  const needsBinaryRuntime = input.runtimeRequirements.has('binary') || signatureRuntimeTypes.has('bytes')
  const needsClassRuntime = input.classDescriptorCount > 0
  const needsClassDescriptorRuntime = needsClassRuntime
  const needsCppValueRuntime =
    input.cppValueRuntime ||
    input.runtimeRequirements.has('managed-values') ||
    input.runtimeRequirements.has('string-bytes') ||
    needsAsyncRuntime ||
    signatureRuntimeTypes.size > 0
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
    needsCppValueRuntime ||
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
    needsClassDescriptorRuntime,
    needsCppValueRuntime,
    needsStringHeader,
    needsCollectionRuntime,
    needsHashRuntime,
    needsMapRuntime,
    needsSetRuntime,
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

function irProgramsUseArrayIncludes(programs: IrProgram[]): boolean {
  return irProgramsUseNode(programs, 'array-includes', '', null)
}

function nodeIsArrayIncludesCall(node: AnyNode): boolean {
  if (node.type !== 'CallExpression') {
    return false
  }

  const callee = node.callee

  if (callee === null || typeof callee === 'undefined' || callee.type !== 'MemberExpression') {
    return false
  }

  if (callee.property !== 'includes') {
    return false
  }

  const object = callee.object

  if (object === null || typeof object === 'undefined') {
    return false
  }

  return (
    object.valueType === 'array' ||
    object.arrayElementType !== null && typeof object.arrayElementType !== 'undefined'
  )
}

function irProgramsUseCollectionKind(programs: IrProgram[], kind: string): boolean {
  return irProgramsUseNode(programs, 'collection', kind, null)
}

function nodeUsesCollectionKind(node: AnyNode, kind: string): boolean {
  return (
    node.collectionKind === kind ||
    node.valueType === kind ||
    node.returnType === kind ||
    nodeIsCollectionConstructor(node, kind)
  )
}

function nodeIsCollectionConstructor(value: AnyNode, kind: string): boolean {
  if (value.type !== 'NewExpression') {
    return false
  }

  const callee = value.callee

  if (callee === null || typeof callee === 'undefined' || callee.type !== 'Reference') {
    return false
  }

  if (!Array.isArray(callee.path) || callee.path.length !== 1) {
    return false
  }

  if (kind === 'map') {
    return callee.path[0] === 'Map'
  }

  if (kind === 'set') {
    return callee.path[0] === 'Set'
  }

  return false
}

function irProgramsUseNode(
  programs: IrProgram[],
  kind: string,
  collectionKind: string,
  dateStringContext: CDateStringRuntimeContext | null
): boolean {
  for (let index = 0; index < programs.length; index = index + 1) {
    const program = programs[index] as IrProgram

    if (nodeTreeUses(program.body, kind, collectionKind, dateStringContext)) {
      return true
    }
  }

  return false
}

function nodeTreeUses(
  value: any,
  kind: string,
  collectionKind: string,
  dateStringContext: CDateStringRuntimeContext | null
): boolean {
  if (value === null || typeof value === 'undefined') {
    return false
  }

  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index = index + 1) {
      if (nodeTreeUses(value[index], kind, collectionKind, dateStringContext)) {
        return true
      }
    }

    return false
  }

  if (typeof value !== 'object') {
    return false
  }

  const node = value as AnyNode

  return (
    nodeMatchesRuntimePlanKind(node, kind, collectionKind, dateStringContext) ||
    nodeChildrenUse(node, kind, collectionKind, dateStringContext)
  )
}

function nodeChildrenUse(
  node: AnyNode,
  kind: string,
  collectionKind: string,
  dateStringContext: CDateStringRuntimeContext | null
): boolean {
  return (
    nodeTreeUses(node.body, kind, collectionKind, dateStringContext) ||
    nodeTreeUses(node.params, kind, collectionKind, dateStringContext) ||
    nodeTreeUses(node.fields, kind, collectionKind, dateStringContext) ||
    nodeTreeUses(node.methods, kind, collectionKind, dateStringContext) ||
    nodeTreeUses(node.init, kind, collectionKind, dateStringContext) ||
    nodeTreeUses(node.condition, kind, collectionKind, dateStringContext) ||
    nodeTreeUses(node.consequent, kind, collectionKind, dateStringContext) ||
    nodeTreeUses(node.alternate, kind, collectionKind, dateStringContext) ||
    nodeTreeUses(node.test, kind, collectionKind, dateStringContext) ||
    nodeTreeUses(node.update, kind, collectionKind, dateStringContext) ||
    nodeTreeUses(node.iterable, kind, collectionKind, dateStringContext) ||
    nodeTreeUses(node.discriminant, kind, collectionKind, dateStringContext) ||
    nodeTreeUses(node.cases, kind, collectionKind, dateStringContext) ||
    nodeTreeUses(node.block, kind, collectionKind, dateStringContext) ||
    nodeTreeUses(node.handler, kind, collectionKind, dateStringContext) ||
    nodeTreeUses(node.finalizer, kind, collectionKind, dateStringContext) ||
    nodeTreeUses(node.argument, kind, collectionKind, dateStringContext) ||
    nodeTreeUses(node.args, kind, collectionKind, dateStringContext) ||
    nodeTreeUses(node.callee, kind, collectionKind, dateStringContext) ||
    nodeTreeUses(node.object, kind, collectionKind, dateStringContext) ||
    nodeTreeUses(node.index, kind, collectionKind, dateStringContext) ||
    nodeTreeUses(node.target, kind, collectionKind, dateStringContext) ||
    nodeTreeUses(node.value, kind, collectionKind, dateStringContext) ||
    nodeTreeUses(node.functionType, kind, collectionKind, dateStringContext) ||
    nodeTreeUses(node.returnShape, kind, collectionKind, dateStringContext) ||
    nodeTreeUses(node.left, kind, collectionKind, dateStringContext) ||
    nodeTreeUses(node.right, kind, collectionKind, dateStringContext) ||
    nodeTreeUses(node.elements, kind, collectionKind, dateStringContext) ||
    nodeTreeUses(node.properties, kind, collectionKind, dateStringContext) ||
    nodeTreeUses(node.expression, kind, collectionKind, dateStringContext)
  )
}

function nodeMatchesRuntimePlanKind(
  node: AnyNode,
  kind: string,
  collectionKind: string,
  dateStringContext: CDateStringRuntimeContext | null
): boolean {
  if (kind === 'array-includes') {
    return nodeIsArrayIncludesCall(node)
  }

  if (kind === 'collection') {
    return nodeUsesCollectionKind(node, collectionKind)
  }

  if (kind === 'date-string' && dateStringContext !== null && typeof dateStringContext !== 'undefined') {
    return dateStringRuntimeCall(node, dateStringContext)
  }

  return false
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
  return irProgramsUseNode(programs, 'date-string', '', context)
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
