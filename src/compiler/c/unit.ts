import { throwDiagnostics } from '../diagnostics.ts'
import {
  collectIrFunctionDeclarations,
  collectIrFunctionNodeEntries,
  collectIrGlobalRoots,
  collectIrGlobalUsages,
  collectIrRuntimeRequirements,
  collectIrStoredFunctionEffects,
  collectIrSyntaxFeatureUsages,
  collectIrTopLevelNodesFromPrograms
} from '../ir.ts'
import type {
  AnyNode,
  Diagnostic,
  IrFunctionDeclaration,
  IrFunctionEffect,
  IrProgram,
  IrRuntimeRequirement
} from '../types.ts'
import type { CPromiseChainWrapper, CRuntimeArrowCallbackWrapper } from './types.ts'
import {
  collectCallbackWrappers,
  emitPlainArrowCallbackWrapperDeclaration,
  emitPlainArrowCallbackWrapperHead,
  emitRuntimeArrowCallbackContextType,
  emitRuntimeCallbackWrapperDeclaration,
  emitRuntimeCallbackWrapperHead,
  isPromiseChainCallbackWrapperWithContext,
  isRuntimeArrowCallbackWrapperWithContext,
  isRuntimeCallbackWrapper
} from './async/callbacks.ts'
import type { CallbackLoweringDependencies } from './async/callbacks.ts'
import {
  collectPromiseChainWrappers,
  emitPromiseChainCallbackWrapperDeclaration,
  emitPromiseChainCallbackWrapperHead
} from './async/promises.ts'
import type { PromiseChainLoweringDependencies } from './async/promises.ts'
import {
  collectAsyncTaskWrappers,
  emitAsyncTaskFrameType,
  emitAsyncTaskWrapperDeclaration,
  emitAsyncTaskWrapperPrototypes
} from './async/tasks.ts'
import type { AsyncTaskLoweringDependencies } from './async/tasks.ts'
import type { CEmitContext } from './context.ts'
import { reportUnsupportedCGlobalUsages, reportUnsupportedCSyntaxFeatures } from './diagnostics.ts'
import { emitCPrelude } from './prelude.ts'
import {
  collectHttpRuntimeCreateServerNames,
  collectHttpRuntimeImportNames,
  collectRuntimeImportNames,
  collectRuntimeNamedImportNames
} from './runtime-imports.ts'
import { resolveCRuntimePreludeRequirements } from './runtime-plan.ts'
import {
  collectDgramMessageHandlers,
  emitDgramMessageHandlerDeclaration,
  emitDgramMessageHandlerHead
} from './stdlib/dgram.ts'
import type { DgramLoweringDependencies } from './stdlib/dgram.ts'
import {
  collectHttpHandlers,
  emitHttpHandlerDeclaration,
  emitHttpHandlerHead
} from './stdlib/http.ts'
import type { HttpLoweringDependencies } from './stdlib/http.ts'
import {
  collectNetHandlers,
  emitNetHandlerDeclaration,
  emitNetHandlerHead
} from './stdlib/net.ts'
import type { NetLoweringDependencies } from './stdlib/net.ts'
import type { CClassInfo, CClassMethod, CEmitOptions } from './types.ts'
import { collectClassMethods, createClassInfos } from './values/classes.ts'

export type CUnitDependencies = {
  asyncTaskLoweringDependencies: AsyncTaskLoweringDependencies
  callbackLoweringDependencies: CallbackLoweringDependencies
  collectExternalEventLoopFunctions: (functions: AnyNode[]) => Set<string>
  createBaseContext: (diagnostics: Diagnostic[], functionDeclarations: IrFunctionDeclaration[], functionEffects: IrFunctionEffect[], jsGlobalRoots: Set<string>) => CEmitContext
  dgramLoweringDependencies: DgramLoweringDependencies
  emitClassMethodDeclaration: (info: CClassInfo, method: AnyNode, baseContext: CEmitContext) => string[]
  emitClassMethodHead: (info: CClassInfo, method: AnyNode, context: CEmitContext) => string
  emitFunctionDeclaration: (statement: AnyNode, baseContext: CEmitContext) => string[]
  emitFunctionHead: (statement: AnyNode, context: CEmitContext) => string
  emitMainWrapper: (irPrograms: IrProgram[], baseContext: CEmitContext) => string[]
  httpLoweringDependencies: HttpLoweringDependencies
  netLoweringDependencies: NetLoweringDependencies
  promiseChainLoweringDependencies: PromiseChainLoweringDependencies
}

function pushUnitLines(target: string[], lines: string[]): void {
  for (const line of lines) {
    target.push(line)
  }
}

function collectUnitFunctionNodes(functionEntries: AnyNode[]): AnyNode[] {
  const functions: AnyNode[] = []

  for (const entry of functionEntries) {
    functions.push(entry.node)
  }

  return functions
}

function hasCUnitRuntimeCallbackWrapper(baseContext: CEmitContext): boolean {
  for (const wrapper of baseContext.callbackWrappers.values()) {
    if (isRuntimeCallbackWrapper(wrapper)) {
      return true
    }
  }

  return false
}

function joinCUnitLines(lines: string[]): string {
  let output = ''

  for (const line of lines) {
    output = `${output}${line}\n`
  }

  return output
}

function unitRuntimeRequirementAt(values: IrRuntimeRequirement[], index: number): IrRuntimeRequirement {
  return values[index]
}

function unitStringAt(values: string[], index: number): string {
  return values[index]
}

function runtimeRequirementSetFromArray(values: IrRuntimeRequirement[]): Set<IrRuntimeRequirement> {
  const result: Set<IrRuntimeRequirement> = new Set()

  for (let index = 0; index < values.length; index = index + 1) {
    result.add(unitRuntimeRequirementAt(values, index))
  }

  return result
}

function stringSetFromArray(values: string[]): Set<string> {
  const result: Set<string> = new Set()

  for (let index = 0; index < values.length; index = index + 1) {
    result.add(unitStringAt(values, index))
  }

  return result
}

export function emitCUnit(
  irPrograms: IrProgram[],
  entryIrProgram: IrProgram | null,
  options: CEmitOptions,
  entryIrPrograms: IrProgram[],
  deps: CUnitDependencies
): string {
  const diagnostics: Diagnostic[] = []
  const functionEntries = collectIrFunctionNodeEntries(irPrograms)
  const functions = collectUnitFunctionNodes(functionEntries)
  const functionDeclarations = collectIrFunctionDeclarations(irPrograms)
  const functionEffects = collectIrStoredFunctionEffects(irPrograms)
  const globalUsages = collectIrGlobalUsages(irPrograms)
  const globalRoots = collectIrGlobalRoots(irPrograms)
  const runtimeRequirements = runtimeRequirementSetFromArray(collectIrRuntimeRequirements(irPrograms))
  const syntaxFeatures = collectIrSyntaxFeatureUsages(irPrograms)
  const classes = collectIrTopLevelNodesFromPrograms(irPrograms, 'class')
  const jsGlobalRoots = stringSetFromArray(globalRoots)
  const baseContext = deps.createBaseContext(diagnostics, functionDeclarations, functionEffects, jsGlobalRoots)
  baseContext.dgramImportNames = collectRuntimeImportNames(
    irPrograms,
    new Set(['dgram', 'node:dgram']),
    new Set(['default', 'dgram'])
  )
  baseContext.dgramCreateSocketNames = collectRuntimeNamedImportNames(
    irPrograms,
    new Set(['dgram', 'node:dgram']),
    'createSocket'
  )
  baseContext.cryptoImportNames = collectRuntimeImportNames(
    irPrograms,
    new Set(['node:crypto']),
    new Set(['default', 'crypto'])
  )
  baseContext.httpImportNames = collectHttpRuntimeImportNames(irPrograms)
  baseContext.httpCreateServerNames = collectHttpRuntimeCreateServerNames(irPrograms)
  baseContext.netImportNames = collectRuntimeImportNames(
    irPrograms,
    new Set(['net', 'node:net']),
    new Set(['default', 'net'])
  )
  baseContext.netCreateServerNames = collectRuntimeNamedImportNames(
    irPrograms,
    new Set(['net', 'node:net']),
    'createServer'
  )
  baseContext.netConnectNames = collectRuntimeNamedImportNames(irPrograms, new Set(['net', 'node:net']), 'connect')
  for (const name of collectRuntimeNamedImportNames(irPrograms, new Set(['net', 'node:net']), 'createConnection')) {
    baseContext.netConnectNames.add(name)
  }
  baseContext.classInfos = createClassInfos(classes, diagnostics)
  baseContext.externalEventLoopFunctions = deps.collectExternalEventLoopFunctions(functions)
  baseContext.callbackWrappers = collectCallbackWrappers(irPrograms, baseContext, deps.callbackLoweringDependencies)
  baseContext.promiseChainWrappers = collectPromiseChainWrappers(
    irPrograms,
    baseContext,
    deps.promiseChainLoweringDependencies
  )
  baseContext.asyncTaskWrappers = collectAsyncTaskWrappers(
    functionEntries,
    baseContext,
    deps.asyncTaskLoweringDependencies
  )
  baseContext.dgramMessageHandlers = collectDgramMessageHandlers(irPrograms, baseContext)
  baseContext.httpHandlers = collectHttpHandlers(irPrograms, baseContext)
  baseContext.netHandlers = collectNetHandlers(irPrograms, baseContext)
  const classMethods = collectClassMethods(baseContext)
  const preludeRequirements = resolveCRuntimePreludeRequirements({
    classInfoCount: baseContext.classInfos.size,
    cryptoContext: baseContext,
    globalUsages,
    hasRuntimeCallbackWrapper: hasCUnitRuntimeCallbackWrapper(baseContext),
    irPrograms,
    runtimeRequirements,
    throwingFunctionCount: baseContext.throwingFunctions.size
  })
  const needsRuntime = preludeRequirements.needsRuntime
  const needsTimeRuntime = preludeRequirements.needsTimeRuntime
  const needsMathRuntime = preludeRequirements.needsMathRuntime
  const needsCryptoRuntime = preludeRequirements.needsCryptoRuntime
  const needsDebugMemoryRuntime = preludeRequirements.needsDebugMemoryRuntime
  const needsAsyncRuntime = preludeRequirements.needsAsyncRuntime
  const needsCallbackRuntime = preludeRequirements.needsCallbackRuntime
  const needsStringHeader = preludeRequirements.needsStringHeader
  const needsCollectionRuntime = preludeRequirements.needsCollectionRuntime
  const needsBinaryRuntime = preludeRequirements.needsBinaryRuntime
  const needsObjectRuntime = preludeRequirements.needsObjectRuntime
  const needsChildProcessRuntime = preludeRequirements.needsChildProcessRuntime
  const needsFsRuntime = preludeRequirements.needsFsRuntime
  const needsOsRuntime = preludeRequirements.needsOsRuntime
  const needsPathRuntime = preludeRequirements.needsPathRuntime
  const needsUrlRuntime = preludeRequirements.needsUrlRuntime
  const needsProcessRuntime = preludeRequirements.needsProcessRuntime
  const needsJsonRuntime = preludeRequirements.needsJsonRuntime
  const needsTimerRuntime = preludeRequirements.needsTimerRuntime
  const needsConsoleRuntime = preludeRequirements.needsConsoleRuntime
  const needsDgramRuntime = preludeRequirements.needsDgramRuntime
  const needsFetchRuntime = preludeRequirements.needsFetchRuntime
  const needsHttpRuntime = preludeRequirements.needsHttpRuntime
  const needsNetRuntime = preludeRequirements.needsNetRuntime
  baseContext.processRuntime = needsProcessRuntime
  if (needsAsyncRuntime) {
    baseContext.unhandledRejectionFlag = 'ccjs_unhandled_rejection'
  } else {
    baseContext.unhandledRejectionFlag = null
  }
  reportUnsupportedCSyntaxFeatures(syntaxFeatures, diagnostics)
  reportUnsupportedCGlobalUsages(globalUsages, diagnostics, baseContext)
  const lines = emitCPrelude(
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
    needsNetRuntime,
    options
  )
  const arrowCallbackWrappers: CRuntimeArrowCallbackWrapper[] = []
  const promiseChainCallbackWrappers: CPromiseChainWrapper[] = []

  for (const wrapper of baseContext.callbackWrappers.values()) {
    if (wrapper.kind === 'arrow' && isRuntimeArrowCallbackWrapperWithContext(wrapper)) {
      arrowCallbackWrappers.push(wrapper)
    }
  }

  for (const wrapper of baseContext.promiseChainWrappers.values()) {
    if (isPromiseChainCallbackWrapperWithContext(wrapper)) {
      promiseChainCallbackWrappers.push(wrapper)
    }
  }

  for (const wrapper of baseContext.asyncTaskWrappers.values()) {
    pushUnitLines(lines, emitAsyncTaskFrameType(wrapper))
    lines.push('')
  }

  for (const wrapper of arrowCallbackWrappers) {
    pushUnitLines(lines, emitRuntimeArrowCallbackContextType(wrapper))
    lines.push('')
  }

  for (const wrapper of promiseChainCallbackWrappers) {
    pushUnitLines(lines, emitRuntimeArrowCallbackContextType(wrapper))
    lines.push('')
  }

  if (baseContext.unhandledRejectionFlag != null) {
    lines.push(`static int ${baseContext.unhandledRejectionFlag} = 0;`)
    lines.push('')
  }

  for (const item of functions) {
    lines.push(`${deps.emitFunctionHead(item, baseContext)};`)
  }

  for (const classMethod of classMethods) {
    lines.push(`${deps.emitClassMethodHead(classMethod.info, classMethod.method, baseContext)};`)
  }

  for (const wrapper of baseContext.asyncTaskWrappers.values()) {
    pushUnitLines(lines, emitAsyncTaskWrapperPrototypes(wrapper))
  }

  for (const wrapper of baseContext.callbackWrappers.values()) {
    if (wrapper.kind === 'plain-arrow') {
      lines.push(`${emitPlainArrowCallbackWrapperHead(wrapper)};`)
      continue
    }

    if (wrapper.kind === 'arrow' && isRuntimeArrowCallbackWrapperWithContext(wrapper)) {
      lines.push(`static void ${wrapper.finalizerName}(void* context);`)
    }

    lines.push(`${emitRuntimeCallbackWrapperHead(wrapper)};`)
  }

  for (const wrapper of baseContext.promiseChainWrappers.values()) {
    if (isPromiseChainCallbackWrapperWithContext(wrapper)) {
      lines.push(`static void ${wrapper.finalizerName}(void* context);`)
    }

    lines.push(`${emitPromiseChainCallbackWrapperHead(wrapper)};`)
  }

  for (const wrapper of baseContext.dgramMessageHandlers.values()) {
    lines.push(`${emitDgramMessageHandlerHead(wrapper)};`)
  }

  for (const wrapper of baseContext.httpHandlers.values()) {
    lines.push(`${emitHttpHandlerHead(wrapper)};`)
  }

  for (const wrapper of baseContext.netHandlers.values()) {
    lines.push(`${emitNetHandlerHead(wrapper)};`)
  }

  if (
    functions.length > 0 ||
    classMethods.length > 0 ||
    baseContext.asyncTaskWrappers.size > 0 ||
    baseContext.callbackWrappers.size > 0 ||
    baseContext.promiseChainWrappers.size > 0 ||
    baseContext.dgramMessageHandlers.size > 0 ||
    baseContext.httpHandlers.size > 0 ||
    baseContext.netHandlers.size > 0
  ) {
    lines.push('')
  }

  for (const wrapper of baseContext.asyncTaskWrappers.values()) {
    pushUnitLines(lines, emitAsyncTaskWrapperDeclaration(wrapper, baseContext, deps.asyncTaskLoweringDependencies))
    lines.push('')
  }

  for (const wrapper of baseContext.callbackWrappers.values()) {
    if (wrapper.kind === 'plain-arrow') {
      pushUnitLines(lines, emitPlainArrowCallbackWrapperDeclaration(wrapper, baseContext, deps.callbackLoweringDependencies))
    } else {
      pushUnitLines(lines, emitRuntimeCallbackWrapperDeclaration(wrapper, baseContext, deps.callbackLoweringDependencies))
    }

    lines.push('')
  }

  for (const wrapper of baseContext.promiseChainWrappers.values()) {
    pushUnitLines(lines, emitPromiseChainCallbackWrapperDeclaration(wrapper, baseContext, deps.promiseChainLoweringDependencies))
    lines.push('')
  }

  for (const wrapper of baseContext.dgramMessageHandlers.values()) {
    pushUnitLines(lines, emitDgramMessageHandlerDeclaration(wrapper, baseContext, deps.dgramLoweringDependencies))
    lines.push('')
  }

  for (const wrapper of baseContext.httpHandlers.values()) {
    pushUnitLines(lines, emitHttpHandlerDeclaration(wrapper, baseContext, deps.httpLoweringDependencies))
    lines.push('')
  }

  for (const wrapper of baseContext.netHandlers.values()) {
    pushUnitLines(lines, emitNetHandlerDeclaration(wrapper, baseContext, deps.netLoweringDependencies))
    lines.push('')
  }

  for (const item of functions) {
    pushUnitLines(lines, deps.emitFunctionDeclaration(item, baseContext))
    lines.push('')
  }

  for (const classMethod of classMethods) {
    pushUnitLines(lines, deps.emitClassMethodDeclaration(classMethod.info, classMethod.method, baseContext))
    lines.push('')
  }

  pushUnitLines(lines, deps.emitMainWrapper(entryIrPrograms, baseContext))

  throwDiagnostics(diagnostics)

  return joinCUnitLines(lines)
}
