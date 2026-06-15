import { CompileError } from '../diagnostics.ts'
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
import type { Diagnostic, IrFunctionDeclaration, IrFunctionEffect, IrProgram } from '../types.ts'
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
import {
  collectPromiseChainWrappers,
  emitPromiseChainCallbackWrapperDeclaration,
  emitPromiseChainCallbackWrapperHead
} from './async/promises.ts'
import {
  collectAsyncTaskWrappers,
  emitAsyncTaskFrameType,
  emitAsyncTaskWrapperDeclaration,
  emitAsyncTaskWrapperPrototypes
} from './async/tasks.ts'
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
import { collectHttpHandlers, emitHttpHandlerDeclaration, emitHttpHandlerHead } from './stdlib/http.ts'
import { collectNetHandlers, emitNetHandlerDeclaration, emitNetHandlerHead } from './stdlib/net.ts'
import type { CEmitOptions } from './types.ts'
import { collectClassMethods, createClassInfos } from './values/classes.ts'

export type CUnitDependencies = {
  asyncTaskLoweringDependencies: any
  callbackLoweringDependencies: any
  collectExternalEventLoopFunctions: (functions: any[]) => Set<any>
  createBaseContext: (
    diagnostics: Diagnostic[],
    functionDeclarations: IrFunctionDeclaration[],
    functionEffects: IrFunctionEffect[],
    jsGlobalRoots: Set<string>
  ) => any
  dgramLoweringDependencies: any
  emitClassMethodDeclaration: (info: any, method: any, baseContext: any) => string[]
  emitClassMethodHead: (info: any, method: any, context: any) => string
  emitFunctionDeclaration: (statement: any, baseContext: any) => string[]
  emitFunctionHead: (statement: any, context: any) => string
  emitMainWrapper: (irPrograms: IrProgram[], baseContext: any) => string[]
  httpLoweringDependencies: any
  netLoweringDependencies: any
  promiseChainLoweringDependencies: any
}

export function emitCUnit(
  irPrograms: IrProgram[],
  entryIrProgram: IrProgram | null = irPrograms.at(-1) ?? null,
  options: CEmitOptions = {},
  entryIrPrograms: IrProgram[] = entryIrProgram == null ? [] : [entryIrProgram],
  deps: CUnitDependencies
): string {
  const diagnostics: Diagnostic[] = []
  const functionEntries = collectIrFunctionNodeEntries(irPrograms)
  const functions = functionEntries.map((entry) => entry.node)
  const functionDeclarations = collectIrFunctionDeclarations(irPrograms)
  const functionEffects = collectIrStoredFunctionEffects(irPrograms)
  const globalUsages = collectIrGlobalUsages(irPrograms)
  const globalRoots = collectIrGlobalRoots(irPrograms)
  const runtimeRequirements = new Set(collectIrRuntimeRequirements(irPrograms))
  const syntaxFeatures = collectIrSyntaxFeatureUsages(irPrograms)
  const classes = collectIrTopLevelNodesFromPrograms(irPrograms, 'class')
  const jsGlobalRoots = new Set(globalRoots)
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
  const {
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
  } = resolveCRuntimePreludeRequirements({
    classInfoCount: baseContext.classInfos.size,
    cryptoContext: baseContext,
    globalUsages,
    hasRuntimeCallbackWrapper: [...baseContext.callbackWrappers.values()].some(isRuntimeCallbackWrapper),
    irPrograms,
    runtimeRequirements,
    throwingFunctionCount: baseContext.throwingFunctions.size
  })
  baseContext.processRuntime = needsProcessRuntime
  baseContext.unhandledRejectionFlag = needsAsyncRuntime ? 'ccjs_unhandled_rejection' : null
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
  const arrowCallbackWrappers = [...baseContext.callbackWrappers.values()].filter(
    isRuntimeArrowCallbackWrapperWithContext
  )
  const promiseChainCallbackWrappers = [...baseContext.promiseChainWrappers.values()].filter(
    isPromiseChainCallbackWrapperWithContext
  )

  for (const wrapper of baseContext.asyncTaskWrappers.values()) {
    lines.push(...emitAsyncTaskFrameType(wrapper))
    lines.push('')
  }

  for (const wrapper of arrowCallbackWrappers) {
    lines.push(...emitRuntimeArrowCallbackContextType(wrapper))
    lines.push('')
  }

  for (const wrapper of promiseChainCallbackWrappers) {
    lines.push(...emitRuntimeArrowCallbackContextType(wrapper))
    lines.push('')
  }

  if (baseContext.unhandledRejectionFlag != null) {
    lines.push(`static int ${baseContext.unhandledRejectionFlag} = 0;`)
    lines.push('')
  }

  for (const item of functions) {
    lines.push(`${deps.emitFunctionHead(item, baseContext)};`)
  }

  for (const { info, method } of classMethods) {
    lines.push(`${deps.emitClassMethodHead(info, method, baseContext)};`)
  }

  for (const wrapper of baseContext.asyncTaskWrappers.values()) {
    lines.push(...emitAsyncTaskWrapperPrototypes(wrapper))
  }

  for (const wrapper of baseContext.callbackWrappers.values()) {
    if (wrapper.kind === 'plain-arrow') {
      lines.push(`${emitPlainArrowCallbackWrapperHead(wrapper)};`)
      continue
    }

    if (isRuntimeArrowCallbackWrapperWithContext(wrapper)) {
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
    lines.push(...emitAsyncTaskWrapperDeclaration(wrapper, baseContext, deps.asyncTaskLoweringDependencies))
    lines.push('')
  }

  for (const wrapper of baseContext.callbackWrappers.values()) {
    lines.push(
      ...(wrapper.kind === 'plain-arrow'
        ? emitPlainArrowCallbackWrapperDeclaration(wrapper, baseContext, deps.callbackLoweringDependencies)
        : emitRuntimeCallbackWrapperDeclaration(wrapper, baseContext, deps.callbackLoweringDependencies))
    )
    lines.push('')
  }

  for (const wrapper of baseContext.promiseChainWrappers.values()) {
    lines.push(
      ...emitPromiseChainCallbackWrapperDeclaration(wrapper, baseContext, deps.promiseChainLoweringDependencies)
    )
    lines.push('')
  }

  for (const wrapper of baseContext.dgramMessageHandlers.values()) {
    lines.push(...emitDgramMessageHandlerDeclaration(wrapper, baseContext, deps.dgramLoweringDependencies))
    lines.push('')
  }

  for (const wrapper of baseContext.httpHandlers.values()) {
    lines.push(...emitHttpHandlerDeclaration(wrapper, baseContext, deps.httpLoweringDependencies))
    lines.push('')
  }

  for (const wrapper of baseContext.netHandlers.values()) {
    lines.push(...emitNetHandlerDeclaration(wrapper, baseContext, deps.netLoweringDependencies))
    lines.push('')
  }

  for (const item of functions) {
    lines.push(...deps.emitFunctionDeclaration(item, baseContext))
    lines.push('')
  }

  for (const { info, method } of classMethods) {
    lines.push(...deps.emitClassMethodDeclaration(info, method, baseContext))
    lines.push('')
  }

  lines.push(...deps.emitMainWrapper(entryIrPrograms, baseContext))

  if (diagnostics.length > 0) {
    throw new CompileError(diagnostics)
  }

  return `${lines.join('\n')}\n`
}
