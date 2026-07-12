import {
  irProgramsUseCPreludeFeature
} from '../features/index.ts'
import {
  dateInstanceRuntimeMethodName,
  dateInstanceRuntimeMethodReturnType
} from '../../stdlib/global/compiler/descriptor.ts'
import type { AnyNode, IrGlobalUsage, IrProgram, IrRuntimeRequirement } from '../types.ts'
import {
  isSupportedCFetchGlobalUsage,
  isSupportedCMathGlobalUsage
} from './diagnostics.ts'
import { irProgramsUseConsoleRuntime } from '../../stdlib/global/compiler/c.ts'
import { nodeStdlibRuntimeImportUsage } from '../stdlib/node/c.ts'
import type {
  CompilerLibrarySet,
  RuntimeEntrypointAdapterDescriptor,
  RuntimeRequirementDescriptor
} from '../extensions/types.ts'

export type CRuntimePreludeRequirements = {
  needsRuntime: boolean
  needsTimeRuntime: boolean
  needsMathRuntime: boolean
  needsDebugMemoryRuntime: boolean
  needsAsyncRuntime: boolean
  needsCallbackRuntime: boolean
  needsClassDescriptorRuntime: boolean
  needsCppValueRuntime: boolean
  needsStringHeader: boolean
  needsCollectionRuntime: boolean
  needsMapRuntime: boolean
  needsSetRuntime: boolean
  needsBinaryRuntime: boolean
  needsObjectRuntime: boolean
  needsFsRuntime: boolean
  needsJsonRuntime: boolean
  needsRegexpRuntime: boolean
  needsTimerRuntime: boolean
  needsConsoleRuntime: boolean
  needsDgramRuntime: boolean
  needsFetchRuntime: boolean
  needsHttpRuntime: boolean
  needsNetRuntime: boolean
  runtimeEntrypointAdapter: RuntimeEntrypointAdapterDescriptor | null
  libraryCPreludeIncludes: string[]
}

export type CRuntimePreludeRequirementInput = {
  classDescriptorCount: number
  cppValueRuntime: boolean
  globalUsages: IrGlobalUsage[]
  hasRuntimeCallbackWrapper: boolean
  irPrograms: IrProgram[]
  libraries?: CompilerLibrarySet
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
  const libraryRuntime = resolveLibraryRuntimeRequirements(
    input.runtimeRequirements,
    input.libraries
  )
  const runtimeRequirements = libraryRuntime.requirements
  const signatureRuntimeTypes: Set<string> = input.signatureRuntimeTypes ?? new Set()
  const needsCallbackRuntime =
    input.hasRuntimeCallbackWrapper ||
    runtimeRequirements.has('callback-values') ||
    signatureRuntimeTypes.has('function')
  const needsFsRuntime = runtimeRequirements.has('fs')
  const needsJsonRuntime = runtimeRequirements.has('json')
  const needsRegexpRuntime = irProgramsUseCPreludeFeature(input.irPrograms, 'regexp')
  const needsTimerRuntime = runtimeRequirements.has('timers')
  const needsDebugMemoryRuntime = runtimeRequirements.has('debug-memory')
  const needsFetchRuntime = runtimePlanHasSupportedFetchGlobalUsage(input.globalUsages)
  const needsAsyncRuntime =
    runtimeRequirements.has('async-runtime') ||
    needsFetchRuntime ||
    needsFsRuntime ||
    needsTimerRuntime ||
    signatureRuntimeTypes.has('promise')
  const needsCollectionRuntime =
    runtimeRequirements.has('collections') ||
    irProgramsUseArrayIsArray(input.irPrograms) ||
    irProgramsUseArrayIncludes(input.irPrograms) ||
    signatureRuntimeTypes.has('array') ||
    signatureRuntimeTypes.has('map') ||
    signatureRuntimeTypes.has('set')
  const needsMapRuntime =
    signatureRuntimeTypes.has('map') ||
    irProgramsUseCollectionKind(input.irPrograms, 'map')
  const needsSetRuntime =
    signatureRuntimeTypes.has('set') ||
    irProgramsUseCollectionKind(input.irPrograms, 'set')
  const needsBinaryRuntime = runtimeRequirements.has('binary') || signatureRuntimeTypes.has('bytes')
  const needsClassRuntime = input.classDescriptorCount > 0
  const needsClassDescriptorRuntime = needsClassRuntime
  const needsCppValueRuntime =
    input.cppValueRuntime ||
    runtimeRequirements.has('managed-values') ||
    runtimeRequirements.has('string-bytes') ||
    needsAsyncRuntime ||
    signatureRuntimeTypes.size > 0
  const nodeRuntimeImports = nodeStdlibRuntimeImportUsage(input.irPrograms)
  const needsDgramRuntime = nodeRuntimeImports.dgram
  const needsObjectRuntime =
    runtimeRequirements.has('objects') ||
    needsFsRuntime ||
    needsFetchRuntime ||
    needsClassRuntime ||
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
    needsCollectionRuntime ||
    needsObjectRuntime ||
    needsClassRuntime ||
    needsCppValueRuntime ||
    needsJsonRuntime ||
    signatureRuntimeTypes.size > 0 ||
    runtimeRequirements.has('managed-values')
  const needsTimeRuntime =
    runtimeRequirements.has('clocks') ||
    needsAsyncRuntime ||
    needsDgramRuntime ||
    needsFetchRuntime ||
    needsHttpRuntime ||
    needsNetRuntime
  const needsMathRuntime = runtimePlanHasSupportedMathGlobalUsage(input.globalUsages)
  const needsConsoleRuntime = irProgramsUseConsoleRuntime(input.irPrograms)
  const needsStringHeader =
    runtimeRequirements.has('string-bytes') ||
    needsFsRuntime ||
    needsDgramRuntime ||
    needsFetchRuntime ||
    needsNetRuntime ||
    signatureRuntimeTypes.has('string')

  return {
    needsRuntime,
    needsTimeRuntime,
    needsMathRuntime,
    needsDebugMemoryRuntime,
    needsAsyncRuntime,
    needsCallbackRuntime,
    needsClassDescriptorRuntime,
    needsCppValueRuntime,
    needsStringHeader,
    needsCollectionRuntime,
    needsMapRuntime,
    needsSetRuntime,
    needsBinaryRuntime,
    needsObjectRuntime,
    needsFsRuntime,
    needsJsonRuntime,
    needsRegexpRuntime,
    needsTimerRuntime,
    needsConsoleRuntime,
    needsDgramRuntime,
    needsFetchRuntime,
    needsHttpRuntime,
    needsNetRuntime,
    runtimeEntrypointAdapter: libraryRuntime.entrypointAdapter,
    libraryCPreludeIncludes: libraryRuntime.includes
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
        (
          entrypointAdapter.cFunction !== descriptorAdapter.cFunction ||
          entrypointAdapter.acceptsEntryPath !== descriptorAdapter.acceptsEntryPath
        )
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

    for (
      let includeIndex = 0;
      includeIndex < descriptor.cPreludeIncludes.length;
      includeIndex = includeIndex + 1
    ) {
      insertOrderedRuntimeRequirementId(includes, descriptor.cPreludeIncludes[includeIndex])
    }
  }

  return { entrypointAdapter, includes, requirements }
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

function irProgramsUseArrayIncludes(programs: IrProgram[]): boolean {
  return irProgramsUseNode(programs, 'array-includes', '', null)
}

function irProgramsUseArrayIsArray(programs: IrProgram[]): boolean {
  return irProgramsUseNode(programs, 'array-is-array', '', null)
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

  if (kind === 'array-is-array') {
    return node.arrayIsArrayCall === true
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
