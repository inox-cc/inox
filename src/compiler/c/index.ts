import { CompileError, diagnostic } from '../diagnostics.ts'
import {
  collectIrFunctionDeclarations,
  collectIrFunctionNodeEntries,
  collectIrGlobalRoots,
  collectIrGlobalUsages,
  collectIrLocalThrowValueTypes,
  collectIrPrograms,
  collectIrRuntimeRequirements,
  collectIrStoredFunctionEffects,
  collectIrSyntaxFeatureUsages,
  collectIrTopLevelNodeEntries,
  collectIrTopLevelNodes,
  collectIrTopLevelNodesFromPrograms,
  findIrEntryProgram
} from '../ir.ts'
import { tokenize } from '../lexer.ts'
import { parse } from '../parser.ts'
import {
  createFunctionContext,
  emitBoxedValueCleanup,
  emitBoxedValueDeclarations,
  emitCleanupReturn,
  emitErrorChannelDeclarations,
  emitEventLoopCleanup,
  emitEventLoopCurrentTimeExpression,
  emitEventLoopDeclarations,
  emitEventLoopDrain,
  emitEventLoopInit,
  emitEventLoopNextTimeExpression,
  emitEventLoopReference,
  emitEventLoopSleepUntilNextTimerLines,
  emitFailureStatement,
  emitLoopFlowDeclarations,
  emitOwnedPromiseCleanup,
  emitOwnedPromiseDeclarations,
  emitOwnedValueCleanup,
  emitOwnedValueDeclarations,
  emitPrepareOwnedValueWrite,
  emitReturnFlowDeclarations,
  emitReturnValueDeclarations,
  emitRuntimeTypeCheck,
  emitStatusCheck,
  emitStatusResultDeclarations,
  emitThrowingFunctionErrorTransfer,
  isRuntimeBoxedValueType,
  narrowNullableScalars,
  nextCName,
  registerBoxedValue,
  registerEventLoop,
  registerOwnedPromise,
  registerOwnedValue,
  shouldEmitCleanupLabel,
  withNullableScalarNarrowing,
  withVariableScope
} from './context.ts'
import {
  isSupportedCCryptoGlobalUsage,
  isSupportedCFetchGlobalUsage,
  isSupportedCMathGlobalUsage,
  reportCJsGlobalDiagnostic,
  reportUnsupportedCGlobalUsages,
  reportUnsupportedCSyntaxFeatures
} from './diagnostics.ts'
import { formatGeneratedC } from './format.ts'
import { cStringLiteral, emitCFunctionName, emitCIdentifier, escapeCString, utf8ByteLength } from './identifiers.ts'
import {
  emitCModuleFilesFromGraph as emitCModuleFilesFromGraphWithEmitters,
  relativeCIncludePath,
  uniqueCModuleImports
} from './modules.ts'
import { emitCPrelude } from './prelude.ts'
import {
  collectHttpRuntimeCreateServerNames,
  collectHttpRuntimeImportNames,
  collectRuntimeImportNames,
  collectRuntimeNamedImportNames,
  irProgramsUseRuntimeImport
} from './runtime-imports.ts'
import { emitRuntimeNullableValueCheck, emitRuntimeValueCheck } from './runtime-values.ts'
import { mathRuntimeMethodName } from './runtime-methods.ts'
import {
  cPromiseRuntimeCallName,
  functionTakesEventLoopParam,
  isAsyncFunctionCallee,
  isExternalEventLoopFunctionCallee,
  isPromiseConstructorExpression,
  isPromiseMethodAst,
  isPromiseReturningFunctionCallee,
  knownValueType,
  resolveCAsyncFunctionAwaitValueType,
  resolvePromiseExpressionValueType,
  resolvePromiseReturningFunctionValueType
} from './async/promises.ts'
import {
  binaryRuntimeMethodName,
  isBinaryConstructorExpression,
  isBinaryRuntimeCall,
  isBufferAllocCall,
  isBufferFromCall
} from './stdlib/binary.ts'
import { irProgramsUseConsoleRuntime, isConsoleLog } from './stdlib/console.ts'
import { cCryptoRuntimeCallName, cryptoRuntimeMethodName } from './stdlib/crypto.ts'
import { cFetchRuntimeExpressionMethod, isAsyncFetchRuntimeCallExpression } from './stdlib/fetch.ts'
import { cFsRuntimeConstantExpression, cFsRuntimeExpressionMethod, isAsyncFsRuntimeCallExpression } from './stdlib/fs.ts'
import { cJsonRuntimeCallName } from './stdlib/json.ts'
import {
  cTimerClearCallName,
  cTimerRuntimeCallName,
  cTimerStartCallName,
  timerCallbackFunctionType
} from './stdlib/timers.ts'
import {
  cUnsupportedExpressionCode,
  cUnsupportedVariableDeclarationCode,
  containsAwaitExpression,
  emitCOperator,
  isNullishCoalescingExpression,
  isOptionalChainExpression
} from './syntax.ts'
import type { IrFunctionNodeEntry, IrModuleRecord } from '../ir.ts'
import type { CEmitOptions, CModuleEmitOptions, CModuleOutputFile, CModulePlan } from './types.ts'
import {
  cRuntimeValueTag,
  emitCObjectParamName,
  emitCReturnType,
  emitCScalarParamName,
  emitCStringParamName,
  emitCType,
  emitThrowingFunctionOutType,
  isManagedRuntimeReturnType,
  isNullableScalarParam,
  isNullableScalarType,
  isRuntimeNullableType,
  isThrowingFunctionRuntimeOut
} from './value-types.ts'
import type {
  AnyNode,
  Diagnostic,
  IrFunctionDeclaration,
  IrFunctionEffect,
  IrProgram,
  ModuleGraph,
  SourceLocation
} from '../types.ts'
export type { CModuleOutputFile } from './types.ts'

const cStringPredicateMethods = new Set(['includes', 'startsWith', 'endsWith'])

const cArrayMethods = new Set(['sort', 'filter', 'map', 'push', 'pop'])

type AsyncTaskSuccessPhaseKind = 'pre-finalizer' | 'prefix-finalizer' | 'body'
type AsyncTaskTryPhaseKind = 'success-finalizer' | 'reject-finalizer' | 'handler-prelude' | 'handler-finalizer'
type AsyncTaskPhaseKind = AsyncTaskSuccessPhaseKind | AsyncTaskTryPhaseKind

type AsyncTaskPhase = {
  kind: AsyncTaskPhaseKind
  statements: any[]
}

type AsyncTaskFrameLocalKind = 'prefix' | 'await'

type AsyncTaskFrameLocal = Record<string, any> & {
  kind: AsyncTaskFrameLocalKind
  name: string | null
  type: string
  fieldName: string
}

type AsyncTaskTryHandlerPlan = {
  param: string | null
  statements: any[]
  returnExpression: any
}

type AsyncTaskTryRegionDraft = {
  handler: AsyncTaskTryHandlerPlan | null
  preHandlerFinalizerStatements: any[]
  successFinalizerStatements: any[]
  handlerFinalizerStatements: any[]
}

type AsyncTaskBodyDraft = {
  awaits: any[]
  prefixStatements: any[]
  prefixLocals: any[]
  successPreFinalizerStatements: any[]
  successPrefixFinalizerStatements: any[]
  successStatements: any[]
  returnExpression: any
  returnType: string
  tryRegion: AsyncTaskTryRegionDraft | null
}

type AsyncTaskBodyPlan = {
  awaits: any[]
  prefixStatements: any[]
  frameLocals: AsyncTaskFrameLocal[]
  successPhases: AsyncTaskPhase[]
  tryPhases: AsyncTaskPhase[]
  returnExpression: any
  returnType: string
  hasTryRegion: boolean
  tryHandler: AsyncTaskTryHandlerPlan | null
}

export function emitCFromIr(ir: IrProgram, options: CEmitOptions = {}): string {
  return formatGeneratedC(emitCUnit([ir], ir, options, [ir]), 'ccjs.generated.c')
}

export function emitCBundleFromIrModules(
  irModules: IrModuleRecord[],
  entry: string,
  options: CEmitOptions = {}
): string {
  const irPrograms = collectIrPrograms(irModules)
  const entryIndex = irModules.findIndex((module) => module.path === entry)
  const entryIrPrograms = collectIrPrograms(entryIndex < 0 ? irModules : irModules.slice(0, entryIndex + 1))
  const entryIr = findIrEntryProgram(irModules, entry)

  return formatGeneratedC(emitCUnit(irPrograms, entryIr, options, entryIrPrograms), 'ccjs.bundle.c')
}

export function emitCModuleFilesFromGraph(graph: ModuleGraph, options: CModuleEmitOptions = {}): CModuleOutputFile[] {
  return emitCModuleFilesFromGraphWithEmitters(graph, options, {
    emitHeader: emitCModuleHeader,
    emitSource: emitCModuleSource
  })
}

function emitCModuleSource(
  plan: CModulePlan,
  plans: CModulePlan[],
  options: CModuleEmitOptions,
  diagnostics: Diagnostic[]
): string {
  const irPrograms = [plan.ir]
  const functionEntries = collectIrFunctionNodeEntries(irPrograms)
  const functions = functionEntries.map((entry) => entry.node)
  const context = createCModuleBaseContext(plan, plans, diagnostics)
  const runtimeRequirements = new Set(collectIrRuntimeRequirements(irPrograms))
  const globalUsages = collectIrGlobalUsages(irPrograms)
  const syntaxFeatures = collectIrSyntaxFeatureUsages(irPrograms)
  const signatureRuntimeTypes = collectCModuleContextRuntimeTypes(context)
  const needsCallbackRuntime =
    [...context.callbackWrappers.values()].some(isRuntimeCallbackWrapper) ||
    runtimeRequirements.has('callback-values') ||
    signatureRuntimeTypes.has('function')
  const needsFsRuntime = runtimeRequirements.has('fs')
  const needsJsonRuntime = runtimeRequirements.has('json')
  const needsTimerRuntime = runtimeRequirements.has('timers')
  const needsFetchRuntime = globalUsages.some(isSupportedCFetchGlobalUsage)
  const needsAsyncRuntime =
    runtimeRequirements.has('async-runtime') ||
    needsFetchRuntime ||
    needsFsRuntime ||
    needsTimerRuntime ||
    signatureRuntimeTypes.has('promise')
  const needsCollectionRuntime =
    runtimeRequirements.has('collections') ||
    signatureRuntimeTypes.has('array') ||
    signatureRuntimeTypes.has('map') ||
    signatureRuntimeTypes.has('set')
  const needsBinaryRuntime = runtimeRequirements.has('binary') || signatureRuntimeTypes.has('bytes')
  const needsClassRuntime = context.classInfos.size > 0
  const needsDgramRuntime = irProgramsUseRuntimeImport(irPrograms, new Set(['dgram', 'node:dgram']))
  const needsObjectRuntime =
    runtimeRequirements.has('objects') ||
    needsFsRuntime ||
    needsFetchRuntime ||
    needsClassRuntime ||
    signatureRuntimeTypes.has('object')
  const needsHttpRuntime = irProgramsUseRuntimeImport(irPrograms, new Set(['http', 'node:http']))
  const needsNetRuntime = irProgramsUseRuntimeImport(irPrograms, new Set(['net', 'node:net']))
  const needsRuntime =
    context.throwingFunctions.size > 0 ||
    needsAsyncRuntime ||
    needsDgramRuntime ||
    needsFetchRuntime ||
    needsHttpRuntime ||
    needsNetRuntime ||
    needsCallbackRuntime ||
    needsCollectionRuntime ||
    needsObjectRuntime ||
    needsClassRuntime ||
    needsJsonRuntime ||
    signatureRuntimeTypes.size > 0 ||
    runtimeRequirements.has('managed-values')
  const needsTimeRuntime =
    runtimeRequirements.has('clocks') || needsAsyncRuntime || needsDgramRuntime || needsFetchRuntime || needsHttpRuntime || needsNetRuntime
  const needsMathRuntime = globalUsages.some(isSupportedCMathGlobalUsage)
  const needsCryptoRuntime = globalUsages.some(isSupportedCCryptoGlobalUsage)
  const needsConsoleRuntime = irProgramsUseConsoleRuntime(irPrograms)
  const needsStringHeader =
    runtimeRequirements.has('string-bytes') ||
    needsFsRuntime ||
    needsDgramRuntime ||
    needsFetchRuntime ||
    needsNetRuntime ||
    signatureRuntimeTypes.has('string')
  const classMethods = collectClassMethods(context)

  context.unhandledRejectionFlag = needsAsyncRuntime ? `${plan.symbolPrefix}_unhandled_rejection` : null
  reportUnsupportedCSyntaxFeatures(syntaxFeatures, diagnostics)
  reportUnsupportedCGlobalUsages(globalUsages, diagnostics, context)

  const lines = [
    `#include "${relativeCIncludePath(plan.sourcePath, plan.headerPath)}"`,
    ...uniqueCModuleImports(plan.imports)
      .filter((item) => item.module.headerPath !== plan.headerPath)
      .map((item) => `#include "${relativeCIncludePath(plan.sourcePath, item.module.headerPath)}"`),
    ''
  ]

  lines.push(
    ...emitCPrelude(
      needsRuntime,
      needsTimeRuntime,
      needsMathRuntime,
      needsCryptoRuntime,
      needsAsyncRuntime,
      needsCallbackRuntime,
      needsStringHeader,
      needsCollectionRuntime,
      needsBinaryRuntime,
      needsObjectRuntime,
      needsFsRuntime,
      needsJsonRuntime,
      needsTimerRuntime,
      needsConsoleRuntime,
      needsDgramRuntime,
      needsFetchRuntime,
      needsHttpRuntime,
      needsNetRuntime,
      options
    )
  )

  emitCModuleDeclarations(lines, functions, classMethods, context)

  for (const wrapper of context.asyncTaskWrappers.values()) {
    lines.push(...emitAsyncTaskWrapperDeclaration(wrapper, context))
    lines.push('')
  }

  for (const wrapper of context.callbackWrappers.values()) {
    lines.push(
      ...(wrapper.kind === 'plain-arrow'
        ? emitPlainArrowCallbackWrapperDeclaration(wrapper, context)
        : emitRuntimeCallbackWrapperDeclaration(wrapper, context))
    )
    lines.push('')
  }

  for (const wrapper of context.promiseChainWrappers.values()) {
    lines.push(...emitPromiseChainCallbackWrapperDeclaration(wrapper, context))
    lines.push('')
  }

  for (const wrapper of context.dgramMessageHandlers.values()) {
    lines.push(...emitDgramMessageHandlerDeclaration(wrapper, context))
    lines.push('')
  }

  for (const wrapper of context.httpHandlers.values()) {
    lines.push(...emitHttpHandlerDeclaration(wrapper, context))
    lines.push('')
  }

  for (const wrapper of context.netHandlers.values()) {
    lines.push(...emitNetHandlerDeclaration(wrapper, context))
    lines.push('')
  }

  for (const item of functions) {
    lines.push(...emitFunctionDeclaration(item, context))
    lines.push('')
  }

  for (const { info, method } of classMethods) {
    lines.push(...emitClassMethodDeclaration(info, method, context))
    lines.push('')
  }

  if (!plan.isEntry && plan.initName != null) {
    lines.push(...emitCModuleInitFunction(plan, context))
  } else {
    lines.push(...emitCModuleMainFunction(plan, context))
  }

  return `${lines.join('\n')}\n`
}

function emitCModuleHeader(plan: CModulePlan, plans: CModulePlan[], diagnostics: Diagnostic[]): string {
  const context = createCModuleBaseContext(plan, plans, diagnostics)
  const exportedFunctions = collectCModuleExportedFunctions(plan)
  const lines = [
    `#ifndef ${plan.headerGuard}`,
    `#define ${plan.headerGuard}`,
    '',
    '#include "ccjs/value.h"',
    '#include "ccjs/loop.h"',
    '#include "ccjs/promise.h"',
    ''
  ]

  if (plan.initName != null) {
    lines.push(`void ${plan.initName}(void);`)
  }

  for (const item of exportedFunctions) {
    lines.push(`${emitFunctionHead(item, context)};`)
  }

  lines.push('')
  lines.push(`#endif`)

  return `${lines.join('\n')}\n`
}

function emitCModuleDeclarations(lines: string[], functions, classMethods, context): void {
  const arrowCallbackWrappers = [...context.callbackWrappers.values()].filter(isRuntimeArrowCallbackWrapperWithContext)
  const promiseChainCallbackWrappers = [...context.promiseChainWrappers.values()].filter(
    isPromiseChainCallbackWrapperWithContext
  )

  for (const wrapper of context.asyncTaskWrappers.values()) {
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

  if (context.unhandledRejectionFlag != null) {
    lines.push(`static int ${context.unhandledRejectionFlag} = 0;`)
    lines.push('')
  }

  for (const item of functions) {
    lines.push(`${emitFunctionHead(item, context)};`)
  }

  for (const { info, method } of classMethods) {
    lines.push(`${emitClassMethodHead(info, method, context)};`)
  }

  for (const wrapper of context.asyncTaskWrappers.values()) {
    lines.push(...emitAsyncTaskWrapperPrototypes(wrapper))
  }

  for (const wrapper of context.callbackWrappers.values()) {
    if (wrapper.kind === 'plain-arrow') {
      lines.push(`${emitPlainArrowCallbackWrapperHead(wrapper)};`)
      continue
    }

    if (isRuntimeArrowCallbackWrapperWithContext(wrapper)) {
      lines.push(`static void ${wrapper.finalizerName}(void* context);`)
    }

    lines.push(`${emitRuntimeCallbackWrapperHead(wrapper)};`)
  }

  for (const wrapper of context.promiseChainWrappers.values()) {
    if (isPromiseChainCallbackWrapperWithContext(wrapper)) {
      lines.push(`static void ${wrapper.finalizerName}(void* context);`)
    }

    lines.push(`${emitPromiseChainCallbackWrapperHead(wrapper)};`)
  }

  for (const wrapper of context.dgramMessageHandlers.values()) {
    lines.push(`${emitDgramMessageHandlerHead(wrapper)};`)
  }

  for (const wrapper of context.httpHandlers.values()) {
    lines.push(`${emitHttpHandlerHead(wrapper)};`)
  }

  for (const wrapper of context.netHandlers.values()) {
    lines.push(`${emitNetHandlerHead(wrapper)};`)
  }

  if (
    functions.length > 0 ||
    classMethods.length > 0 ||
    context.asyncTaskWrappers.size > 0 ||
    context.callbackWrappers.size > 0 ||
    context.promiseChainWrappers.size > 0 ||
    context.dgramMessageHandlers.size > 0 ||
    context.httpHandlers.size > 0 ||
    context.netHandlers.size > 0
  ) {
    lines.push('')
  }
}

function createCModuleBaseContext(plan: CModulePlan, plans: CModulePlan[], diagnostics: Diagnostic[]) {
  const irPrograms = [plan.ir]
  const importedDeclarations = collectCModuleImportedFunctionDeclarations(plan)
  const functionEntries = collectIrFunctionNodeEntries(irPrograms)
  const functions = functionEntries.map((entry) => entry.node)
  const functionDeclarations = [...collectIrFunctionDeclarations(irPrograms), ...importedDeclarations]
  const functionEffects = [
    ...collectIrStoredFunctionEffects(irPrograms),
    ...collectImportedCModuleFunctionEffects(plan)
  ]
  const globalRoots = collectIrGlobalRoots(irPrograms)
  const jsGlobalRoots = new Set(globalRoots)
  const context = createBaseContext(diagnostics, functionDeclarations, functionEffects, jsGlobalRoots)

  context.dgramImportNames = collectRuntimeImportNames(irPrograms, new Set(['dgram', 'node:dgram']), new Set(['default', 'dgram']))
  context.dgramCreateSocketNames = collectRuntimeNamedImportNames(irPrograms, new Set(['dgram', 'node:dgram']), 'createSocket')
  context.httpImportNames = collectHttpRuntimeImportNames(irPrograms)
  context.httpCreateServerNames = collectHttpRuntimeCreateServerNames(irPrograms)
  context.netImportNames = collectRuntimeImportNames(irPrograms, new Set(['net', 'node:net']), new Set(['default', 'net']))
  context.netCreateServerNames = collectRuntimeNamedImportNames(irPrograms, new Set(['net', 'node:net']), 'createServer')
  context.netConnectNames = collectRuntimeNamedImportNames(irPrograms, new Set(['net', 'node:net']), 'connect')
  for (const name of collectRuntimeNamedImportNames(irPrograms, new Set(['net', 'node:net']), 'createConnection')) {
    context.netConnectNames.add(name)
  }
  context.functionNames = createCModuleFunctionNames(plan)
  context.classInfos = createClassInfos(collectIrTopLevelNodes(plan.ir, 'class'), diagnostics)
  context.externalEventLoopFunctions = collectExternalEventLoopFunctions(functions)
  context.callbackWrappers = collectCallbackWrappers(irPrograms, context)
  context.promiseChainWrappers = collectPromiseChainWrappers(irPrograms, context)
  context.asyncTaskWrappers = collectAsyncTaskWrappers(functionEntries, context)
  context.dgramMessageHandlers = collectDgramMessageHandlers(irPrograms, context)
  context.httpHandlers = collectHttpHandlers(irPrograms, context)
  context.netHandlers = collectNetHandlers(irPrograms, context)

  return context
}

function collectCModuleContextRuntimeTypes(context): Set<string> {
  const types = new Set<string>()

  for (const type of context.functionReturnTypes.values()) {
    if (isManagedRuntimeReturnType(type) || type === 'promise') {
      types.add(type)
    }
  }

  for (const params of context.functionParams.values()) {
    for (const param of params) {
      if (isManagedRuntimeReturnType(param.valueType) || param.valueType === 'promise') {
        types.add(param.valueType)
      }
    }
  }

  return types
}

function emitCModuleInitFunction(plan: CModulePlan, baseContext): string[] {
  const context = createFunctionContext(baseContext, 'void')
  const body = collectIrTopLevelNodes(plan.ir, 'statement')
  const initCalls = emitCModuleImportInitCalls(plan)
  const bodyLines = emitStatementList(body, context)
  const lines = [
    `void ${plan.initName}(void) {`,
    '  static bool ccjs_initialized = false;',
    '  if (ccjs_initialized) return;',
    '  ccjs_initialized = true;',
    ...initCalls.map((line) => `  ${line}`)
  ]

  lines.push(...emitLoopFlowDeclarations(context).map((line) => `  ${line}`))
  lines.push(...emitReturnValueDeclarations(context).map((line) => `  ${line}`))
  lines.push(...emitReturnFlowDeclarations(context).map((line) => `  ${line}`))
  lines.push(...emitEventLoopDeclarations(context).map((line) => `  ${line}`))
  lines.push(...emitOwnedValueDeclarations(context).map((line) => `  ${line}`))
  lines.push(...emitOwnedPromiseDeclarations(context).map((line) => `  ${line}`))
  lines.push(...emitErrorChannelDeclarations(context).map((line) => `  ${line}`))
  lines.push(...emitBoxedValueDeclarations(context).map((line) => `  ${line}`))
  lines.push(...emitEventLoopInit(context).map((line) => `  ${line}`))
  lines.push(...bodyLines.map((line) => `  ${line}`))
  lines.push(...emitEventLoopDrain(context).map((line) => `  ${line}`))

  if (shouldEmitCleanupLabel(context)) {
    lines.push('ccjs_cleanup:')
    lines.push(...emitOwnedValueCleanup(context).map((line) => `  ${line}`))
    lines.push(...emitOwnedPromiseCleanup(context).map((line) => `  ${line}`))
    lines.push(...emitEventLoopCleanup(context).map((line) => `  ${line}`))
    lines.push(...emitBoxedValueCleanup(context).map((line) => `  ${line}`))
  }

  lines.push('  return;')
  lines.push('}')

  return lines
}

function emitCModuleMainFunction(plan: CModulePlan, baseContext): string[] {
  const context = createFunctionContext(baseContext, 'number')
  const body = collectIrTopLevelNodes(plan.ir, 'statement')
  const initCalls = emitCModuleImportInitCalls(plan)
  const bodyLines = emitStatementList(body, context)
  const lines = ['int main(void) {']

  lines.push(...emitLoopFlowDeclarations(context).map((line) => `  ${line}`))
  lines.push(...emitReturnValueDeclarations(context).map((line) => `  ${line}`))
  lines.push(...emitReturnFlowDeclarations(context).map((line) => `  ${line}`))
  lines.push(...emitEventLoopDeclarations(context).map((line) => `  ${line}`))
  lines.push(...emitOwnedValueDeclarations(context).map((line) => `  ${line}`))
  lines.push(...emitOwnedPromiseDeclarations(context).map((line) => `  ${line}`))
  lines.push(...emitErrorChannelDeclarations(context).map((line) => `  ${line}`))
  lines.push(...emitBoxedValueDeclarations(context).map((line) => `  ${line}`))
  lines.push(...emitEventLoopInit(context).map((line) => `  ${line}`))
  lines.push(...initCalls.map((line) => `  ${line}`))
  lines.push(...bodyLines.map((line) => `  ${line}`))
  lines.push(...emitEventLoopDrain(context).map((line) => `  ${line}`))

  if (shouldEmitCleanupLabel(context)) {
    lines.push('ccjs_cleanup:')
    lines.push(...emitOwnedValueCleanup(context).map((line) => `  ${line}`))
    lines.push(...emitOwnedPromiseCleanup(context).map((line) => `  ${line}`))
    lines.push(...emitEventLoopCleanup(context).map((line) => `  ${line}`))
    lines.push(...emitBoxedValueCleanup(context).map((line) => `  ${line}`))
  }

  lines.push(`  return ${emitMainReturnExpression(context)};`)
  lines.push('}')

  return lines
}

function emitCModuleImportInitCalls(plan: CModulePlan): string[] {
  return plan.imports.flatMap((item) => (item.module.initName == null ? [] : [`${item.module.initName}();`]))
}

function collectCModuleExportedFunctions(plan: CModulePlan): AnyNode[] {
  const exportedNames = new Set(
    plan.ir.functionDeclarations.filter((declaration) => declaration.exported).map((declaration) => declaration.name)
  )

  return collectIrTopLevelNodes(plan.ir, 'function').filter((item) => exportedNames.has(item.name))
}

function collectCModuleImportedFunctionDeclarations(plan: CModulePlan): IrFunctionDeclaration[] {
  return plan.imports.flatMap((item) =>
    item.declaration.specifiers.flatMap((specifier) => {
      const declaration = item.module.ir.functionDeclarations.find(
        (candidate) => candidate.name === specifier.imported && candidate.exported
      )

      return declaration == null ? [] : [{ ...declaration, name: specifier.local }]
    })
  )
}

function collectImportedCModuleFunctionEffects(plan: CModulePlan): IrFunctionEffect[] {
  const effects: IrFunctionEffect[] = []

  for (const item of plan.imports) {
    for (const specifier of item.declaration.specifiers) {
      effects.push(
        ...item.module.ir.functionEffects
          .filter((effect) => effect.name === specifier.imported)
          .map((effect) => ({ ...effect, name: specifier.local }))
      )
    }
  }

  return effects
}

function createCModuleFunctionNames(plan: CModulePlan): Map<string, string> {
  const names = new Map<string, string>()
  const localNames = new Set(plan.ir.functionDeclarations.map((declaration) => declaration.name))

  for (const declaration of plan.ir.functionDeclarations) {
    names.set(declaration.name, emitCModuleFunctionName(plan, declaration.name))
  }

  for (const item of plan.imports) {
    for (const specifier of item.declaration.specifiers) {
      names.set(specifier.imported, emitCModuleFunctionName(item.module, specifier.imported))

      if (!localNames.has(specifier.local)) {
        names.set(specifier.local, emitCModuleFunctionName(item.module, specifier.imported))
      }
    }
  }

  return names
}

function emitCModuleFunctionName(plan: CModulePlan, name: string): string {
  return `${plan.symbolPrefix}_${emitCFunctionName(name)}`
}

function emitCUnit(
  irPrograms: IrProgram[],
  entryIrProgram: IrProgram | null = irPrograms.at(-1) ?? null,
  options: CEmitOptions = {},
  entryIrPrograms: IrProgram[] = entryIrProgram == null ? [] : [entryIrProgram]
) {
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
  const baseContext = createBaseContext(diagnostics, functionDeclarations, functionEffects, jsGlobalRoots)
  baseContext.dgramImportNames = collectRuntimeImportNames(irPrograms, new Set(['dgram', 'node:dgram']), new Set(['default', 'dgram']))
  baseContext.dgramCreateSocketNames = collectRuntimeNamedImportNames(irPrograms, new Set(['dgram', 'node:dgram']), 'createSocket')
  baseContext.httpImportNames = collectHttpRuntimeImportNames(irPrograms)
  baseContext.httpCreateServerNames = collectHttpRuntimeCreateServerNames(irPrograms)
  baseContext.netImportNames = collectRuntimeImportNames(irPrograms, new Set(['net', 'node:net']), new Set(['default', 'net']))
  baseContext.netCreateServerNames = collectRuntimeNamedImportNames(irPrograms, new Set(['net', 'node:net']), 'createServer')
  baseContext.netConnectNames = collectRuntimeNamedImportNames(irPrograms, new Set(['net', 'node:net']), 'connect')
  for (const name of collectRuntimeNamedImportNames(irPrograms, new Set(['net', 'node:net']), 'createConnection')) {
    baseContext.netConnectNames.add(name)
  }
  baseContext.classInfos = createClassInfos(classes, diagnostics)
  baseContext.externalEventLoopFunctions = collectExternalEventLoopFunctions(functions)
  baseContext.callbackWrappers = collectCallbackWrappers(irPrograms, baseContext)
  baseContext.promiseChainWrappers = collectPromiseChainWrappers(irPrograms, baseContext)
  baseContext.asyncTaskWrappers = collectAsyncTaskWrappers(functionEntries, baseContext)
  baseContext.dgramMessageHandlers = collectDgramMessageHandlers(irPrograms, baseContext)
  baseContext.httpHandlers = collectHttpHandlers(irPrograms, baseContext)
  baseContext.netHandlers = collectNetHandlers(irPrograms, baseContext)
  const classMethods = collectClassMethods(baseContext)
  const needsCallbackRuntime =
    [...baseContext.callbackWrappers.values()].some(isRuntimeCallbackWrapper) ||
    runtimeRequirements.has('callback-values')
  const needsFsRuntime = runtimeRequirements.has('fs')
  const needsJsonRuntime = runtimeRequirements.has('json')
  const needsTimerRuntime = runtimeRequirements.has('timers')
  const needsFetchRuntime = globalUsages.some(isSupportedCFetchGlobalUsage)
  const needsAsyncRuntime = runtimeRequirements.has('async-runtime') || needsFetchRuntime || needsFsRuntime || needsTimerRuntime
  const needsCollectionRuntime = runtimeRequirements.has('collections')
  const needsBinaryRuntime = runtimeRequirements.has('binary')
  const needsClassRuntime = baseContext.classInfos.size > 0
  const needsDgramRuntime = irProgramsUseRuntimeImport(irPrograms, new Set(['dgram', 'node:dgram']))
  const needsObjectRuntime = runtimeRequirements.has('objects') || needsFsRuntime || needsFetchRuntime || needsClassRuntime
  const needsHttpRuntime = irProgramsUseRuntimeImport(irPrograms, new Set(['http', 'node:http']))
  const needsNetRuntime = irProgramsUseRuntimeImport(irPrograms, new Set(['net', 'node:net']))
  const needsRuntime =
    baseContext.throwingFunctions.size > 0 ||
    needsAsyncRuntime ||
    needsDgramRuntime ||
    needsFetchRuntime ||
    needsHttpRuntime ||
    needsNetRuntime ||
    needsCallbackRuntime ||
    needsCollectionRuntime ||
    needsObjectRuntime ||
    needsClassRuntime ||
    needsJsonRuntime ||
    runtimeRequirements.has('managed-values')
  const needsTimeRuntime =
    runtimeRequirements.has('clocks') || needsAsyncRuntime || needsDgramRuntime || needsFetchRuntime || needsHttpRuntime || needsNetRuntime
  const needsMathRuntime = globalUsages.some(isSupportedCMathGlobalUsage)
  const needsCryptoRuntime = globalUsages.some(isSupportedCCryptoGlobalUsage)
  const needsConsoleRuntime = irProgramsUseConsoleRuntime(irPrograms)
  const needsStringHeader =
    runtimeRequirements.has('string-bytes') || needsFsRuntime || needsDgramRuntime || needsFetchRuntime || needsNetRuntime
  baseContext.unhandledRejectionFlag = needsAsyncRuntime ? 'ccjs_unhandled_rejection' : null
  reportUnsupportedCSyntaxFeatures(syntaxFeatures, diagnostics)
  reportUnsupportedCGlobalUsages(globalUsages, diagnostics, baseContext)
  const lines = emitCPrelude(
    needsRuntime,
    needsTimeRuntime,
    needsMathRuntime,
    needsCryptoRuntime,
    needsAsyncRuntime,
    needsCallbackRuntime,
    needsStringHeader,
    needsCollectionRuntime,
    needsBinaryRuntime,
    needsObjectRuntime,
    needsFsRuntime,
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
    lines.push(`${emitFunctionHead(item, baseContext)};`)
  }

  for (const { info, method } of classMethods) {
    lines.push(`${emitClassMethodHead(info, method, baseContext)};`)
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
    lines.push(...emitAsyncTaskWrapperDeclaration(wrapper, baseContext))
    lines.push('')
  }

  for (const wrapper of baseContext.callbackWrappers.values()) {
    lines.push(
      ...(wrapper.kind === 'plain-arrow'
        ? emitPlainArrowCallbackWrapperDeclaration(wrapper, baseContext)
        : emitRuntimeCallbackWrapperDeclaration(wrapper, baseContext))
    )
    lines.push('')
  }

  for (const wrapper of baseContext.promiseChainWrappers.values()) {
    lines.push(...emitPromiseChainCallbackWrapperDeclaration(wrapper, baseContext))
    lines.push('')
  }

  for (const wrapper of baseContext.dgramMessageHandlers.values()) {
    lines.push(...emitDgramMessageHandlerDeclaration(wrapper, baseContext))
    lines.push('')
  }

  for (const wrapper of baseContext.httpHandlers.values()) {
    lines.push(...emitHttpHandlerDeclaration(wrapper, baseContext))
    lines.push('')
  }

  for (const wrapper of baseContext.netHandlers.values()) {
    lines.push(...emitNetHandlerDeclaration(wrapper, baseContext))
    lines.push('')
  }

  for (const item of functions) {
    lines.push(...emitFunctionDeclaration(item, baseContext))
    lines.push('')
  }

  for (const { info, method } of classMethods) {
    lines.push(...emitClassMethodDeclaration(info, method, baseContext))
    lines.push('')
  }

  lines.push(...emitMainWrapper(entryIrPrograms, baseContext))

  if (diagnostics.length > 0) {
    throw new CompileError(diagnostics)
  }

  return `${lines.join('\n')}\n`
}

function createThrowingFunctionInfo(
  functionDeclarations: IrFunctionDeclaration[],
  functionEffects: IrFunctionEffect[]
) {
  const functionThrowValueTypes = new Map<string, IrFunctionEffect['throwValueTypes']>(
    functionDeclarations.map((item) => [item.name, []])
  )
  const throwingFunctions = new Set()

  for (const effect of functionEffects) {
    if (!functionThrowValueTypes.has(effect.name)) {
      continue
    }

    functionThrowValueTypes.set(effect.name, effect.throwValueTypes)

    if (effect.name !== 'main' && effect.throws) {
      throwingFunctions.add(effect.name)
    }
  }

  return {
    functionThrowValueTypes,
    throwingFunctions
  }
}

function createClassInfos(classes: AnyNode[], diagnostics: Diagnostic[]) {
  const infos = new Map<string, AnyNode>()

  for (const item of classes) {
    const constructor = item.methods.find((method) => method.name === 'constructor') ?? null
    const assignments = collectClassConstructorAssignments(item, constructor, diagnostics)
    const fields = resolveClassFields(item, constructor, assignments)
    const methods = new Map<string, AnyNode>()

    for (const method of item.methods) {
      if (method.name !== 'constructor') {
        methods.set(method.name, method)
      }
    }

    infos.set(item.name, {
      name: item.name,
      node: item,
      constructor,
      assignments,
      fields,
      methods
    })
  }

  return infos
}

function collectClassMethods(context) {
  return [...context.classInfos.values()].flatMap((info) =>
    [...info.methods.values()].map((method) => ({
      info,
      method
    }))
  )
}

function collectClassConstructorAssignments(
  classNode: AnyNode,
  constructor: AnyNode | null,
  diagnostics: Diagnostic[]
) {
  if (constructor == null) {
    return []
  }

  const assignments: AnyNode[] = []

  for (const statement of constructor.body) {
    const assignment =
      statement.type === 'ExpressionStatement' && statement.expression.type === 'AssignmentExpression'
        ? statement.expression
        : null

    if (assignment == null || !isThisFieldExpression(assignment.target)) {
      diagnostics.push(
        diagnostic(
          'CCJS_C_CLASS',
          `class ${classNode.name} constructor currently supports only this.field assignments in the C backend`,
          statement.loc ?? constructor.loc
        )
      )
      continue
    }

    assignments.push({
      field: assignment.target.property,
      value: assignment.value,
      loc: assignment.loc
    })
  }

  return assignments
}

function resolveClassFields(classNode: AnyNode, constructor: AnyNode | null, assignments: AnyNode[]) {
  const shapeFields = classNode.shape?.fields

  if (shapeFields != null) {
    return shapeFields.map((field) => ({
      name: field.name,
      readonly: field.readonly === true,
      valueType: field.valueType ?? 'unknown',
      arrayElementType: field.arrayElementType,
      mapKeyType: field.mapKeyType,
      mapValueType: field.mapValueType,
      setElementType: field.setElementType
    }))
  }

  const fields: AnyNode[] = []
  const seen = new Set<string>()

  for (const assignment of assignments) {
    if (seen.has(assignment.field)) {
      continue
    }

    seen.add(assignment.field)
    fields.push({
      name: assignment.field,
      readonly: false,
      valueType: inferClassConstructorFieldType(assignment.value, constructor)
    })
  }

  return fields
}

function inferClassConstructorFieldType(expression: AnyNode, constructor: AnyNode | null) {
  if (expression?.type === 'Reference' && expression.path.length === 1 && constructor != null) {
    const param = constructor.params.find((item) => item.name === expression.path[0])

    if (param != null) {
      return param.valueType ?? 'unknown'
    }
  }

  if (expression?.valueType != null) {
    return expression.valueType
  }

  if (expression?.type === 'StringLiteral' || expression?.type === 'TemplateLiteral') {
    return 'string'
  }

  if (expression?.type === 'NumberLiteral') {
    return 'number'
  }

  if (expression?.type === 'BooleanLiteral') {
    return 'boolean'
  }

  if (expression?.type === 'ObjectLiteral') {
    return 'object'
  }

  if (expression?.type === 'ArrayLiteral') {
    return 'array'
  }

  return 'unknown'
}

function isThisFieldExpression(expression: AnyNode) {
  return (
    expression?.type === 'MemberExpression' &&
    isThisObjectExpression(expression.object) &&
    typeof expression.property === 'string'
  )
}

function isThisObjectExpression(expression: AnyNode) {
  return (
    expression?.type === 'ThisExpression' ||
    (expression?.type === 'Reference' && expression.path.length === 1 && expression.path[0] === 'this')
  )
}

function createBaseContext(
  diagnostics,
  functionDeclarations: IrFunctionDeclaration[],
  functionEffects: IrFunctionEffect[],
  jsGlobalRoots: Set<string>
) {
  const throwing = createThrowingFunctionInfo(functionDeclarations, functionEffects)

  return {
    boxedMutableCaptureDeclarations: new Set(),
    classInfos: new Map(),
    callbackArrowWrappers: new Map(),
    callbackWrappers: new Map(),
    diagnostics,
    dgramCreateSocketNames: new Set(),
    dgramImportNames: new Set(),
    dgramMessageHandlers: new Map(),
    functionThrowValueTypes: throwing.functionThrowValueTypes,
    functionNames: new Map(functionDeclarations.map((item) => [item.name, emitCFunctionName(item.name)])),
    functionParams: new Map(functionDeclarations.map((item) => [item.name, item.params])),
    functionReturnArrayElementTypes: new Map(
      functionDeclarations.map((item) => [item.name, item.returnArrayElementType ?? null])
    ),
    functionReturnArrayElementDeclaredTypes: new Map(
      functionDeclarations.map((item) => [item.name, item.returnArrayElementDeclaredType ?? null])
    ),
    functionReturnMapTypes: new Map(
      functionDeclarations.map((item) => [
        item.name,
        {
          key: item.returnMapKeyType ?? null,
          value: item.returnMapValueType ?? null
        }
      ])
    ),
    functionReturnNullables: new Map(functionDeclarations.map((item) => [item.name, item.returnNullable === true])),
    functionReturnPromiseValueTypes: new Map(
      functionDeclarations.map((item) => [item.name, item.returnPromiseValueType ?? null])
    ),
    functionReturnShapes: new Map(functionDeclarations.map((item) => [item.name, item.returnShape ?? null])),
    functionReturnSetElementTypes: new Map(
      functionDeclarations.map((item) => [item.name, item.returnSetElementType ?? null])
    ),
    functionReturnTypes: new Map(functionDeclarations.map((item) => [item.name, item.returnType])),
    functionAsyncFlags: new Map(functionDeclarations.map((item) => [item.name, item.async === true])),
    asyncTaskWrappers: new Map(),
    jsGlobalRoots,
    promiseChainArrowWrappers: new Map(),
    promiseChainWrappers: new Map(),
    httpCreateServerNames: new Set(),
    httpHandlers: new Map(),
    httpImportNames: new Set(),
    netConnectNames: new Set(),
    netCreateServerNames: new Set(),
    netHandlers: new Map(),
    netImportNames: new Set(),
    runtimeFunctionParams: new Map(),
    externalEventLoopFunctions: new Set(),
    throwingFunctions: throwing.throwingFunctions,
    unhandledRejectionFlag: null as string | null,
    nextId: 0
  }
}

function resolveFunctionReturnType(name, fallback, context) {
  return context.functionReturnTypes.get(name) ?? fallback
}

function resolveFunctionReturnNullable(name, fallback, context) {
  return context.functionReturnNullables.has(name)
    ? context.functionReturnNullables.get(name) === true
    : fallback === true
}

function resolveFunctionDeclarationParams(name, fallback, context) {
  return context.functionParams.get(name) ?? fallback
}

function isBoxedFunctionParam(param, index, statement, context) {
  return context.boxedMutableCaptureDeclarations.has(statement.params[index] ?? param)
}

function collectExternalEventLoopFunctions(functions) {
  const functionsByName = new Map(
    functions.flatMap((item) => (typeof item.name === 'string' ? [[item.name, item]] : []))
  )
  const names = new Set()
  let changed = true

  while (changed) {
    changed = false

    for (const [name, item] of functionsByName) {
      if (names.has(name)) {
        continue
      }

      if (functionUsesExternalEventLoop(item, names)) {
        names.add(name)
        changed = true
      }
    }
  }

  return names
}

function functionUsesExternalEventLoop(node, externalNames) {
  let found = false
  const visit = (value) => {
    if (found || value == null) {
      return
    }

    if (Array.isArray(value)) {
      value.forEach(visit)
      return
    }

    if (typeof value !== 'object') {
      return
    }

    if (cTimerStartCallName(value.callee) != null) {
      found = true
      return
    }

    if (
      value.type === 'CallExpression' &&
      value.callee?.type === 'Reference' &&
      value.callee.path.length === 1 &&
      externalNames.has(value.callee.path[0])
    ) {
      found = true
      return
    }

    for (const [key, child] of Object.entries(value)) {
      if (key === 'loc' || key === 'shape') {
        continue
      }

      visit(child)
    }
  }

  visit(node)

  return found
}

function collectAsyncTaskWrappers(functions: IrFunctionNodeEntry[], context) {
  const wrappers = new Map()

  for (const { declaration, node: item } of functions) {
    const params = resolveAsyncTaskWrapperParams(declaration, context)
    const bodyPlan = params == null ? null : resolveAsyncTaskBodyPlan(item, declaration, context, params)

    if (bodyPlan == null) {
      continue
    }

    const cName = emitCIdentifier(declaration.name)
    const wrapper = {
      key: declaration.name,
      functionName: declaration.name,
      frameTypeName: `ccjs_async_task_${cName}_frame`,
      startName: `ccjs_async_task_${cName}_start`,
      resumeName: `ccjs_async_task_${cName}_resume`,
      rejectName: `ccjs_async_task_${cName}_reject`,
      finalizerName: `ccjs_async_task_${cName}_finalize`,
      params,
      ...bodyPlan
    }

    wrappers.set(declaration.name, wrapper)
  }

  return wrappers
}

function createAsyncTaskBodyPlan(body: AsyncTaskBodyDraft): AsyncTaskBodyPlan {
  const successPhases = createAsyncTaskSuccessPhases(body)
  const tryRegion = body.tryRegion ?? null
  const awaits = body.awaits
  const prefixLocals = body.prefixLocals ?? []
  const tryPhases = createAsyncTaskTryPhases(tryRegion, successPhases)
  const tryHandler = tryRegion?.handler ?? null
  const livePrefixLocalNames = collectAsyncTaskLiveAcrossSuspensionNames({
    awaits,
    successPhases,
    tryPhases,
    returnExpression: body.returnExpression,
    tryHandler
  })

  return {
    awaits,
    prefixStatements: body.prefixStatements ?? [],
    frameLocals: createAsyncTaskFrameLocals(prefixLocals, awaits, livePrefixLocalNames),
    successPhases,
    tryPhases,
    returnExpression: body.returnExpression,
    returnType: body.returnType,
    hasTryRegion: tryRegion != null,
    tryHandler
  }
}

function createAsyncTaskFrameLocals(prefixLocals, awaits, livePrefixLocalNames): AsyncTaskFrameLocal[] {
  return [
    ...prefixLocals
      .filter((local) => livePrefixLocalNames.has(local.name))
      .map((local) => ({
        ...local,
        kind: 'prefix' as const
      })),
    ...awaits
      .filter((item) => item.fieldName != null)
      .map((item) => ({
        ...item,
        kind: 'await' as const
      }))
  ]
}

function collectAsyncTaskLiveAcrossSuspensionNames({ awaits, successPhases, tryPhases, returnExpression, tryHandler }) {
  return collectAsyncTaskReferencedNames([
    ...awaits.slice(1).flatMap((item) => [item.awaitedExpression, item.awaitedPromiseExpression]),
    ...successPhases.flatMap((phase) => phase.statements),
    ...tryPhases.flatMap((phase) => phase.statements),
    returnExpression,
    ...(tryHandler == null ? [] : [...(tryHandler.statements ?? []), tryHandler.returnExpression])
  ])
}

function collectAsyncTaskReferencedNames(nodes) {
  const names = new Set<string>()
  const visit = (node) => {
    if (node == null) {
      return
    }

    if (Array.isArray(node)) {
      node.forEach(visit)
      return
    }

    if (typeof node !== 'object') {
      return
    }

    if (node.type === 'Reference') {
      if (node.path.length === 1) {
        names.add(node.path[0])
      }

      return
    }

    for (const [key, value] of Object.entries(node)) {
      if (key === 'loc' || key === 'shape' || key === 'functionType') {
        continue
      }

      visit(value)
    }
  }

  visit(nodes)

  return names
}

function createAsyncTaskSuccessPhases(body): AsyncTaskPhase[] {
  const phases: AsyncTaskPhase[] = []

  appendAsyncTaskSuccessPhase(phases, 'pre-finalizer', body.successPreFinalizerStatements)
  appendAsyncTaskSuccessPhase(phases, 'prefix-finalizer', body.successPrefixFinalizerStatements)
  appendAsyncTaskSuccessPhase(phases, 'body', body.successStatements)

  return phases
}

function appendAsyncTaskSuccessPhase(phases: AsyncTaskPhase[], kind: AsyncTaskSuccessPhaseKind, statements) {
  if ((statements?.length ?? 0) === 0) {
    return
  }

  phases.push({
    kind,
    statements
  })
}

function createAsyncTaskTryPhases(
  tryRegion: AsyncTaskTryRegionDraft | null,
  successPhases: AsyncTaskPhase[]
): AsyncTaskPhase[] {
  if (tryRegion == null) {
    return []
  }

  const phases: AsyncTaskPhase[] = []
  const successPrefixFinalizerStatements = successPhases
    .filter((phase) => phase.kind === 'prefix-finalizer')
    .flatMap((phase) => phase.statements)
  const successFinalizerStatements = [
    ...(successPrefixFinalizerStatements.length > 0 ? [] : tryRegion.preHandlerFinalizerStatements),
    ...tryRegion.successFinalizerStatements
  ]
  const rejectFinalizerStatements = [
    ...successPrefixFinalizerStatements,
    ...tryRegion.preHandlerFinalizerStatements,
    ...tryRegion.successFinalizerStatements
  ]

  appendAsyncTaskTryPhase(phases, 'success-finalizer', successFinalizerStatements)
  appendAsyncTaskTryPhase(phases, 'reject-finalizer', rejectFinalizerStatements)
  appendAsyncTaskTryPhase(phases, 'handler-prelude', tryRegion.preHandlerFinalizerStatements)
  appendAsyncTaskTryPhase(phases, 'handler-finalizer', tryRegion.handlerFinalizerStatements)

  return phases
}

function appendAsyncTaskTryPhase(phases: AsyncTaskPhase[], kind: AsyncTaskTryPhaseKind, statements) {
  if ((statements?.length ?? 0) === 0) {
    return
  }

  phases.push({
    kind,
    statements
  })
}

function resolveAsyncTaskWrapperParams(declaration: IrFunctionDeclaration, context) {
  if (
    declaration.async !== true ||
    declaration.returnType !== 'promise' ||
    isThrowingFunctionName(declaration.name, context)
  ) {
    return null
  }

  const params = resolveFunctionDeclarationParams(declaration.name, declaration.params, context)

  if (params.some((param) => param.nullable === true || !isSupportedAsyncTaskParamType(param.valueType))) {
    return null
  }

  return params.map((param) => ({
    ...param,
    fieldName: `param_${emitCIdentifier(param.name)}`,
    argName: `ccjs_arg_${emitCIdentifier(param.name)}`
  }))
}

function isSupportedAsyncTaskParamType(valueType) {
  return valueType === 'number' || valueType === 'boolean' || valueType === 'string' || valueType === 'bytes'
}

function isSupportedAsyncTaskValueType(valueType) {
  return (
    valueType === 'number' ||
    valueType === 'boolean' ||
    valueType === 'string' ||
    valueType === 'bytes' ||
    valueType === 'object' ||
    valueType === 'array' ||
    valueType === 'map' ||
    valueType === 'set' ||
    valueType === 'void'
  )
}

function resolveAsyncTaskBodyPlan(statement, declaration: IrFunctionDeclaration, context, params) {
  if (
    declaration.async !== true ||
    declaration.returnType !== 'promise' ||
    isThrowingFunctionName(declaration.name, context)
  ) {
    return null
  }

  const returnType =
    declaration.returnPromiseValueType ?? context.functionReturnPromiseValueTypes.get(declaration.name) ?? 'unknown'

  if (!isSupportedAsyncTaskValueType(returnType)) {
    return null
  }

  const tryBody = resolveAsyncTaskTryBodyPlan(statement, context, params, returnType)

  if (tryBody != null) {
    return tryBody
  }

  if (statement.body.length < 2) {
    return null
  }

  const returnStatement = statement.body.at(-1)

  if (returnStatement?.type !== 'ReturnStatement') {
    return null
  }

  const awaits = resolveAsyncTaskAwaitSteps(statement.body.slice(0, -1), context)

  const returnContext = {
    ...context,
    variables: new Map(context.variables ?? [])
  }

  for (const param of params) {
    returnContext.variables.set(param.name, param.valueType)
  }

  for (const item of awaits ?? []) {
    returnContext.variables.set(item.name, item.type)
  }

  const returnExpression = resolveAsyncTaskReturnValueExpression(returnStatement.argument, returnType, returnContext)

  if (awaits == null || (returnType !== 'void' && returnExpression == null)) {
    return null
  }

  return createAsyncTaskBodyPlan({
    awaits,
    prefixStatements: [],
    prefixLocals: [],
    successPreFinalizerStatements: [],
    successPrefixFinalizerStatements: [],
    successStatements: [],
    returnExpression,
    returnType,
    tryRegion: null
  })
}

function resolveAsyncTaskTryBodyPlan(statement, context, params, returnType) {
  if (statement.body.length !== 1 || statement.body[0]?.type !== 'TryStatement') {
    return null
  }

  const tryStatement = statement.body[0]
  const nestedTryFinallyBody = resolveAsyncTaskNestedTryBodyPlan(tryStatement, context, params, returnType)

  if (nestedTryFinallyBody != null) {
    return nestedTryFinallyBody
  }

  const tryStatements = tryStatement.block?.body ?? []
  const returnStatement = tryStatements.at(-1)

  if (returnStatement?.type !== 'ReturnStatement') {
    return null
  }

  if (tryStatement.handler == null && tryStatement.finalizer == null) {
    return null
  }

  const awaits = resolveAsyncTaskAwaitSteps(tryStatements.slice(0, -1), context)

  if (awaits == null) {
    return null
  }

  const returnContext = createAsyncTaskExpressionContext(context, params, awaits)
  const returnExpression = resolveAsyncTaskReturnValueExpression(returnStatement.argument, returnType, returnContext)

  if (returnType !== 'void' && returnExpression == null) {
    return null
  }

  const handler = resolveAsyncTaskTryHandler(tryStatement.handler, context, params, returnType)
  const finalizerStatements = tryStatement.finalizer?.body ?? []

  if ((tryStatement.handler != null && handler == null) || hasUnsupportedAsyncTaskTryControlFlow(finalizerStatements)) {
    return null
  }

  return createAsyncTaskBodyPlan({
    awaits,
    prefixStatements: [],
    prefixLocals: [],
    successPreFinalizerStatements: [],
    successPrefixFinalizerStatements: [],
    successStatements: [],
    returnExpression,
    returnType,
    tryRegion: {
      handler,
      preHandlerFinalizerStatements: [],
      successFinalizerStatements: finalizerStatements,
      handlerFinalizerStatements: finalizerStatements
    }
  })
}

function resolveAsyncTaskNestedTryBodyPlan(tryStatement, context, params, returnType) {
  const tryChainResult = collectAsyncTaskNestedTryChain(tryStatement)

  if (tryChainResult == null || tryChainResult.chain.length < 2) {
    return null
  }

  const tryChain = tryChainResult.chain
  const innerTry = tryChain[tryChain.length - 1]
  const innerTryStatements = innerTry.block?.body ?? []
  const postNestedStatements = tryChainResult.postNestedStatements ?? []
  const hasPostNestedStatements = postNestedStatements.length > 0
  const returnStatement = hasPostNestedStatements ? postNestedStatements.at(-1) : innerTryStatements.at(-1)
  const innerAwaitStatements = hasPostNestedStatements ? innerTryStatements : innerTryStatements.slice(0, -1)
  const innerPrefixResult = splitAsyncTaskLeadingPrefixStatements(innerAwaitStatements)

  if (returnStatement?.type !== 'ReturnStatement' || innerPrefixResult == null) {
    return null
  }

  const prefixStatements = [...tryChainResult.prefixStatements, ...innerPrefixResult.prefixStatements]
  const prefixResult = resolveAsyncTaskPrefixLocals(context, params, prefixStatements)

  if (prefixResult == null) {
    return null
  }

  const prefixContext = prefixResult.context
  const awaitResult = resolveAsyncTaskAwaitStepsAndTrailingStatements(innerPrefixResult.awaitStatements, prefixContext)

  if (awaitResult == null) {
    return null
  }

  const awaits = awaitResult.awaits
  const successPreFinalizerStatements = hasPostNestedStatements ? awaitResult.trailingStatements : []
  const successStatements = hasPostNestedStatements ? postNestedStatements.slice(0, -1) : awaitResult.trailingStatements
  const returnContext = createAsyncTaskExpressionContext(
    context,
    params,
    hasPostNestedStatements ? prefixResult.locals : [...prefixResult.locals, ...awaits]
  )
  const finalizers = collectAsyncTaskTryFinalizers(tryChain)
  const handlerIndex = findAsyncTaskNearestTryHandlerIndex(tryChain)
  const handlerSource = handlerIndex < 0 ? null : tryChain[handlerIndex].handler
  const handler = resolveAsyncTaskTryHandler(handlerSource, context, params, returnType)
  registerAsyncTaskStatementListLocals(returnContext, successStatements)
  const returnExpression = resolveAsyncTaskReturnValueExpression(returnStatement.argument, returnType, returnContext)

  if (returnType !== 'void' && returnExpression == null) {
    return null
  }

  const successFinalizerStatements = hasPostNestedStatements
    ? collectAsyncTaskTryFinalizerStatements(finalizers, tryChainResult.postNestedOwnerIndex, 0)
    : handlerIndex < 0
      ? collectAsyncTaskTryFinalizerStatements(finalizers, finalizers.length - 1, 0)
      : collectAsyncTaskTryFinalizerStatements(finalizers, handlerIndex, 0)
  const handlerFinalizerStatements =
    handlerIndex < 0
      ? []
      : hasPostNestedStatements
        ? collectAsyncTaskTryFinalizerStatements(finalizers, handlerIndex, 0)
        : successFinalizerStatements

  if (
    (handlerSource != null && handler == null) ||
    hasUnsupportedAsyncTaskTryControlFlow(prefixStatements) ||
    hasUnsupportedAsyncTaskTryControlFlow(successPreFinalizerStatements) ||
    hasUnsupportedAsyncTaskTryControlFlow(successStatements) ||
    finalizers.some((statements) => hasUnsupportedAsyncTaskTryControlFlow(statements))
  ) {
    return null
  }

  return createAsyncTaskBodyPlan({
    awaits,
    prefixStatements,
    prefixLocals: prefixResult.locals,
    successPreFinalizerStatements,
    successPrefixFinalizerStatements: hasPostNestedStatements
      ? collectAsyncTaskTryFinalizerStatements(
          finalizers,
          finalizers.length - 1,
          tryChainResult.postNestedOwnerIndex + 1
        )
      : [],
    successStatements,
    returnExpression,
    returnType,
    tryRegion: {
      handler,
      preHandlerFinalizerStatements:
        handlerIndex < 0
          ? []
          : collectAsyncTaskTryFinalizerStatements(finalizers, finalizers.length - 1, handlerIndex + 1),
      successFinalizerStatements,
      handlerFinalizerStatements
    }
  })
}

function splitAsyncTaskLeadingPrefixStatements(statements) {
  const prefixStatements: any[] = []
  let index = 0

  while (index < statements.length) {
    const statement = statements[index]
    const nextStatement = statements[index + 1]

    if (
      isAsyncTaskDirectAwaitStatementShape(statement) ||
      isAsyncTaskStatementAwaitShape(statement) ||
      isAsyncTaskLocalPromiseAwaitShape(statement, nextStatement)
    ) {
      break
    }

    prefixStatements.push(statement)
    index += 1
  }

  return {
    prefixStatements,
    awaitStatements: statements.slice(index)
  }
}

function isAsyncTaskDirectAwaitStatementShape(statement) {
  return statement?.type === 'VariableDeclaration' && statement.init?.type === 'AwaitExpression'
}

function isAsyncTaskStatementAwaitShape(statement) {
  return statement?.type === 'ExpressionStatement' && statement.expression?.type === 'AwaitExpression'
}

function isAsyncTaskLocalPromiseAwaitShape(promiseStatement, awaitStatement) {
  return (
    promiseStatement?.type === 'VariableDeclaration' &&
    promiseStatement.init?.valueType === 'promise' &&
    awaitStatement?.type === 'VariableDeclaration' &&
    awaitStatement.init?.type === 'AwaitExpression'
  )
}

function collectAsyncTaskNestedTryChain(tryStatement) {
  const chain: any[] = []
  const prefixStatements: any[] = []
  const postNestedStatements: any[] = []
  let postNestedOwnerIndex = -1
  let current: any = tryStatement

  while (current?.type === 'TryStatement') {
    if (current.handler == null && current.finalizer == null) {
      return null
    }

    chain.push(current)

    const body = current.block?.body ?? []
    const nestedTryIndexes = body.flatMap((item, index) => (item?.type === 'TryStatement' ? [index] : []))

    if (nestedTryIndexes.length === 1) {
      const nestedTryIndex = nestedTryIndexes[0]
      const suffixStatements = body.slice(nestedTryIndex + 1)

      if (suffixStatements.length > 0) {
        if (postNestedStatements.length > 0) {
          return null
        }

        postNestedStatements.push(...suffixStatements)
        postNestedOwnerIndex = chain.length - 1
      }

      prefixStatements.push(...body.slice(0, nestedTryIndex))
      current = body[nestedTryIndex]
      continue
    }

    return {
      chain,
      prefixStatements,
      postNestedStatements,
      postNestedOwnerIndex
    }
  }

  return null
}

function collectAsyncTaskTryFinalizers(tryChain) {
  return tryChain.map((item) => item.finalizer?.body ?? [])
}

function findAsyncTaskNearestTryHandlerIndex(tryChain) {
  for (let index = tryChain.length - 1; index >= 0; index -= 1) {
    if (tryChain[index].handler != null) {
      return index
    }
  }

  return -1
}

function collectAsyncTaskTryFinalizerStatements(finalizers, fromIndex, toIndex) {
  const statements: any[] = []

  for (let index = fromIndex; index >= toIndex; index -= 1) {
    statements.push(...finalizers[index])
  }

  return statements
}

function resolveAsyncTaskPrefixLocals(context, params, prefixStatements) {
  const result = createAsyncTaskExpressionContext(context, params, [])
  const locals: any[] = []

  for (const statement of prefixStatements) {
    if (statement?.type !== 'VariableDeclaration') {
      continue
    }

    const valueType = statement.valueType ?? inferExpressionType(statement.init, result)

    if (!isSupportedAsyncTaskPrefixLocalType(valueType)) {
      return null
    }

    registerRuntimeValueMetadata(statement.name, valueType, statement, statement.init, result)

    if (valueType === 'string' && isRuntimeStringPrefixLocalDeclaration(statement, result)) {
      result.runtimeStrings.add(statement.name)
    }

    if (isSupportedAsyncTaskFramePrefixLocal(statement, valueType, result)) {
      locals.push({
        name: statement.name,
        type: valueType,
        shape: valueType === 'object' ? (statement.shape ?? statement.init?.shape ?? null) : undefined,
        arrayElementType:
          valueType === 'array'
            ? (statement.arrayElementType ??
              statement.init?.arrayElementType ??
              resolveRuntimeArrayElementType(statement.init, result) ??
              'unknown')
            : undefined,
        mapKeyType:
          valueType === 'map'
            ? (statement.mapKeyType ??
              resolveRuntimeMapType(statement.init, result)?.key ??
              statement.init?.mapKeyType ??
              'unknown')
            : undefined,
        mapValueType:
          valueType === 'map'
            ? (statement.mapValueType ??
              resolveRuntimeMapType(statement.init, result)?.value ??
              statement.init?.mapValueType ??
              'unknown')
            : undefined,
        setElementType:
          valueType === 'set'
            ? (statement.setElementType ??
              resolveRuntimeSetElementType(statement.init, result) ??
              statement.init?.setElementType ??
              'unknown')
            : undefined,
        fieldName: `prefix_${emitCIdentifier(statement.name)}`,
        forceRuntimeStringDeclaration: valueType === 'string' && isRawStringLiteralExpression(statement.init)
      })
    }
  }

  return {
    context: result,
    locals
  }
}

function registerAsyncTaskStatementListLocals(context, statements) {
  for (const statement of statements) {
    if (statement?.type !== 'VariableDeclaration') {
      continue
    }

    const valueType = statement.valueType ?? inferExpressionType(statement.init, context)

    registerRuntimeValueMetadata(statement.name, valueType, statement, statement.init, context)

    if (valueType === 'string' && isRuntimeStringPrefixLocalDeclaration(statement, context)) {
      context.runtimeStrings.add(statement.name)
    }
  }
}

function isSupportedAsyncTaskPrefixLocalType(valueType) {
  return (
    valueType === 'number' ||
    valueType === 'boolean' ||
    valueType === 'string' ||
    valueType === 'bytes' ||
    valueType === 'object' ||
    valueType === 'array' ||
    valueType === 'map' ||
    valueType === 'set'
  )
}

function isSupportedAsyncTaskFramePrefixLocalType(valueType) {
  return (
    valueType === 'number' ||
    valueType === 'boolean' ||
    valueType === 'string' ||
    valueType === 'bytes' ||
    valueType === 'object' ||
    valueType === 'array' ||
    valueType === 'map' ||
    valueType === 'set'
  )
}

function isSupportedAsyncTaskFramePrefixLocal(statement, valueType, context) {
  if (!isSupportedAsyncTaskFramePrefixLocalType(valueType)) {
    return false
  }

  return valueType !== 'string' || isRuntimeStringPrefixLocalDeclaration(statement, context)
}

function isRuntimeStringPrefixLocalDeclaration(statement, context) {
  const expression = statement?.init

  if (
    resolveRuntimeStringReference(expression, context) != null ||
    isRuntimeProducedStringExpression(expression, context) ||
    isRawStringLiteralExpression(expression)
  ) {
    return true
  }

  if (isMemberAccessExpression(expression)) {
    const member = resolveKnownObjectMember(expression, context)

    return member?.valueType === 'string'
  }

  if (isIndexAccessExpression(expression)) {
    const element = resolveKnownArrayIndex(expression, context)
    const field = resolveKnownObjectIndex(expression, context)
    const runtimeElement = resolveRuntimeArrayIndex(expression, context)

    return element?.valueType === 'string' || field?.valueType === 'string' || runtimeElement?.valueType === 'string'
  }

  return false
}

function isRawStringLiteralExpression(expression) {
  return (
    expression?.type === 'StringLiteral' || (expression?.type === 'TemplateLiteral' && !expression.raw.includes('${'))
  )
}

function resolveAsyncTaskTryHandler(handler, context, params, returnType) {
  if (handler == null) {
    return null
  }

  const statements = handler.body?.body ?? []
  const returnStatement = statements.at(-1)
  const handlerStatements = statements.slice(0, -1)

  if (returnStatement?.type !== 'ReturnStatement' || hasUnsupportedAsyncTaskTryControlFlow(handlerStatements)) {
    return null
  }

  const catchContext = createAsyncTaskExpressionContext(context, params, [])

  if (handler.param != null) {
    catchContext.variables.set(handler.param, 'string')
    catchContext.runtimeStrings.add(handler.param)
  }

  registerAsyncTaskStatementListLocals(catchContext, handlerStatements)
  const returnExpression = resolveAsyncTaskReturnValueExpression(returnStatement.argument, returnType, catchContext)

  if (returnExpression == null) {
    return null
  }

  return {
    param: handler.param ?? null,
    statements: handlerStatements,
    returnExpression
  }
}

function createAsyncTaskExpressionContext(context, params, awaits) {
  const result = {
    ...context,
    mapTypes: new Map(context.mapTypes ?? []),
    objectShapes: new Map(context.objectShapes ?? []),
    runtimeArrayElementTypes: new Map(context.runtimeArrayElementTypes ?? []),
    setElementTypes: new Map(context.setElementTypes ?? []),
    variables: new Map(context.variables ?? []),
    runtimeStrings: new Set(context.runtimeStrings ?? [])
  }

  for (const param of params) {
    registerAsyncTaskLocalMetadata(param.name, param.valueType, param, result)
  }

  for (const item of awaits ?? []) {
    if (item.name != null) {
      registerAsyncTaskLocalMetadata(item.name, item.type, item, result)
    }
  }

  return result
}

function hasUnsupportedAsyncTaskTryControlFlow(node) {
  if (node == null) {
    return false
  }

  if (Array.isArray(node)) {
    return node.some((item) => hasUnsupportedAsyncTaskTryControlFlow(item))
  }

  if (typeof node !== 'object') {
    return false
  }

  if (
    [
      'AwaitExpression',
      'ReturnStatement',
      'ThrowStatement',
      'TryStatement',
      'BreakStatement',
      'ContinueStatement'
    ].includes(node.type)
  ) {
    return true
  }

  return Object.values(node).some((value) => hasUnsupportedAsyncTaskTryControlFlow(value))
}

function resolveAsyncTaskAwaitSteps(statements, context) {
  const result = resolveAsyncTaskAwaitStepsAndTrailingStatements(statements, context)

  if (result == null || result.trailingStatements.length > 0) {
    return null
  }

  return result.awaits
}

function resolveAsyncTaskAwaitStepsAndTrailingStatements(statements, context) {
  const awaits: Array<Record<string, any>> = []

  for (let index = 0; index < statements.length; ) {
    const statement = statements[index]
    const nextStatement = statements[index + 1]
    const directAwait = resolveAsyncTaskDirectAwaitStep(statement, context, awaits.length)

    if (directAwait != null) {
      awaits.push(directAwait)
      index += 1
      continue
    }

    const statementAwait = resolveAsyncTaskStatementAwaitStep(statement, context, awaits.length)

    if (statementAwait != null) {
      awaits.push(statementAwait)
      index += 1
      continue
    }

    const localPromiseAwait = resolveAsyncTaskLocalPromiseAwaitStep(statement, nextStatement, context, awaits.length)

    if (localPromiseAwait != null) {
      awaits.push(localPromiseAwait)
      index += 2
      continue
    }

    if (awaits.length === 0) {
      return null
    }

    return {
      awaits,
      trailingStatements: statements.slice(index)
    }
  }

  return awaits.length === 0
    ? null
    : {
        awaits,
        trailingStatements: []
      }
}

function resolveAsyncTaskDirectAwaitStep(statement, context, index) {
  if (statement?.type !== 'VariableDeclaration' || statement.init?.type !== 'AwaitExpression') {
    return null
  }

  const awaitedType = statement.valueType ?? statement.init.valueType ?? 'unknown'
  const awaitedExpression = statement.init.argument
  const awaitedPromiseExpression = isSupportedAsyncTaskDirectAwaitPromiseExpression(awaitedExpression, context)
    ? awaitedExpression
    : null

  if (!isSupportedAsyncTaskValueType(awaitedType) || awaitedType === 'void') {
    return null
  }

  return {
    index,
    name: statement.name,
    type: awaitedType,
    fieldName: `local_${emitCIdentifier(statement.name)}`,
    shape:
      awaitedType === 'object'
        ? (statement.shape ?? statement.init.shape ?? awaitedExpression?.shape ?? null)
        : undefined,
    arrayElementType:
      statement.arrayElementType ?? statement.init.arrayElementType ?? awaitedExpression?.arrayElementType ?? 'unknown',
    mapKeyType:
      awaitedType === 'map'
        ? (statement.mapKeyType ?? statement.init.mapKeyType ?? awaitedExpression?.mapKeyType ?? 'unknown')
        : undefined,
    mapValueType:
      awaitedType === 'map'
        ? (statement.mapValueType ?? statement.init.mapValueType ?? awaitedExpression?.mapValueType ?? 'unknown')
        : undefined,
    setElementType:
      awaitedType === 'set'
        ? (statement.setElementType ?? statement.init.setElementType ?? awaitedExpression?.setElementType ?? 'unknown')
        : undefined,
    awaitedExpression: awaitedPromiseExpression == null ? awaitedExpression : null,
    awaitedPromiseExpression
  }
}

function resolveAsyncTaskStatementAwaitStep(statement, context, index) {
  if (statement?.type !== 'ExpressionStatement' || statement.expression?.type !== 'AwaitExpression') {
    return null
  }

  const awaitedType = statement.expression.valueType ?? 'void'
  const awaitedExpression = statement.expression.argument
  const awaitedPromiseExpression = isSupportedAsyncTaskDirectAwaitPromiseExpression(awaitedExpression, context)
    ? awaitedExpression
    : null

  if (awaitedType !== 'void') {
    return null
  }

  return {
    index,
    name: null,
    type: awaitedType,
    fieldName: null,
    awaitedExpression: awaitedPromiseExpression == null ? awaitedExpression : null,
    awaitedPromiseExpression
  }
}

function resolveAsyncTaskLocalPromiseAwaitStep(promiseStatement, awaitStatement, context, index) {
  if (awaitStatement?.type !== 'VariableDeclaration' || awaitStatement.init?.type !== 'AwaitExpression') {
    return null
  }

  const awaitedPromiseExpression = resolveAsyncTaskAwaitedPromiseExpression(promiseStatement, awaitStatement, context)

  if (awaitedPromiseExpression == null) {
    return null
  }

  const awaitedType = awaitStatement.valueType ?? awaitStatement.init.valueType ?? 'unknown'

  if (!isSupportedAsyncTaskValueType(awaitedType) || awaitedType === 'void') {
    return null
  }

  return {
    index,
    name: awaitStatement.name,
    type: awaitedType,
    fieldName: `local_${emitCIdentifier(awaitStatement.name)}`,
    shape:
      awaitedType === 'object'
        ? (awaitStatement.shape ?? awaitStatement.init.shape ?? awaitedPromiseExpression.shape ?? null)
        : undefined,
    arrayElementType:
      awaitStatement.arrayElementType ??
      awaitStatement.init.arrayElementType ??
      awaitedPromiseExpression.arrayElementType,
    mapKeyType:
      awaitedType === 'map'
        ? (awaitStatement.mapKeyType ??
          awaitStatement.init.mapKeyType ??
          awaitedPromiseExpression.mapKeyType ??
          'unknown')
        : undefined,
    mapValueType:
      awaitedType === 'map'
        ? (awaitStatement.mapValueType ??
          awaitStatement.init.mapValueType ??
          awaitedPromiseExpression.mapValueType ??
          'unknown')
        : undefined,
    setElementType:
      awaitedType === 'set'
        ? (awaitStatement.setElementType ??
          awaitStatement.init.setElementType ??
          awaitedPromiseExpression.setElementType ??
          'unknown')
        : undefined,
    awaitedExpression: null,
    awaitedPromiseExpression
  }
}

function resolveAsyncTaskAwaitedPromiseExpression(promiseStatement, awaitStatement, context) {
  if (promiseStatement == null) {
    return null
  }

  if (
    promiseStatement.type !== 'VariableDeclaration' ||
    promiseStatement.init?.valueType !== 'promise' ||
    !isSupportedAsyncTaskAwaitedPromiseExpression(promiseStatement.init, context)
  ) {
    return null
  }

  const awaited = awaitStatement.init?.argument

  if (awaited?.type !== 'Reference' || awaited.path.length !== 1 || awaited.path[0] !== promiseStatement.name) {
    return null
  }

  return promiseStatement.init
}

function isSupportedAsyncTaskAwaitedPromiseExpression(expression, context) {
  if (expression?.type !== 'CallExpression') {
    return false
  }

  if (isSupportedAsyncTaskDirectAwaitPromiseExpression(expression, context)) {
    return true
  }

  if (cPromiseRuntimeCallName(expression.callee) === 'resolve') {
    return true
  }

  if (expression.callee?.type !== 'MemberExpression' || expression.callee.property !== 'then') {
    return false
  }

  const receiver = expression.callee.object
  const callback = expression.args[0]

  return (
    receiver?.type === 'CallExpression' &&
    cPromiseRuntimeCallName(receiver.callee) === 'resolve' &&
    callback?.type === 'ArrowFunctionExpression' &&
    context.promiseChainArrowWrappers.has(callback)
  )
}

function isSupportedAsyncTaskDirectAwaitPromiseExpression(expression, context) {
  if (expression?.type !== 'CallExpression') {
    return false
  }

  if (cPromiseRuntimeCallName(expression.callee) === 'reject') {
    return true
  }

  if (isAsyncFsRuntimeCallExpression(expression)) {
    return true
  }

  if (isAsyncFetchRuntimeCallExpression(expression)) {
    return true
  }

  if (isPromiseReturningFunctionCallee(expression.callee, context)) {
    return true
  }

  if (!isAsyncFunctionCallee(expression.callee, context) || isThrowingFunctionCallee(expression.callee, context)) {
    return false
  }

  const valueType =
    resolveCAsyncFunctionAwaitValueType(expression.callee, context) ?? expression.promiseValueType ?? 'unknown'

  return isSupportedAsyncTaskValueType(valueType)
}

function resolveAsyncTaskReturnValueExpression(expression, returnType, context) {
  if (returnType === 'void') {
    return expression == null ? null : expression
  }

  if (expression?.type === 'CallExpression' && cPromiseRuntimeCallName(expression.callee) === 'resolve') {
    return expression.args[0] ?? null
  }

  const expressionType =
    expression?.valueType != null && expression.valueType !== 'unknown'
      ? expression.valueType
      : context.variables == null
        ? 'unknown'
        : inferExpressionType(expression, context)

  if (isSupportedAsyncTaskValueType(returnType) && expressionType === returnType) {
    return expression
  }

  return null
}

function emitAsyncTaskFrameType(wrapper) {
  return [
    `typedef struct ${wrapper.frameTypeName} {`,
    '  ccjs_loop* ccjs_loop;',
    '  ccjs_promise* promise;',
    '  ccjs_promise* awaited;',
    '  int state;',
    ...wrapper.params.map((param) => `  ${emitAsyncTaskStorageCType(param.valueType)} ${param.fieldName};`),
    ...wrapper.frameLocals.map((local) => `  ${emitAsyncTaskStorageCType(local.type)} ${local.fieldName};`),
    `} ${wrapper.frameTypeName};`
  ]
}

function emitAsyncTaskStorageCType(valueType) {
  return isManagedRuntimeReturnType(valueType) ? 'ccjs_value' : emitCType(valueType)
}

function emitAsyncTaskStorageInit(valueType) {
  return isManagedRuntimeReturnType(valueType) ? 'ccjs_undefined_value()' : '0'
}

function emitAsyncTaskWrapperPrototypes(wrapper) {
  return [
    `static ccjs_status ${wrapper.startName}(${emitAsyncTaskStartParams(wrapper)});`,
    `static ccjs_status ${wrapper.resumeName}(void* context, ccjs_value ccjs_value_input);`,
    `static ccjs_status ${wrapper.rejectName}(void* context, ccjs_value ccjs_error);`,
    `static void ${wrapper.finalizerName}(void* context);`
  ]
}

function emitAsyncTaskWrapperDeclaration(wrapper, baseContext) {
  return [
    ...emitAsyncTaskStartDeclaration(wrapper, baseContext),
    '',
    ...emitAsyncTaskResumeDeclaration(wrapper, baseContext),
    '',
    ...emitAsyncTaskRejectDeclaration(wrapper, baseContext),
    '',
    ...emitAsyncTaskFinalizerDeclaration(wrapper)
  ]
}

function emitAsyncTaskStartDeclaration(wrapper, baseContext) {
  const context = createAsyncTaskEmitContext(baseContext, wrapper, 'void', 0)
  context.forceRuntimeStringDeclarations = new Set(
    collectAsyncTaskFrameLocals(wrapper, 'prefix')
      .filter((local) => local.forceRuntimeStringDeclaration === true)
      .map((local) => local.name)
  )
  context.failureStatement = 'goto ccjs_start_error;'
  const prefixAndScheduleLines = withVariableScope(context, () => [
    ...emitStatementList(wrapper.prefixStatements ?? [], context),
    ...emitAsyncTaskStorePrefixLocalLines(wrapper),
    ...emitAsyncTaskScheduleAwaitLines(wrapper, wrapper.awaits[0], context, {
      cleanup: 'start',
      final: wrapper.awaits.length === 1
    })
  ])
  const lines = [
    `static ccjs_status ${wrapper.startName}(${emitAsyncTaskStartParams(wrapper)}) {`,
    '  if (ccjs_loop == 0 || ccjs_loop->allocator == 0 || out == 0) return CCJS_ERR_TYPE;',
    '  *out = 0;',
    `  ${wrapper.frameTypeName}* frame = ccjs_loop->allocator->alloc(ccjs_loop->allocator->user, sizeof(${wrapper.frameTypeName}), _Alignof(${wrapper.frameTypeName}));`,
    '  if (frame == 0) return CCJS_ERR_OOM;',
    '  frame->ccjs_loop = ccjs_loop;',
    '  frame->promise = 0;',
    '  frame->awaited = 0;',
    '  frame->state = 0;',
    ...wrapper.params.map((param) => `  frame->${param.fieldName} = ${param.argName};`),
    ...wrapper.frameLocals.map((local) => `  frame->${local.fieldName} = ${emitAsyncTaskStorageInit(local.type)};`),
    '  ccjs_status status = ccjs_promise_new(ccjs_loop, &frame->promise);',
    ...emitOwnedValueDeclarations(context).map((line) => `  ${line}`),
    '  if (status != CCJS_OK) {',
    '    ccjs_loop->allocator->free(ccjs_loop->allocator->user, frame, sizeof(*frame), _Alignof(*frame));',
    '    return status;',
    '  }',
    ...wrapper.params
      .filter((param) => isManagedRuntimeReturnType(param.valueType))
      .map((param) => `  ccjs_retain(frame->${param.fieldName});`),
    '  ccjs_promise_retain(frame->promise);',
    '  *out = frame->promise;',
    ...emitAsyncTaskVisibleLocalReads(wrapper, 0, { includePrefixLocals: false }).map((line) => `  ${line}`),
    ...prefixAndScheduleLines.map((line) => `  ${line}`),
    ...emitOwnedValueCleanup(context).map((line) => `  ${line}`),
    '  return CCJS_OK;',
    ...(context.failureStatementUsed
      ? [
          'ccjs_start_error:',
          ...emitOwnedValueCleanup(context).map((line) => `  ${line}`),
          '  ccjs_promise_release(*out);',
          '  *out = 0;',
          `  ${wrapper.finalizerName}(frame);`,
          '  return CCJS_ERR_TYPE;'
        ]
      : []),
    '}'
  ]

  return lines
}

function emitAsyncTaskStartParams(wrapper) {
  const params = [
    'ccjs_loop* ccjs_loop',
    ...wrapper.params.map((param) => `${emitCType(param.valueType)} ${param.argName}`),
    'ccjs_promise** out'
  ]

  return params.join(', ')
}

function registerAsyncTaskParams(wrapper, context) {
  for (const param of wrapper.params) {
    registerAsyncTaskLocalMetadata(param.name, param.valueType, param, context)
  }
}

function registerAsyncTaskAwaitLocals(wrapper, context, count) {
  for (const item of collectAsyncTaskVisibleAwaitFrameLocals(wrapper, count)) {
    registerAsyncTaskLocalMetadata(item.name, item.type, item, context)
  }
}

function registerAsyncTaskPrefixLocals(wrapper, context) {
  for (const local of collectAsyncTaskFrameLocals(wrapper, 'prefix')) {
    registerAsyncTaskLocalMetadata(local.name, local.type, local, context)
  }
}

function emitAsyncTaskStorePrefixLocalLines(wrapper) {
  return collectAsyncTaskFrameLocals(wrapper, 'prefix').flatMap((local) => {
    if (local.type === 'string') {
      return [
        ...emitPrepareOwnedValueWrite(`frame->${local.fieldName}`),
        `frame->${local.fieldName}.tag = CCJS_TAG_STRING;`,
        `frame->${local.fieldName}.as.ref = (ccjs_ref*)&${local.name}->header;`,
        `ccjs_retain(frame->${local.fieldName});`
      ]
    }

    if (isManagedRuntimeReturnType(local.type)) {
      return [
        ...emitPrepareOwnedValueWrite(`frame->${local.fieldName}`),
        `frame->${local.fieldName} = ${local.name};`,
        `ccjs_retain(frame->${local.fieldName});`
      ]
    }

    return [`frame->${local.fieldName} = ${local.name};`]
  })
}

function emitAsyncTaskVisibleLocalReads(wrapper, count, options = { includePrefixLocals: true }) {
  return [
    ...wrapper.params.flatMap((param) => emitAsyncTaskVisibleLocalRead(param.name, param.valueType, param.fieldName)),
    ...(options.includePrefixLocals === false
      ? []
      : collectAsyncTaskFrameLocals(wrapper, 'prefix').flatMap((local) =>
          emitAsyncTaskVisibleLocalRead(local.name, local.type, local.fieldName)
        )),
    ...collectAsyncTaskVisibleAwaitFrameLocals(wrapper, count).flatMap((item) =>
      emitAsyncTaskVisibleLocalRead(item.name, item.type, item.fieldName)
    )
  ]
}

function collectAsyncTaskFrameLocals(wrapper, kind: AsyncTaskFrameLocalKind | null = null) {
  return (wrapper.frameLocals ?? []).filter((local) => kind == null || local.kind === kind)
}

function collectAsyncTaskVisibleAwaitFrameLocals(wrapper, count) {
  return collectAsyncTaskFrameLocals(wrapper, 'await').filter((local) => local.index < count && local.name != null)
}

function registerAsyncTaskLocalMetadata(name, valueType, item, context) {
  context.variables.set(name, valueType)

  if (valueType === 'string') {
    context.runtimeStrings.add(name)
  } else if (valueType === 'object') {
    registerObjectShape(context, name, item.shape)
  } else if (valueType === 'array') {
    context.runtimeArrayElementTypes.set(name, item.arrayElementType ?? 'unknown')
  } else if (valueType === 'map') {
    context.mapTypes.set(name, {
      key: item.mapKeyType ?? 'unknown',
      value: item.mapValueType ?? 'unknown'
    })
  } else if (valueType === 'set') {
    context.setElementTypes.set(name, item.setElementType ?? 'unknown')
  }
}

function emitAsyncTaskVisibleLocalRead(name, valueType, fieldName) {
  if (valueType === 'string') {
    return [`ccjs_string* ${name} = (ccjs_string*)frame->${fieldName}.as.ref;`]
  }

  if (isManagedRuntimeReturnType(valueType)) {
    return [`ccjs_value ${name} = frame->${fieldName};`]
  }

  return [`${emitCType(valueType)} ${name} = frame->${fieldName};`]
}

function createAsyncTaskEmitContext(baseContext, wrapper, returnType, visibleAwaitCount) {
  const context = createFunctionContext(baseContext, returnType)
  context.statusReturn = true
  context.externalEventLoop = true
  context.eventLoopUsed = true
  registerAsyncTaskParams(wrapper, context)
  registerAsyncTaskPrefixLocals(wrapper, context)
  registerAsyncTaskAwaitLocals(wrapper, context, visibleAwaitCount)

  return context
}

function emitAsyncTaskScheduleAwaitLines(wrapper, item, context, options) {
  const awaitedPromise = emitPreparedAsyncTaskAwaitedPromiseExpression(wrapper, item, context, options)
  const awaited = awaitedPromise == null ? emitPreparedAsyncTaskAwaitedValueExpression(item, context) : null
  const finalizer = options.final ? wrapper.finalizerName : '0'
  const cleanupLines = options.cleanupLines ?? emitOwnedValueCleanup(context)

  return [
    ...(awaitedPromise == null
      ? [
          'status = ccjs_promise_new(ccjs_loop, &frame->awaited);',
          ...emitAsyncTaskScheduleStatusCheck(wrapper, options, cleanupLines)
        ]
      : awaitedPromise.lines),
    `status = ccjs_promise_then(frame->awaited, ${wrapper.resumeName}, ${wrapper.rejectName}, frame, ${finalizer});`,
    ...emitAsyncTaskScheduleStatusCheck(wrapper, options, cleanupLines),
    ...(awaitedPromise == null
      ? [
          ...(awaited?.lines ?? []),
          `status = ccjs_promise_resolve(frame->awaited, ${awaited?.expression ?? 'ccjs_undefined_value()'});`,
          ...emitAsyncTaskResolveStatusCheck(wrapper, options, cleanupLines)
        ]
      : [])
  ]
}

function emitAsyncTaskScheduleStatusCheck(wrapper, options, cleanupLines: string[] = []) {
  if (options.cleanup === 'start') {
    return [
      'if (status != CCJS_OK) {',
      ...cleanupLines.map((line) => `  ${line}`),
      '  ccjs_promise_release(*out);',
      '  *out = 0;',
      `  ${wrapper.finalizerName}(frame);`,
      '  return status;',
      '}'
    ]
  }

  return [
    'if (status != CCJS_OK) {',
    ...cleanupLines.map((line) => `  ${line}`),
    '  ccjs_status reject_status = ccjs_promise_reject(frame->promise, ccjs_number_value((ccjs_number)status));',
    `  ${wrapper.finalizerName}(frame);`,
    '  return reject_status == CCJS_OK ? status : reject_status;',
    '}'
  ]
}

function emitAsyncTaskResolveStatusCheck(wrapper, options, cleanupLines: string[] = []) {
  if (options.cleanup === 'start') {
    return [
      'if (status != CCJS_OK) {',
      ...cleanupLines.map((line) => `  ${line}`),
      '  ccjs_promise_release(*out);',
      '  *out = 0;',
      ...(options.final ? [] : [`  ${wrapper.finalizerName}(frame);`]),
      '  return status;',
      '}'
    ]
  }

  if (options.final) {
    return ['if (status != CCJS_OK) {', ...cleanupLines.map((line) => `  ${line}`), '  return status;', '}']
  }

  return emitAsyncTaskScheduleStatusCheck(wrapper, options, cleanupLines)
}

function emitPreparedAsyncTaskAwaitedPromiseExpression(wrapper, item, context, options) {
  if (item.awaitedPromiseExpression == null) {
    return null
  }

  const promiseSource = emitPreparedAsyncTaskPromiseSourceExpression(wrapper, item, context, options)

  if (promiseSource != null) {
    return promiseSource
  }

  const chain = emitPreparedAsyncTaskAwaitedPromiseChainExpression(wrapper, item, context, options)

  if (chain != null) {
    return chain
  }

  if (
    item.awaitedPromiseExpression?.type !== 'CallExpression' ||
    cPromiseRuntimeCallName(item.awaitedPromiseExpression.callee) !== 'resolve'
  ) {
    context.diagnostics.push(
      diagnostic(
        'CCJS_C_ASYNC',
        'async task state-machine slice currently supports local Promise.resolve(...) variables only',
        item.awaitedPromiseExpression?.loc
      )
    )

    return {
      lines: ['status = CCJS_ERR_TYPE;', ...emitAsyncTaskScheduleStatusCheck(wrapper, options)]
    }
  }

  const value = emitPreparedAsyncTaskValueExpression(item.awaitedPromiseExpression.args[0], item.type, context)

  return {
    lines: [
      ...value.lines,
      `status = ccjs_promise_resolved(ccjs_loop, ${value.expression}, &frame->awaited);`,
      ...emitAsyncTaskScheduleStatusCheck(wrapper, options)
    ]
  }
}

function emitPreparedAsyncTaskPromiseSourceExpression(wrapper, item, context, options) {
  const expression = item.awaitedPromiseExpression

  if (expression?.type !== 'CallExpression') {
    return null
  }

  const rejected = emitPreparedAsyncTaskRejectedPromiseSourceExpression(expression, wrapper, context, options)

  if (rejected != null) {
    return rejected
  }

  const fsCall = emitPreparedAsyncTaskFsSourceExpression(expression, wrapper, context, options)

  if (fsCall != null) {
    return fsCall
  }

  const fetchCall = emitPreparedAsyncTaskFetchSourceExpression(expression, wrapper, context, options)

  if (fetchCall != null) {
    return fetchCall
  }

  const taskCall = emitPreparedAsyncTaskSourceCallExpression(expression, wrapper, context, options)

  if (taskCall != null) {
    return taskCall
  }

  const asyncCall = emitPreparedAsyncFunctionSourceCallExpression(expression, wrapper, context, options)

  if (asyncCall != null) {
    return asyncCall
  }

  const promiseCall = emitPreparedPlainPromiseSourceCallExpression(expression, wrapper, context, options)

  if (promiseCall != null) {
    return promiseCall
  }

  return null
}

function emitPreparedAsyncTaskFsSourceExpression(expression, wrapper, context, options) {
  if (!isAsyncFsRuntimeCallExpression(expression)) {
    return null
  }

  const method = cFsRuntimeExpressionMethod(expression)
  const path = emitPreparedStringBytesOperand(expression.args[0], context, 'ccjs_fs_path')
  const lines = [...path.lines]

  if (method === 'readFile') {
    lines.push(`status = ccjs_fs_read_file(ccjs_loop, ${path.bytes}, ${path.length}, &frame->awaited);`)
  } else if (method === 'readFileBytes') {
    lines.push(`status = ccjs_fs_read_file_bytes(ccjs_loop, ${path.bytes}, ${path.length}, &frame->awaited);`)
  } else if (method === 'readDir') {
    lines.push(`status = ccjs_fs_read_dir(ccjs_loop, ${path.bytes}, ${path.length}, &frame->awaited);`)
  } else if (method === 'readDirDirents') {
    lines.push(`status = ccjs_fs_read_dir_dirents(ccjs_loop, ${path.bytes}, ${path.length}, &frame->awaited);`)
  } else if (method === 'stat') {
    lines.push(`status = ccjs_fs_stat(ccjs_loop, ${path.bytes}, ${path.length}, &frame->awaited);`)
  } else if (method === 'lstat') {
    lines.push(`status = ccjs_fs_lstat(ccjs_loop, ${path.bytes}, ${path.length}, &frame->awaited);`)
  } else if (method === 'realpath') {
    lines.push(`status = ccjs_fs_realpath(ccjs_loop, ${path.bytes}, ${path.length}, &frame->awaited);`)
  } else if (method === 'readlink') {
    lines.push(`status = ccjs_fs_readlink(ccjs_loop, ${path.bytes}, ${path.length}, &frame->awaited);`)
  } else if (method === 'access') {
    const mode = emitPreparedFsAccessModeExpression(expression, context)

    lines.push(...mode.lines)
    lines.push(`status = ccjs_fs_access(ccjs_loop, ${path.bytes}, ${path.length}, ${mode.expression}, &frame->awaited);`)
  } else if (method === 'appendFileBytes') {
    const bytes = emitCValueExpression(expression.args[1], context)

    lines.push(...bytes.lines)
    lines.push(emitRuntimeValueCheck(bytes.expression, 'CCJS_TAG_BYTES', context))
    lines.push(
      `status = ccjs_fs_append_file_bytes(ccjs_loop, ${path.bytes}, ${path.length}, ${bytes.expression}, &frame->awaited);`
    )
  } else if (method === 'appendFile') {
    const bytes = emitPreparedStringBytesOperand(expression.args[1], context, 'ccjs_fs_bytes')

    lines.push(...bytes.lines)
    lines.push(
      `status = ccjs_fs_append_file(ccjs_loop, ${path.bytes}, ${path.length}, ${bytes.bytes}, ${bytes.length}, &frame->awaited);`
    )
  } else if (method === 'copyFile') {
    const destPath = emitPreparedStringBytesOperand(expression.args[1], context, 'ccjs_fs_dest_path')

    lines.push(...destPath.lines)
    lines.push(
      `status = ccjs_fs_copy_file(ccjs_loop, ${path.bytes}, ${path.length}, ${destPath.bytes}, ${destPath.length}, &frame->awaited);`
    )
  } else if (method === 'symlink') {
    const linkPath = emitPreparedStringBytesOperand(expression.args[1], context, 'ccjs_fs_link_path')

    lines.push(...linkPath.lines)
    lines.push(
      `status = ccjs_fs_symlink(ccjs_loop, ${path.bytes}, ${path.length}, ${linkPath.bytes}, ${linkPath.length}, &frame->awaited);`
    )
  } else if (method === 'mkdir') {
    lines.push(`status = ccjs_fs_mkdir(ccjs_loop, ${path.bytes}, ${path.length}, ${emitFsBooleanFlag(expression, 'fsRecursive')}, &frame->awaited);`)
  } else if (method === 'unlink') {
    lines.push(`status = ccjs_fs_unlink(ccjs_loop, ${path.bytes}, ${path.length}, &frame->awaited);`)
  } else if (method === 'rm') {
    lines.push(
      `status = ccjs_fs_rm(ccjs_loop, ${path.bytes}, ${path.length}, ${emitFsBooleanFlag(expression, 'fsRecursive')}, ${emitFsBooleanFlag(expression, 'fsForce')}, &frame->awaited);`
    )
  } else if (method === 'rename') {
    const newPath = emitPreparedStringBytesOperand(expression.args[1], context, 'ccjs_fs_new_path')

    lines.push(...newPath.lines)
    lines.push(
      `status = ccjs_fs_rename(ccjs_loop, ${path.bytes}, ${path.length}, ${newPath.bytes}, ${newPath.length}, &frame->awaited);`
    )
  } else if (method === 'writeFileBytes') {
    const bytes = emitCValueExpression(expression.args[1], context)

    lines.push(...bytes.lines)
    lines.push(emitRuntimeValueCheck(bytes.expression, 'CCJS_TAG_BYTES', context))
    lines.push(
      `status = ccjs_fs_write_file_bytes(ccjs_loop, ${path.bytes}, ${path.length}, ${bytes.expression}, &frame->awaited);`
    )
  } else {
    const bytes = emitPreparedStringBytesOperand(expression.args[1], context, 'ccjs_fs_bytes')

    lines.push(...bytes.lines)
    lines.push(
      `status = ccjs_fs_write_file(ccjs_loop, ${path.bytes}, ${path.length}, ${bytes.bytes}, ${bytes.length}, &frame->awaited);`
    )
  }

  return {
    lines: [...lines, ...emitAsyncTaskScheduleStatusCheck(wrapper, options)]
  }
}

function emitPreparedAsyncTaskFetchSourceExpression(expression, wrapper, context, options) {
  if (!isAsyncFetchRuntimeCallExpression(expression)) {
    return null
  }

  const method = cFetchRuntimeExpressionMethod(expression)
  const lines: string[] = []

  if (method === 'fetch') {
    const url = emitPreparedStringBytesOperand(expression.args[0], context, 'ccjs_fetch_url')
    const init = emitPreparedFetchInitOperand(expression, context)

    lines.push(...url.lines)
    lines.push(...init.lines)
    lines.push(
      init.expression === '0'
        ? `status = ccjs_fetch(ccjs_loop, ${url.bytes}, ${url.length}, &frame->awaited);`
        : `status = ccjs_fetch_with_init(ccjs_loop, ${url.bytes}, ${url.length}, ${init.expression}, &frame->awaited);`
    )
  } else {
    const response = emitCValueExpression(expression.callee.object, context)

    lines.push(...response.lines)
    lines.push(emitRuntimeTypeCheck(`${response.expression}.tag != CCJS_TAG_OBJECT || ${response.expression}.as.ref == 0`, context))
    lines.push(`status = ccjs_fetch_response_text(ccjs_loop, ${response.expression}, &frame->awaited);`)
  }

  return {
    lines: [...lines, ...emitAsyncTaskScheduleStatusCheck(wrapper, options)]
  }
}

function emitPreparedAsyncTaskRejectedPromiseSourceExpression(expression, wrapper, context, options) {
  if (cPromiseRuntimeCallName(expression.callee) !== 'reject') {
    return null
  }

  if (expression.args[0]?.type === 'StringLiteral') {
    const value = nextCName(context, 'ccjs_reject_value')
    const bytes = cStringLiteral(expression.args[0].value)
    const length = utf8ByteLength(expression.args[0].value)

    return {
      lines: [
        `ccjs_value ${value} = ccjs_undefined_value();`,
        `status = ccjs_string_from_literal(&ccjs_default_allocator, ${bytes}, ${length}, &${value});`,
        ...emitAsyncTaskScheduleStatusCheck(wrapper, options, [`ccjs_release(${value});`]),
        `status = ccjs_promise_rejected(ccjs_loop, ${value}, &frame->awaited);`,
        `ccjs_release(${value});`,
        `${value} = ccjs_undefined_value();`,
        ...emitAsyncTaskScheduleStatusCheck(wrapper, options)
      ]
    }
  }

  if (
    expression.args[0] != null &&
    expression.args[0].type !== 'NumberLiteral' &&
    expression.args[0].type !== 'BooleanLiteral'
  ) {
    context.diagnostics.push(
      diagnostic(
        'CCJS_C_ASYNC',
        'async task Promise.reject currently supports string, number and boolean rejection values in C',
        expression.loc
      )
    )

    return {
      lines: ['status = CCJS_ERR_TYPE;', ...emitAsyncTaskScheduleStatusCheck(wrapper, options)]
    }
  }

  const value =
    expression.args[0] == null
      ? {
          lines: [],
          expression: 'ccjs_undefined_value()'
        }
      : emitCValueExpression(expression.args[0], context)

  return {
    lines: [
      ...value.lines,
      `status = ccjs_promise_rejected(ccjs_loop, ${value.expression}, &frame->awaited);`,
      ...emitAsyncTaskScheduleStatusCheck(wrapper, options)
    ]
  }
}

function emitPreparedAsyncTaskSourceCallExpression(expression, wrapper, context, options) {
  if (expression.callee?.type !== 'Reference' || expression.callee.path.length !== 1) {
    return null
  }

  const target = context.asyncTaskWrappers.get(expression.callee.path[0])

  if (target == null) {
    return null
  }

  const prepared = emitPreparedCallArgs(expression, target.params, context)
  const args = ['ccjs_loop', ...prepared.args, '&frame->awaited']

  return {
    lines: [
      ...prepared.lines,
      `status = ${target.startName}(${args.join(', ')});`,
      ...emitAsyncTaskScheduleStatusCheck(wrapper, options)
    ]
  }
}

function emitPreparedAsyncFunctionSourceCallExpression(expression, wrapper, context, options) {
  if (!isAsyncFunctionCallee(expression.callee, context) || isThrowingFunctionCallee(expression.callee, context)) {
    return null
  }

  const valueType =
    resolveCAsyncFunctionAwaitValueType(expression.callee, context) ?? expression.promiseValueType ?? 'unknown'

  if (!isSupportedAsyncTaskValueType(valueType)) {
    return null
  }

  const call = emitPreparedCallExpression(expression, context)

  if (valueType === 'void') {
    return {
      lines: [
        ...call.lines,
        `${call.expression};`,
        'status = ccjs_promise_resolved(ccjs_loop, ccjs_undefined_value(), &frame->awaited);',
        ...emitAsyncTaskScheduleStatusCheck(wrapper, options)
      ]
    }
  }

  if (isManagedRuntimeReturnType(valueType)) {
    const value = nextCName(context, 'ccjs_async_value')
    const tag = cRuntimeValueTag(valueType)

    return {
      lines: [
        ...call.lines,
        `ccjs_value ${value} = ${call.expression};`,
        emitRuntimeValueCheck(value, tag, context),
        `status = ccjs_promise_resolved(ccjs_loop, ${value}, &frame->awaited);`,
        ...emitAsyncTaskScheduleStatusCheck(wrapper, options, [`ccjs_release(${value});`]),
        `ccjs_release(${value});`
      ]
    }
  }

  const value =
    valueType === 'boolean' ? `ccjs_bool_value((${call.expression}) != 0)` : `ccjs_number_value(${call.expression})`

  return {
    lines: [
      ...call.lines,
      `status = ccjs_promise_resolved(ccjs_loop, ${value}, &frame->awaited);`,
      ...emitAsyncTaskScheduleStatusCheck(wrapper, options)
    ]
  }
}

function emitPreparedPlainPromiseSourceCallExpression(expression, wrapper, context, options) {
  if (!isPromiseReturningFunctionCallee(expression.callee, context)) {
    return null
  }

  const params = resolveFunctionParams(expression.callee, context)

  if (params == null) {
    return null
  }

  const prepared = emitPreparedCallArgs(expression, params, context)

  return {
    lines: [
      ...prepared.lines,
      `frame->awaited = ${emitCallee(expression.callee, context)}(${['ccjs_loop', ...prepared.args].join(', ')});`,
      'status = frame->awaited == 0 ? CCJS_ERR_TYPE : CCJS_OK;',
      ...emitAsyncTaskScheduleStatusCheck(wrapper, options)
    ]
  }
}

function emitPreparedAsyncTaskAwaitedPromiseChainExpression(wrapper, item, context, options) {
  const expression = item.awaitedPromiseExpression

  if (
    expression?.type !== 'CallExpression' ||
    expression.callee?.type !== 'MemberExpression' ||
    expression.callee.property !== 'then'
  ) {
    return null
  }

  const receiver = expression.callee.object
  const callback = expression.args[0]
  const chainWrapper = callback == null ? null : context.promiseChainArrowWrappers.get(callback)

  if (
    receiver?.type !== 'CallExpression' ||
    cPromiseRuntimeCallName(receiver.callee) !== 'resolve' ||
    chainWrapper == null
  ) {
    context.diagnostics.push(
      diagnostic(
        'CCJS_C_ASYNC',
        'async task state-machine slice currently supports local Promise.resolve(...).then(...) variables only',
        expression.loc
      )
    )

    return {
      lines: ['status = CCJS_ERR_TYPE;', ...emitAsyncTaskScheduleStatusCheck(wrapper, options)]
    }
  }

  const source = nextCName(context, 'ccjs_async_task_source')
  const sourceType = receiver.promiseValueType ?? callback.params[0]?.valueType ?? item.type
  const value = emitPreparedAsyncTaskValueExpression(receiver.args[0], sourceType, context)
  const callbackContext = emitAsyncTaskPromiseChainCallbackContext(wrapper, chainWrapper, context, options)
  const cleanupLines =
    callbackContext.expression === '0' ? [] : [`${chainWrapper.finalizerName}(${callbackContext.expression});`]

  return {
    lines: [
      ...callbackContext.lines,
      `ccjs_promise* ${source} = 0;`,
      ...value.lines,
      `status = ccjs_promise_resolved(ccjs_loop, ${value.expression}, &${source});`,
      ...emitAsyncTaskScheduleStatusCheck(wrapper, options, cleanupLines),
      `status = ccjs_promise_chain(${source}, ${chainWrapper.name}, 0, ${callbackContext.expression}, ${callbackContext.finalizer}, &frame->awaited);`,
      `ccjs_promise_release(${source});`,
      `${source} = 0;`,
      ...emitAsyncTaskScheduleStatusCheck(wrapper, options, cleanupLines)
    ]
  }
}

function emitAsyncTaskPromiseChainCallbackContext(asyncWrapper, chainWrapper, context, options) {
  if (!isPromiseChainCallbackWrapperWithContext(chainWrapper)) {
    return {
      lines: [],
      expression: '0',
      finalizer: '0'
    }
  }

  const lines: string[] = []

  for (const capture of chainWrapper.captures) {
    if (capture.mutable) {
      context.diagnostics.push(
        diagnostic(
          'CCJS_C_ASYNC',
          'mutable Promise callback captures are outside the current C backend MVP; use const captures or move mutation outside the Promise callback',
          chainWrapper.expression.loc
        )
      )
    }

    if (!['number', 'boolean', 'string', 'object'].includes(capture.valueType)) {
      context.diagnostics.push(
        diagnostic(
          'CCJS_C_ASYNC',
          'capturing async Promise callbacks currently support only const number/boolean/string/object bindings',
          chainWrapper.expression.loc
        )
      )
    }
  }

  const contextName = nextCName(context, 'ccjs_promise_callback_ctx')

  lines.push(
    `${chainWrapper.contextTypeName}* ${contextName} = ccjs_default_alloc(0, sizeof(${chainWrapper.contextTypeName}), _Alignof(${chainWrapper.contextTypeName}));`
  )
  lines.push('if (' + contextName + ' == 0) {')
  lines.push('  status = CCJS_ERR_OOM;')
  lines.push(...emitAsyncTaskScheduleStatusCheck(asyncWrapper, options).map((line) => `  ${line}`))
  lines.push('}')

  if (chainWrapper.needsEventLoop === true) {
    lines.push(`${contextName}->ccjs_loop = ccjs_loop;`)
  }

  for (const capture of chainWrapper.captures) {
    lines.push(...emitRuntimeArrowCaptureStoreLines(capture, contextName, context))
  }

  return {
    lines,
    expression: contextName,
    finalizer: chainWrapper.finalizerName
  }
}

function emitPreparedAsyncTaskAwaitedValueExpression(item, context) {
  if (
    item.awaitedExpression?.type !== 'CallExpression' ||
    cPromiseRuntimeCallName(item.awaitedExpression.callee) !== 'resolve'
  ) {
    context.diagnostics.push(
      diagnostic(
        'CCJS_C_ASYNC',
        'async task state-machine slice currently supports await Promise.resolve(...) only',
        item.awaitedExpression?.loc
      )
    )

    return {
      lines: ['status = CCJS_ERR_TYPE;'],
      expression: 'ccjs_undefined_value()'
    }
  }

  return emitPreparedAsyncTaskValueExpression(item.awaitedExpression.args[0], item.type, context)
}

function emitPreparedAsyncTaskValueExpression(expression, valueType, context) {
  if (valueType === 'void') {
    return {
      lines: [],
      expression: 'ccjs_undefined_value()'
    }
  }

  if (isManagedRuntimeReturnType(valueType)) {
    const value = emitCValueExpression(expression, context)
    const expectedTag = cRuntimeValueTag(valueType)

    return {
      lines: [...value.lines, emitRuntimeValueCheck(value.expression, expectedTag, context)],
      expression: value.expression
    }
  }

  if (valueType === 'boolean') {
    const value = emitPreparedNumberExpression(expression, context)

    return {
      lines: value.lines,
      expression: `ccjs_bool_value((${value.expression}) != 0)`
    }
  }

  const value = emitPreparedNumberExpression(expression, context)

  return {
    lines: value.lines,
    expression: `ccjs_number_value(${value.expression})`
  }
}

function emitAsyncTaskResumeDeclaration(wrapper, baseContext) {
  const context = createAsyncTaskEmitContext(baseContext, wrapper, wrapper.returnType, wrapper.awaits.length)
  const returnValue = hasAsyncTaskStatementLocalDeclarations(collectAsyncTaskSuccessPhaseStatements(wrapper, ['body']))
    ? null
    : emitPreparedAsyncTaskValueExpression(wrapper.returnExpression, wrapper.returnType, context)
  const returnValueOwnedValues = returnValue == null ? [] : [...context.ownedValues]
  const cases = wrapper.awaits.flatMap((item) =>
    emitAsyncTaskResumeCase(wrapper, item, baseContext, returnValue, returnValueOwnedValues)
  )

  return [
    `static ccjs_status ${wrapper.resumeName}(void* context, ccjs_value ccjs_value_input) {`,
    `  ${wrapper.frameTypeName}* frame = (${wrapper.frameTypeName}*)context;`,
    '  if (frame == 0 || frame->promise == 0) return CCJS_ERR_TYPE;',
    '  ccjs_status status = CCJS_OK;',
    '  switch (frame->state) {',
    ...cases.map((line) => `  ${line}`),
    '  default:',
    '    return ccjs_promise_reject(frame->promise, ccjs_number_value((ccjs_number)CCJS_ERR_TYPE));',
    '  }',
    '}'
  ]
}

function emitAsyncTaskResumeCase(wrapper, item, baseContext, returnValue, returnValueOwnedValues) {
  const nextItem = wrapper.awaits[item.index + 1] ?? null
  const valueCheck = emitAsyncTaskFulfilledValueCheck(wrapper, item)
  const lines = [
    `case ${item.index}: {`,
    ...valueCheck.map((line) => `  ${line}`),
    ...emitAsyncTaskStoreFulfilledValueLines(item).map((line) => `  ${line}`),
    '  if (frame->awaited != 0) {',
    '    ccjs_promise_release(frame->awaited);',
    '    frame->awaited = 0;',
    '  }'
  ]

  if (nextItem == null) {
    lines.push(...emitAsyncTaskVisibleLocalReads(wrapper, item.index + 1).map((line) => `  ${line}`))
    if (returnValue == null) {
      lines.push(...emitAsyncTaskTrySuccessPreludeAndReturnLines(wrapper, item, baseContext).map((line) => `  ${line}`))
    } else if (returnValueOwnedValues.length > 0) {
      lines.push(...returnValueOwnedValues.map((name) => `  ccjs_value ${name} = ccjs_undefined_value();`))
      lines.push(
        ...emitAsyncTaskTrySuccessPreludeLines(wrapper, baseContext, item.index + 1).map((line) => `  ${line}`)
      )
      lines.push(...returnValue.lines.map((line) => `  ${line}`))
      lines.push(
        ...emitAsyncTaskTrySuccessFinallyLines(wrapper, baseContext, item.index + 1).map((line) => `  ${line}`)
      )
      lines.push(`  status = ccjs_promise_resolve(frame->promise, ${returnValue.expression});`)
      lines.push(...returnValueOwnedValues.toReversed().map((name) => `  ccjs_release(${name});`))
      lines.push('  return status;')
    } else {
      lines.push(
        ...emitAsyncTaskTrySuccessPreludeLines(wrapper, baseContext, item.index + 1).map((line) => `  ${line}`)
      )
      lines.push(...returnValue.lines.map((line) => `  ${line}`))
      lines.push(
        ...emitAsyncTaskTrySuccessFinallyLines(wrapper, baseContext, item.index + 1).map((line) => `  ${line}`)
      )
      lines.push(`  return ccjs_promise_resolve(frame->promise, ${returnValue.expression});`)
    }
    lines.push('}')
    return lines
  }

  const context = createAsyncTaskEmitContext(baseContext, wrapper, 'void', item.index + 1)
  const schedule = emitAsyncTaskScheduleAwaitLines(wrapper, nextItem, context, {
    cleanup: 'resume',
    final: nextItem.index === wrapper.awaits.length - 1
  })

  lines.push(...emitAsyncTaskVisibleLocalReads(wrapper, item.index + 1).map((line) => `  ${line}`))
  lines.push('  ccjs_loop* ccjs_loop = frame->ccjs_loop;')
  lines.push('  if (ccjs_loop == 0) {')
  lines.push(
    ...emitAsyncTaskRejectAndMaybeFinalizeLines(wrapper, item, 'ccjs_number_value((ccjs_number)CCJS_ERR_TYPE)').map(
      (line) => `    ${line}`
    )
  )
  lines.push('  }')
  lines.push(`  frame->state = ${nextItem.index};`)
  lines.push(...schedule.map((line) => `  ${line}`))
  lines.push('  return CCJS_OK;')
  lines.push('}')

  return lines
}

function hasAsyncTaskStatementLocalDeclarations(statements) {
  return statements.some(
    (statement) => statement?.type === 'VariableDeclaration' && isManagedRuntimeReturnType(statement.valueType)
  )
}

function collectAsyncTaskSuccessPhaseStatements(wrapper, kinds: string[] | null = null) {
  const allowedKinds = kinds == null ? null : new Set(kinds)

  return (wrapper.successPhases ?? [])
    .filter((phase) => allowedKinds == null || allowedKinds.has(phase.kind))
    .flatMap((phase) => phase.statements)
}

function collectAsyncTaskTryPhaseStatements(wrapper, kind) {
  return (wrapper.tryPhases ?? []).filter((phase) => phase.kind === kind).flatMap((phase) => phase.statements)
}

function emitAsyncTaskFulfilledValueCheck(wrapper, item) {
  const expectedTag = cRuntimeValueTag(item.type)

  if (expectedTag == null) {
    return []
  }

  const refCheck = isManagedRuntimeReturnType(item.type) ? ' || ccjs_value_input.as.ref == 0' : ''

  return [
    `if (ccjs_value_input.tag != ${expectedTag}${refCheck}) {`,
    ...emitAsyncTaskRejectAndMaybeFinalizeLines(wrapper, item, 'ccjs_number_value((ccjs_number)CCJS_ERR_TYPE)').map(
      (line) => `  ${line}`
    ),
    '}'
  ]
}

function emitAsyncTaskStoreFulfilledValueLines(item) {
  if (item.fieldName == null || item.type === 'void') {
    return []
  }

  if (item.type === 'boolean') {
    return [`frame->${item.fieldName} = ccjs_value_input.as.boolean ? 1 : 0;`]
  }

  if (item.type === 'number') {
    return [`frame->${item.fieldName} = ccjs_value_input.as.number;`]
  }

  if (isManagedRuntimeReturnType(item.type)) {
    return [`frame->${item.fieldName} = ccjs_value_input;`, `ccjs_retain(frame->${item.fieldName});`]
  }

  return []
}

function emitAsyncTaskRejectAndMaybeFinalizeLines(wrapper, item, errorExpression) {
  return [
    `ccjs_status reject_status = ccjs_promise_reject(frame->promise, ${errorExpression});`,
    ...(item.index < wrapper.awaits.length - 1 ? [`${wrapper.finalizerName}(frame);`] : []),
    'return reject_status;'
  ]
}

function emitAsyncTaskTrySuccessFinallyLines(wrapper, baseContext, visibleAwaitCount) {
  if (!wrapper.hasTryRegion) {
    return []
  }

  return emitAsyncTaskTryStatementList(
    collectAsyncTaskTryPhaseStatements(wrapper, 'success-finalizer'),
    wrapper,
    baseContext,
    visibleAwaitCount
  )
}

function emitAsyncTaskTrySuccessPreludeLines(wrapper, baseContext, visibleAwaitCount) {
  return emitAsyncTaskTryStatementList(
    collectAsyncTaskSuccessPhaseStatements(wrapper),
    wrapper,
    baseContext,
    visibleAwaitCount
  )
}

function emitAsyncTaskTrySuccessPreludeAndReturnLines(wrapper, item, baseContext) {
  const visibleAwaitCount = item.index + 1
  const context = createAsyncTaskEmitContext(baseContext, wrapper, wrapper.returnType, visibleAwaitCount)
  const result = withVariableScope(context, () => {
    const preludeLines = emitStatementList(collectAsyncTaskSuccessPhaseStatements(wrapper), context)
    const returnValue = emitPreparedAsyncTaskValueExpression(wrapper.returnExpression, wrapper.returnType, context)

    return {
      preludeLines,
      returnValue
    }
  })

  return [
    ...emitOwnedValueDeclarations(context),
    ...result.preludeLines,
    ...result.returnValue.lines,
    ...emitAsyncTaskTrySuccessFinallyLines(wrapper, baseContext, visibleAwaitCount),
    `status = ccjs_promise_resolve(frame->promise, ${result.returnValue.expression});`,
    ...emitOwnedValueCleanup(context),
    'return status;'
  ]
}

function emitAsyncTaskTryRejectFinallyLines(wrapper, baseContext, visibleAwaitCount) {
  if (!wrapper.hasTryRegion) {
    return []
  }

  return emitAsyncTaskTryStatementList(
    collectAsyncTaskTryPhaseStatements(wrapper, 'reject-finalizer'),
    wrapper,
    baseContext,
    visibleAwaitCount
  )
}

function emitAsyncTaskTryHandlerPreludeLines(wrapper, baseContext, visibleAwaitCount) {
  if (!wrapper.hasTryRegion) {
    return []
  }

  return emitAsyncTaskTryStatementList(
    collectAsyncTaskTryPhaseStatements(wrapper, 'handler-prelude'),
    wrapper,
    baseContext,
    visibleAwaitCount
  )
}

function emitAsyncTaskTryFinallyLines(wrapper, baseContext, visibleAwaitCount) {
  if (!wrapper.hasTryRegion) {
    return []
  }

  return emitAsyncTaskTryStatementList(
    collectAsyncTaskTryPhaseStatements(wrapper, 'handler-finalizer'),
    wrapper,
    baseContext,
    visibleAwaitCount
  )
}

function emitAsyncTaskTryStatementList(statements, wrapper, baseContext, visibleAwaitCount) {
  if (statements.length === 0) {
    return []
  }

  const context = createAsyncTaskEmitContext(baseContext, wrapper, 'void', visibleAwaitCount)
  const lines = withVariableScope(context, () => emitStatementList(statements, context))

  return [...emitOwnedValueDeclarations(context), ...lines, ...emitOwnedValueCleanup(context)]
}

function emitAsyncTaskSettleAndMaybeFinalizeLines(wrapper, item, call) {
  return [
    `status = ${call};`,
    ...(item.index < wrapper.awaits.length - 1 ? [`${wrapper.finalizerName}(frame);`] : []),
    'return status;'
  ]
}

function emitAsyncTaskRejectDeclaration(wrapper, baseContext) {
  if (wrapper.hasTryRegion) {
    return emitAsyncTaskTryRejectDeclaration(wrapper, baseContext)
  }

  const lastState = wrapper.awaits.length - 1

  return [
    `static ccjs_status ${wrapper.rejectName}(void* context, ccjs_value ccjs_error) {`,
    `  ${wrapper.frameTypeName}* frame = (${wrapper.frameTypeName}*)context;`,
    '  if (frame == 0 || frame->promise == 0) return CCJS_ERR_TYPE;',
    '  ccjs_status status = ccjs_promise_reject(frame->promise, ccjs_error);',
    ...(lastState > 0 ? [`  if (frame->state < ${lastState}) {`, `    ${wrapper.finalizerName}(frame);`, '  }'] : []),
    '  return status;',
    '}'
  ]
}

function emitAsyncTaskTryRejectDeclaration(wrapper, baseContext) {
  const cases = wrapper.awaits.flatMap((item) => emitAsyncTaskTryRejectCase(wrapper, item, baseContext))

  return [
    `static ccjs_status ${wrapper.rejectName}(void* context, ccjs_value ccjs_error) {`,
    `  ${wrapper.frameTypeName}* frame = (${wrapper.frameTypeName}*)context;`,
    '  if (frame == 0 || frame->promise == 0) return CCJS_ERR_TYPE;',
    '  ccjs_status status = CCJS_OK;',
    '  switch (frame->state) {',
    ...cases.map((line) => `  ${line}`),
    '  default:',
    '    status = ccjs_promise_reject(frame->promise, ccjs_error);',
    '    return status;',
    '  }',
    '}'
  ]
}

function emitAsyncTaskTryRejectCase(wrapper, item, baseContext) {
  const handler = wrapper.tryHandler ?? null
  const lines = [`case ${item.index}: {`]

  if (handler == null) {
    lines.push(...emitAsyncTaskVisibleLocalReads(wrapper, item.index).map((line) => `  ${line}`))
    lines.push(...emitAsyncTaskTryRejectFinallyLines(wrapper, baseContext, item.index).map((line) => `  ${line}`))
    lines.push(
      ...emitAsyncTaskSettleAndMaybeFinalizeLines(wrapper, item, 'ccjs_promise_reject(frame->promise, ccjs_error)').map(
        (line) => `  ${line}`
      )
    )
    lines.push('}')

    return lines
  }

  if (handler.param != null) {
    lines.push('  if (ccjs_error.tag != CCJS_TAG_STRING || ccjs_error.as.ref == 0) {')
    lines.push(
      ...emitAsyncTaskSettleAndMaybeFinalizeLines(
        wrapper,
        item,
        'ccjs_promise_reject(frame->promise, ccjs_number_value((ccjs_number)CCJS_ERR_TYPE))'
      ).map((line) => `    ${line}`)
    )
    lines.push('  }')
  }

  lines.push(...emitAsyncTaskVisibleLocalReads(wrapper, item.index).map((line) => `  ${line}`))
  lines.push(...emitAsyncTaskTryHandlerPreludeLines(wrapper, baseContext, item.index).map((line) => `  ${line}`))

  if (handler.param != null) {
    lines.push(`  ccjs_string* ${handler.param} = (ccjs_string*)ccjs_error.as.ref;`)
  }

  lines.push(
    ...emitAsyncTaskTryHandlerBodyAndReturnLines(wrapper, item, baseContext, handler).map((line) => `  ${line}`)
  )
  lines.push('}')

  return lines
}

function emitAsyncTaskTryHandlerBodyAndReturnLines(wrapper, item, baseContext, handler) {
  const visibleAwaitCount = item.index
  const context = createAsyncTaskEmitContext(baseContext, wrapper, wrapper.returnType, visibleAwaitCount)

  if (handler.param != null) {
    context.variables.set(handler.param, 'string')
    context.runtimeStrings.add(handler.param)
  }

  const result = withVariableScope(context, () => {
    const handlerLines = emitStatementList(handler.statements ?? [], context)
    const returnValue = emitPreparedAsyncTaskValueExpression(handler.returnExpression, wrapper.returnType, context)

    return {
      handlerLines,
      returnValue
    }
  })

  return [
    ...emitOwnedValueDeclarations(context),
    ...result.handlerLines,
    ...result.returnValue.lines,
    ...emitAsyncTaskTryFinallyLines(wrapper, baseContext, visibleAwaitCount),
    `status = ccjs_promise_resolve(frame->promise, ${result.returnValue.expression});`,
    ...emitOwnedValueCleanup(context),
    ...(item.index < wrapper.awaits.length - 1 ? [`${wrapper.finalizerName}(frame);`] : []),
    'return status;'
  ]
}

function emitAsyncTaskFinalizerDeclaration(wrapper) {
  return [
    `static void ${wrapper.finalizerName}(void* context) {`,
    `  ${wrapper.frameTypeName}* frame = (${wrapper.frameTypeName}*)context;`,
    '  if (frame == 0) return;',
    '  if (frame->awaited != 0) ccjs_promise_release(frame->awaited);',
    ...wrapper.params
      .filter((param) => isManagedRuntimeReturnType(param.valueType))
      .map((param) => `  ccjs_release(frame->${param.fieldName});`),
    ...wrapper.frameLocals
      .filter((local) => isManagedRuntimeReturnType(local.type))
      .map((local) => `  ccjs_release(frame->${local.fieldName});`),
    '  if (frame->promise != 0) ccjs_promise_release(frame->promise);',
    '  if (frame->ccjs_loop != 0 && frame->ccjs_loop->allocator != 0) {',
    '    frame->ccjs_loop->allocator->free(frame->ccjs_loop->allocator->user, frame, sizeof(*frame), _Alignof(*frame));',
    '  }',
    '}'
  ]
}

function emitDgramMessageHandlerHead(wrapper) {
  return `static ccjs_status ${wrapper.name}(void* user, ccjs_dgram_socket* ccjs_socket, const char* ccjs_bytes, size_t ccjs_len, const char* ccjs_host, int ccjs_port)`
}

function emitDgramMessageHandlerDeclaration(wrapper, baseContext) {
  const expression = wrapper.expression
  const messageName = expression.params[0]?.name ?? null
  const rinfoName = expression.params[1]?.name ?? null
  const dgramContext = {
    messageName,
    rinfoName,
    stringLocals: new Map()
  }
  const body = expression.expressionBody
    ? [
        {
          type: 'ExpressionStatement',
          expression: expression.body,
          loc: expression.loc
        }
      ]
    : expression.body
  const lines = [
    `${emitDgramMessageHandlerHead(wrapper)} {`,
    '  (void)user;',
    ...(messageName == null ? ['  (void)ccjs_bytes;', '  (void)ccjs_len;'] : []),
    ...(rinfoName == null ? ['  (void)ccjs_host;', '  (void)ccjs_port;'] : [])
  ]

  for (const statement of body) {
    lines.push(...emitDgramMessageHandlerStatement(statement, dgramContext, baseContext).map((line) => `  ${line}`))
  }

  lines.push('  return CCJS_OK;')
  lines.push('}')

  return lines
}

function emitDgramMessageHandlerStatement(statement, dgramContext, context) {
  if (statement == null) {
    return []
  }

  if (statement.type === 'BlockStatement') {
    return [
      '{',
      ...statement.body
        .flatMap((item) => emitDgramMessageHandlerStatement(item, dgramContext, context))
        .map((line) => `  ${line}`),
      '}'
    ]
  }

  if (statement.type === 'VariableDeclaration') {
    const stringValue = emitDgramStaticStringValue(statement.init, dgramContext)

    if (stringValue == null) {
      context.diagnostics.push(
        diagnostic(
          'CCJS_DGRAM_HANDLER',
          'dgram message listeners in the C backend currently support only static string local declarations',
          statement.loc
        )
      )
      return []
    }

    dgramContext.stringLocals.set(statement.name, stringValue)
    return []
  }

  if (statement.type === 'ExpressionStatement' && statement.expression?.type === 'CallExpression') {
    const call = emitDgramMessageHandlerSocketCallStatement(statement.expression, dgramContext, context)

    if (call != null) {
      return call
    }
  }

  if (statement.type === 'ReturnStatement') {
    if (statement.argument?.type === 'CallExpression') {
      const call = emitDgramMessageHandlerSocketCallStatement(statement.argument, dgramContext, context)

      if (call != null) {
        return [...call, 'return CCJS_OK;']
      }
    }

    return ['return CCJS_OK;']
  }

  context.diagnostics.push(
    diagnostic(
      'CCJS_DGRAM_HANDLER',
      'this dgram message listener statement is not supported by the current C backend slice',
      statement.loc
    )
  )
  return []
}

function emitDgramMessageHandlerSocketCallStatement(expression, dgramContext, context) {
  if (expression.callee?.type !== 'MemberExpression' || expression.callee.object?.type !== 'Reference') {
    return null
  }

  if (expression.callee.property === 'send') {
    return emitDgramSendLines('ccjs_socket', expression.args, context, dgramContext)
  }

  if (expression.callee.property === 'close') {
    return ['ccjs_dgram_close(ccjs_socket);']
  }

  return null
}

function emitDgramSocketVariableDeclaration(statement, context) {
  if (!isDgramCreateSocketCall(statement.init, context)) {
    return null
  }

  context.variables.set(statement.name, 'dgram-socket')
  registerEventLoop(context)

  return emitDgramSocketCreateLines(statement.init, statement.name, context)
}

function emitDgramAddressVariableDeclaration(statement, context) {
  if (!isDgramAddressCall(statement.init, context)) {
    return null
  }

  const socketName = statement.init.callee.object.path[0]
  const runtime =
    statement.init.callee.property === 'remoteAddress' ? 'ccjs_dgram_socket_remote_address' : 'ccjs_dgram_socket_address'
  context.variables.set(statement.name, 'dgram-address')

  return [
    `ccjs_dgram_address ${statement.name};`,
    emitStatusCheck(`${runtime}(${socketName}, &${statement.name})`, context)
  ]
}

function emitDgramNumberVariableDeclaration(statement, context) {
  if (
    statement.init?.type !== 'CallExpression' ||
    statement.init.callee?.type !== 'MemberExpression' ||
    statement.init.callee.object?.type !== 'Reference' ||
    statement.init.callee.object.path.length !== 1 ||
    context.variables.get(statement.init.callee.object.path[0]) !== 'dgram-socket'
  ) {
    return null
  }

  const socketName = statement.init.callee.object.path[0]
  const method = statement.init.callee.property
  const runtime =
    method === 'getSendBufferSize'
      ? 'ccjs_dgram_get_send_buffer_size'
      : method === 'getRecvBufferSize'
        ? 'ccjs_dgram_get_recv_buffer_size'
        : null

  if (runtime == null) {
    return null
  }

  context.variables.set(statement.name, 'number')

  const size = nextCName(context, 'ccjs_dgram_buffer_size')

  return [
    `double ${statement.name} = 0;`,
    '{',
    `  int ${size} = 0;`,
    `  ${emitStatusCheck(`${runtime}(${socketName}, &${size})`, context)}`,
    `  ${statement.name} = (double)${size};`,
    '}'
  ]
}

function emitDgramSocketCallStatement(expression, context) {
  if (
    expression.callee?.type === 'MemberExpression' &&
    expression.callee.property === 'bind' &&
    isDgramCreateSocketCall(expression.callee.object, context)
  ) {
    const socketName = nextCName(context, 'ccjs_dgram_socket')
    registerEventLoop(context)

    return [
      `ccjs_dgram_socket* ${socketName} = 0;`,
      ...emitDgramSocketCreateLines(expression.callee.object, socketName, context, {
        declare: false
      }),
      ...emitDgramBindLines(socketName, expression.args, context)
    ]
  }

  if (isDgramSocketMethodCall(expression, 'bind', context)) {
    const socketName = expression.callee.object.path[0]
    registerEventLoop(context)

    return emitDgramBindLines(socketName, expression.args, context)
  }

  if (isDgramSocketMethodCall(expression, 'on', context)) {
    return emitDgramOnLines(expression.callee.object.path[0], expression.args, context)
  }

  if (isDgramSocketMethodCall(expression, 'connect', context)) {
    return emitDgramConnectLines(expression.callee.object.path[0], expression.args, context)
  }

  if (isDgramSocketMethodCall(expression, 'disconnect', context)) {
    return emitDgramDisconnectLines(expression.callee.object.path[0], expression.args, context)
  }

  if (isDgramSocketMethodCall(expression, 'send', context)) {
    return emitDgramSendLines(expression.callee.object.path[0], expression.args, context)
  }

  const optionCall = emitDgramSocketOptionCallStatement(expression, context)

  if (optionCall != null) {
    return optionCall
  }

  if (isDgramSocketMethodCall(expression, 'close', context)) {
    return emitDgramCloseLines(expression.callee.object.path[0], expression.args, context)
  }

  if (isDgramSocketAnyMethodCall(expression, context)) {
    context.diagnostics.push(
      diagnostic(
        'CCJS_DGRAM_SOCKET',
        `socket.${expression.callee.property} is not supported by the current C dgram backend slice`,
        expression.callee.loc ?? expression.loc
      )
    )
    return []
  }

  return null
}

function emitDgramSocketCreateLines(expression, socketName, context, options: { declare?: boolean } = {}) {
  emitDgramSocketTypeDiagnostics(expression.args[0], context)

  const listener = emitDgramCreateSocketMessageListener(expression)
  const wrapper = context.dgramMessageHandlers.get(listener)

  if (listener != null && (listener.type !== 'ArrowFunctionExpression' || wrapper == null)) {
    context.diagnostics.push(
      diagnostic(
        'CCJS_DGRAM_SOCKET',
        'dgram.createSocket in the C backend currently requires an inline message listener callback',
        listener.loc
      )
    )
  }

  const lines = options.declare === false ? [] : [`ccjs_dgram_socket* ${socketName} = 0;`]

  lines.push(
    emitStatusCheck(
      `ccjs_dgram_socket_new(${emitEventLoopReference(context)}, ${wrapper?.name ?? '0'}, 0, &${socketName})`,
      context
    )
  )

  if (wrapper != null) {
    context.dgramMessageSockets.add(socketName)
  }

  if (staticObjectBooleanPropertyValue(expression.args[0], 'reuseAddr') === true) {
    context.dgramReuseAddrSockets.add(socketName)
  }

  return lines
}

function emitDgramBindLines(socketName, args, context) {
  const options = args[0]?.type === 'ObjectLiteral' ? args[0] : null
  const objectCallback = options == null ? null : args[1]
  const firstIsCallback = args[0]?.type === 'ArrowFunctionExpression'
  const portArg = options == null ? (firstIsCallback ? null : args[0]) : findObjectLiteralPropertyValue(options, 'port')
  const hostArg =
    options == null
      ? args[1]?.type === 'ArrowFunctionExpression'
        ? null
        : args[1]
      : findObjectLiteralPropertyValue(options, 'address')
  const callback = options == null ? (firstIsCallback ? args[0] : args[1]?.type === 'ArrowFunctionExpression' ? args[1] : args[2]) : objectCallback

  if (args.length > (options == null ? 3 : 2)) {
    context.diagnostics.push(
      diagnostic(
        'CCJS_DGRAM_SOCKET',
        'socket.bind in the C backend currently supports port, optional address and optional callback',
        args.at(-1)?.loc
      )
    )
  }

  const port = portArg == null ? { lines: [], expression: '0' } : emitDgramPortExpression(portArg, null, context)
  const host = emitDgramHostExpression(hostArg, null, context)
  const flags = context.dgramReuseAddrSockets.has(socketName) ? 'CCJS_DGRAM_BIND_REUSEADDR' : '0'
  const lines = [
    ...port.lines,
    emitStatusCheck(`ccjs_dgram_bind_flags(${socketName}, ${host}, (int)(${port.expression}), ${flags})`, context)
  ]

  context.dgramBoundSockets.add(socketName)
  lines.push(...emitDgramMaybeRecvStartLines(socketName, context))
  lines.push(...emitDgramZeroArgCallbackLines(callback, context))

  return lines
}

function emitDgramOnLines(socketName, args, context) {
  if (args[0]?.type !== 'StringLiteral' || args[0].value !== 'message') {
    context.diagnostics.push(
      diagnostic(
        'CCJS_DGRAM_SOCKET',
        "socket.on in the C backend currently supports only the 'message' event",
        args[0]?.loc
      )
    )
    return []
  }

  const listener = args[1]
  const wrapper = context.dgramMessageHandlers.get(listener)

  if (listener?.type !== 'ArrowFunctionExpression' || wrapper == null) {
    context.diagnostics.push(
      diagnostic(
        'CCJS_DGRAM_SOCKET',
        "socket.on('message') in the C backend currently requires an inline message listener",
        listener?.loc
      )
    )
    return []
  }

  context.dgramMessageSockets.add(socketName)

  return [
    emitStatusCheck(`ccjs_dgram_socket_on_message(${socketName}, ${wrapper.name}, 0)`, context),
    ...emitDgramMaybeRecvStartLines(socketName, context)
  ]
}

function emitDgramConnectLines(socketName, args, context) {
  if (args.length < 1) {
    context.diagnostics.push(
      diagnostic('CCJS_DGRAM_SOCKET', 'socket.connect in the C backend currently requires a port argument', args[0]?.loc)
    )
    return []
  }

  const hostArg = args[1]?.type === 'ArrowFunctionExpression' ? null : args[1]
  const callback = args[1]?.type === 'ArrowFunctionExpression' ? args[1] : args[2]
  const port = emitDgramPortExpression(args[0], null, context)
  const host = emitDgramHostExpression(hostArg, null, context)

  if (args.length > 3) {
    context.diagnostics.push(
      diagnostic(
        'CCJS_DGRAM_SOCKET',
        'socket.connect in the C backend currently supports port, optional address and optional callback',
        args[3]?.loc
      )
    )
  }

  return [
    ...port.lines,
    emitStatusCheck(`ccjs_dgram_socket_connect(${socketName}, ${host}, (int)(${port.expression}))`, context),
    ...emitDgramZeroArgCallbackLines(callback, context)
  ]
}

function emitDgramDisconnectLines(socketName, args, context) {
  if (args.length > 0) {
    context.diagnostics.push(
      diagnostic('CCJS_DGRAM_SOCKET', 'socket.disconnect in the C backend does not take arguments', args[0]?.loc)
    )
  }

  return [emitStatusCheck(`ccjs_dgram_socket_disconnect(${socketName})`, context)]
}

function emitDgramSocketOptionCallStatement(expression, context) {
  if (
    expression?.type !== 'CallExpression' ||
    expression.callee?.type !== 'MemberExpression' ||
    expression.callee.object?.type !== 'Reference' ||
    expression.callee.object.path.length !== 1 ||
    context.variables.get(expression.callee.object.path[0]) !== 'dgram-socket'
  ) {
    return null
  }

  const socketName = expression.callee.object.path[0]
  const method = expression.callee.property

  if (method === 'setBroadcast') {
    const enabled = emitPreparedNumberExpression(expression.args[0], context)

    return [
      ...enabled.lines,
      emitStatusCheck(`ccjs_dgram_set_broadcast(${socketName}, ${enabled.expression} ? 1 : 0)`, context)
    ]
  }

  if (method === 'setTTL') {
    const ttl = emitPreparedNumberExpression(expression.args[0], context)

    return [...ttl.lines, emitStatusCheck(`ccjs_dgram_set_ttl(${socketName}, (int)(${ttl.expression}))`, context)]
  }

  if (method === 'setSendBufferSize' || method === 'setRecvBufferSize') {
    const runtime = method === 'setSendBufferSize' ? 'ccjs_dgram_set_send_buffer_size' : 'ccjs_dgram_set_recv_buffer_size'
    const size = emitPreparedNumberExpression(expression.args[0], context)

    return [...size.lines, emitStatusCheck(`${runtime}(${socketName}, (int)(${size.expression}))`, context)]
  }

  if (method === 'ref' || method === 'unref') {
    if (expression.args.length > 0) {
      context.diagnostics.push(
        diagnostic('CCJS_DGRAM_SOCKET', `socket.${method} in the C backend does not take arguments`, expression.args[0]?.loc)
      )
    }

    return [emitStatusCheck(`${method === 'ref' ? 'ccjs_dgram_ref' : 'ccjs_dgram_unref'}(${socketName})`, context)]
  }

  return null
}

function emitDgramSendLines(socketName, args, context, dgramContext = null) {
  const callback = args.at(-1)?.type === 'ArrowFunctionExpression' ? args.at(-1) : null
  const callbackOffset = callback == null ? 0 : 1

  if (args.length - callbackOffset === 1) {
    const body = emitDgramBytesOperand(args[0], dgramContext, context)

    return [
      ...body.lines,
      ...emitDgramStatusCheck(`ccjs_dgram_send_connected(${socketName}, ${body.bytes}, ${body.length})`, context, dgramContext),
      ...emitDgramZeroArgCallbackLines(callback, context)
    ]
  }

  if (args.length < 3) {
    context.diagnostics.push(
      diagnostic(
        'CCJS_DGRAM_SOCKET',
        'socket.send in the C backend currently requires message, port and address arguments, or a connected socket message form',
        args[0]?.loc
      )
    )
    return []
  }

  const hasOffsetLength = args.length - callbackOffset >= 5
  const body = emitDgramBytesOperand(args[0], dgramContext, context)
  const portArg = hasOffsetLength ? args[3] : args[1]
  const hostArg = hasOffsetLength ? args[4] : args[2]

  if (hasOffsetLength) {
    context.diagnostics.push(
      diagnostic(
        'CCJS_DGRAM_SOCKET',
        'socket.send offset/length arguments are not supported by the current C backend slice yet',
        args[1]?.loc
      )
    )
  }

  const port = emitDgramPortExpression(portArg, dgramContext, context)
  const host = emitDgramHostExpression(hostArg, dgramContext, context)

  return [
    ...body.lines,
    ...port.lines,
    ...emitDgramStatusCheck(
      `ccjs_dgram_send(${socketName}, ${body.bytes}, ${body.length}, ${host}, (int)(${port.expression}))`,
      context,
      dgramContext
    ),
    ...emitDgramZeroArgCallbackLines(callback, context)
  ]
}

function emitDgramCloseLines(socketName, args, context) {
  if (args.length > 1) {
    context.diagnostics.push(
      diagnostic('CCJS_DGRAM_SOCKET', 'socket.close in the C backend supports only an optional callback', args[1]?.loc)
    )
  }

  return [`ccjs_dgram_close(${socketName});`, ...emitDgramZeroArgCallbackLines(args[0], context)]
}

function emitDgramMaybeRecvStartLines(socketName, context) {
  if (!context.dgramBoundSockets.has(socketName) || !context.dgramMessageSockets.has(socketName)) {
    return []
  }

  return [emitStatusCheck(`ccjs_dgram_recv_start(${socketName})`, context)]
}

function emitDgramStatusCheck(call, context, dgramContext) {
  if (dgramContext == null) {
    return [emitStatusCheck(call, context)]
  }

  const status = nextCName(context, 'ccjs_dgram_status')

  return ['{', `  ccjs_status ${status} = ${call};`, `  if (${status} != CCJS_OK) return ${status};`, '}']
}

function emitDgramBytesOperand(expression, dgramContext, context) {
  if (
    dgramContext?.messageName != null &&
    expression?.type === 'Reference' &&
    expression.path.length === 1 &&
    expression.path[0] === dgramContext.messageName
  ) {
    return {
      lines: [],
      bytes: 'ccjs_bytes',
      length: 'ccjs_len'
    }
  }

  const staticValue = emitDgramStaticStringValue(expression, dgramContext)

  if (staticValue != null) {
    return {
      lines: [],
      bytes: cStringLiteral(staticValue),
      length: `${utf8ByteLength(staticValue)}`
    }
  }

  return emitPreparedStringBytesOperand(expression, context, 'ccjs_dgram_string')
}

function emitDgramPortExpression(expression, dgramContext, context) {
  const rinfo = resolveDgramRinfoMember(expression, dgramContext)

  if (rinfo === 'port') {
    return {
      lines: [],
      expression: 'ccjs_port'
    }
  }

  const addressPort = emitPreparedDgramAddressPortExpression(expression, context)

  if (addressPort != null) {
    return addressPort
  }

  return emitPreparedNumberExpression(expression, context)
}

function emitDgramHostExpression(expression, dgramContext, context) {
  if (expression == null) {
    return '0'
  }

  const rinfo = resolveDgramRinfoMember(expression, dgramContext)

  if (rinfo === 'address') {
    return 'ccjs_host'
  }

  const addressMember = resolveDgramAddressStringMember(expression, context)

  if (addressMember != null) {
    return addressMember
  }

  if (expression.type === 'StringLiteral') {
    return cStringLiteral(expression.value)
  }

  if (expression.type === 'TemplateLiteral' && !expression.raw.includes('${')) {
    return cStringLiteral(expression.raw.slice(1, -1))
  }

  if (
    expression.type === 'Reference' &&
    expression.path.length === 1 &&
    context.variables.get(expression.path[0]) === 'string'
  ) {
    return emitReference(expression, context)
  }

  context.diagnostics.push(
    diagnostic(
      'CCJS_DGRAM_SOCKET',
      'socket host/address arguments in the C backend currently must be static strings or rinfo.address',
      expression.loc
    )
  )
  return '0'
}

function emitPreparedDgramAddressPortExpression(expression, context) {
  if (
    expression?.type !== 'MemberExpression' ||
    expression.property !== 'port' ||
    expression.object?.type !== 'Reference' ||
    expression.object.path.length !== 1 ||
    context.variables.get(expression.object.path[0]) !== 'dgram-address'
  ) {
    return null
  }

  return {
    lines: [],
    expression: expression.object.path[0] + '.port'
  }
}

function resolveDgramAddressStringMember(expression, context) {
  if (
    expression?.type !== 'MemberExpression' ||
    !['address', 'family'].includes(expression.property) ||
    expression.object?.type !== 'Reference' ||
    expression.object.path.length !== 1 ||
    context.variables.get(expression.object.path[0]) !== 'dgram-address'
  ) {
    return null
  }

  return expression.property === 'family' ? `${expression.object.path[0]}.family` : `${expression.object.path[0]}.address`
}

function resolveDgramRinfoMember(expression, dgramContext) {
  if (
    dgramContext?.rinfoName == null ||
    expression?.type !== 'MemberExpression' ||
    expression.object?.type !== 'Reference' ||
    expression.object.path.length !== 1 ||
    expression.object.path[0] !== dgramContext.rinfoName
  ) {
    return null
  }

  return ['address', 'family', 'port', 'size'].includes(expression.property) ? expression.property : null
}

function emitDgramStaticStringValue(expression, dgramContext) {
  if (expression?.type === 'StringLiteral') {
    return expression.value
  }

  if (expression?.type === 'TemplateLiteral' && !expression.raw.includes('${')) {
    return expression.raw.slice(1, -1)
  }

  if (expression?.type === 'Reference' && expression.path.length === 1) {
    return dgramContext?.stringLocals?.get(expression.path[0]) ?? null
  }

  return null
}

function emitDgramZeroArgCallbackLines(callback, context) {
  if (callback == null) {
    return []
  }

  if (callback.type !== 'ArrowFunctionExpression' || callback.params.length !== 0 || callback.async) {
    context.diagnostics.push(
      diagnostic(
        'CCJS_DGRAM_SOCKET',
        'dgram socket callbacks in the C backend currently require a synchronous zero-argument arrow function',
        callback.loc
      )
    )
    return []
  }

  const body = callback.expressionBody
    ? [
        {
          type: 'ExpressionStatement',
          expression: callback.body,
          loc: callback.loc
        }
      ]
    : callback.body

  return emitStatementList(body, context)
}

function isDgramSocketMethodCall(expression, method, context) {
  return isDgramSocketAnyMethodCall(expression, context) && expression.callee.property === method
}

function isDgramSocketAnyMethodCall(expression, context) {
  return (
    expression?.type === 'CallExpression' &&
    expression.callee?.type === 'MemberExpression' &&
    expression.callee.object?.type === 'Reference' &&
    expression.callee.object.path.length === 1 &&
    context.variables.get(expression.callee.object.path[0]) === 'dgram-socket'
  )
}

function isDgramAddressCall(expression, context) {
  return (
    expression?.type === 'CallExpression' &&
    expression.callee?.type === 'MemberExpression' &&
    (expression.callee.property === 'address' || expression.callee.property === 'remoteAddress') &&
    expression.callee.object?.type === 'Reference' &&
    expression.callee.object.path.length === 1 &&
    context.variables.get(expression.callee.object.path[0]) === 'dgram-socket'
  )
}

function isDgramCreateSocketCall(expression, context) {
  if (expression?.type !== 'CallExpression') {
    return false
  }

  if (
    expression.callee?.type === 'Reference' &&
    expression.callee.path.length === 1 &&
    context.dgramCreateSocketNames.has(expression.callee.path[0])
  ) {
    return true
  }

  return (
    expression.callee?.type === 'MemberExpression' &&
    expression.callee.property === 'createSocket' &&
    expression.callee.object?.type === 'Reference' &&
    expression.callee.object.path.length === 1 &&
    context.dgramImportNames.has(expression.callee.object.path[0])
  )
}

function emitDgramCreateSocketMessageListener(expression) {
  if (expression.args[0]?.type === 'ArrowFunctionExpression') {
    return expression.args[0]
  }

  if (expression.args[1]?.type === 'ArrowFunctionExpression') {
    return expression.args[1]
  }

  return null
}

function emitDgramSocketTypeDiagnostics(expression, context) {
  const typeValue =
    expression?.type === 'StringLiteral'
      ? expression.value
      : expression?.type === 'ObjectLiteral'
        ? staticObjectStringPropertyValue(expression, 'type')
        : null

  if (typeValue === 'udp4') {
    return
  }

  context.diagnostics.push(
    diagnostic(
      'CCJS_DGRAM_SOCKET',
      "dgram.createSocket in the C backend currently supports only the 'udp4' socket type",
      expression?.loc
    )
  )
}

function findObjectLiteralPropertyValue(expression, key) {
  return expression?.properties?.find((property) => property.key === key)?.value ?? null
}

function staticObjectStringPropertyValue(expression, key) {
  const value = findObjectLiteralPropertyValue(expression, key)

  if (value?.type === 'StringLiteral') {
    return value.value
  }

  if (value?.type === 'TemplateLiteral' && !value.raw.includes('${')) {
    return value.raw.slice(1, -1)
  }

  return null
}

function staticObjectBooleanPropertyValue(expression, key) {
  const value = findObjectLiteralPropertyValue(expression, key)

  if (value?.type === 'BooleanLiteral') {
    return value.value === true
  }

  return null
}

function emitHttpHandlerHead(wrapper) {
  return `static ccjs_status ${wrapper.name}(void* user, const ccjs_http_request* ccjs_request, ccjs_http_response* ccjs_response)`
}

function emitHttpHandlerDeclaration(wrapper, baseContext) {
  const expression = wrapper.expression
  const requestName = expression.params[0]?.name ?? null
  const responseName = expression.params[1]?.name ?? null
  const httpContext = {
    requestName,
    responseName,
    stringLocals: new Map()
  }
  const body = expression.expressionBody
    ? [
        {
          type: 'ExpressionStatement',
          expression: expression.body,
          loc: expression.loc
        }
      ]
    : expression.body
  const lines = [
    `${emitHttpHandlerHead(wrapper)} {`,
    '  (void)user;',
    requestName == null
      ? '  (void)ccjs_request;'
      : `  const ccjs_http_request* ${requestName} = ccjs_request;`,
    responseName == null
      ? '  (void)ccjs_response;'
      : `  ccjs_http_response* ${responseName} = ccjs_response;`
  ]

  for (const statement of body) {
    lines.push(...emitHttpHandlerStatement(statement, httpContext, baseContext).map((line) => `  ${line}`))
  }

  lines.push('  return CCJS_OK;')
  lines.push('}')

  return lines
}

function emitHttpHandlerStatement(statement, httpContext, context) {
  if (statement == null) {
    return []
  }

  if (statement.type === 'BlockStatement') {
    return [
      '{',
      ...statement.body.flatMap((item) => emitHttpHandlerStatement(item, httpContext, context)).map((line) => `  ${line}`),
      '}'
    ]
  }

  if (statement.type === 'IfStatement') {
    const condition = emitHttpConditionExpression(statement.condition, httpContext, context)
    const consequent = emitHttpHandlerStatement(statement.consequent, httpContext, context)
    const lines = [`if (${condition}) {`, ...consequent.map((line) => `  ${line}`)]

    if (statement.alternate == null) {
      lines.push('}')
      return lines
    }

    lines.push('} else {')
    lines.push(...emitHttpHandlerStatement(statement.alternate, httpContext, context).map((line) => `  ${line}`))
    lines.push('}')
    return lines
  }

  if (statement.type === 'VariableDeclaration') {
    const stringValue = emitHttpStaticStringValue(statement.init, httpContext, context)

    if (stringValue == null) {
      context.diagnostics.push(
        diagnostic(
          'CCJS_HTTP_HANDLER',
          'HTTP request listeners in the C backend currently support only static string local declarations',
          statement.loc
        )
      )
      return []
    }

    httpContext.stringLocals.set(statement.name, stringValue)
    return []
  }

  if (statement.type === 'ExpressionStatement') {
    if (statement.expression?.type === 'CallExpression') {
      const responseCall = emitHttpResponseCallStatement(statement.expression, httpContext, context)

      if (responseCall != null) {
        return responseCall
      }
    }

    if (statement.expression?.type === 'AssignmentExpression') {
      const statusAssignment = emitHttpResponseStatusAssignment(statement.expression, httpContext, context)

      if (statusAssignment != null) {
        return statusAssignment
      }
    }

    context.diagnostics.push(
      diagnostic(
        'CCJS_HTTP_HANDLER',
        'this HTTP request listener statement is not supported by the current C backend slice',
        statement.loc
      )
    )
    return []
  }

  if (statement.type === 'ReturnStatement') {
    if (statement.argument?.type === 'CallExpression') {
      const responseCall = emitHttpResponseCallStatement(statement.argument, httpContext, context)

      if (responseCall != null) {
        return [...responseCall, 'return CCJS_OK;']
      }
    }

    return ['return CCJS_OK;']
  }

  context.diagnostics.push(
    diagnostic(
      'CCJS_HTTP_HANDLER',
      'this HTTP request listener statement is not supported by the current C backend slice',
      statement.loc
    )
  )
  return []
}

function emitHttpResponseStatusAssignment(expression, httpContext, context) {
  if (
    expression.target?.type !== 'MemberExpression' ||
    expression.target.property !== 'statusCode' ||
    !isHttpResponseReference(expression.target.object, httpContext)
  ) {
    return null
  }

  const status = emitHttpStatusCodeExpression(expression.value, context)

  return emitHttpStatusCheck(`ccjs_http_response_set_status(${httpContext.responseName}, ${status})`, context)
}

function emitHttpResponseCallStatement(expression, httpContext, context) {
  if (
    expression.callee?.type !== 'MemberExpression' ||
    !isHttpResponseReference(expression.callee.object, httpContext)
  ) {
    return null
  }

  const method = expression.callee.property

  if (method === 'setHeader') {
    const name = emitHttpStringBytesOperand(expression.args[0], httpContext, context)
    const value = emitHttpStringBytesOperand(expression.args[1], httpContext, context)

    return [
      ...name.lines,
      ...value.lines,
      ...emitHttpStatusCheck(
        `ccjs_http_response_set_header(${httpContext.responseName}, ${name.bytes}, ${name.length}, ${value.bytes}, ${value.length})`,
        context
      )
    ]
  }

  if (method === 'writeHead') {
    const status = emitHttpStatusCodeExpression(expression.args[0], context)
    const headers = emitHttpHeaderArray(expression.args[1], context)

    return [
      ...headers.lines,
      ...emitHttpStatusCheck(
        `ccjs_http_response_write_head(${httpContext.responseName}, ${status}, ${headers.name}, ${headers.count})`,
        context
      )
    ]
  }

  if (method === 'write' || method === 'end') {
    const body = emitHttpStringBytesOperand(expression.args[0], httpContext, context)
    const runtime = method === 'write' ? 'ccjs_http_response_write' : 'ccjs_http_response_end'

    return [
      ...body.lines,
      ...emitHttpStatusCheck(`${runtime}(${httpContext.responseName}, ${body.bytes}, ${body.length})`, context)
    ]
  }

  return null
}

function emitHttpHeaderArray(expression, context) {
  if (expression == null) {
    return {
      lines: [],
      name: '0',
      count: '0'
    }
  }

  if (expression.type !== 'ObjectLiteral') {
    context.diagnostics.push(
      diagnostic(
        'CCJS_HTTP_HANDLER',
        'HTTP response headers in the C backend must be an object literal',
        expression.loc
      )
    )

    return {
      lines: [],
      name: '0',
      count: '0'
    }
  }

  if (expression.properties.length === 0) {
    return {
      lines: [],
      name: '0',
      count: '0'
    }
  }

  const name = nextCName(context, 'ccjs_http_headers')
  const lines = [`ccjs_http_header ${name}[] = {`]

  for (const property of expression.properties) {
    const value = emitHttpStaticStringValue(property.value, { stringLocals: new Map() }, context)

    if (value == null) {
      context.diagnostics.push(
        diagnostic(
          'CCJS_HTTP_HANDLER',
          'HTTP response header values in the C backend must be static strings',
          property.loc
        )
      )
      continue
    }

    lines.push(
      `  { ${cStringLiteral(property.key)}, ${utf8ByteLength(property.key)}, ${cStringLiteral(value)}, ${utf8ByteLength(value)} },`
    )
  }

  lines.push('};')

  return {
    lines,
    name,
    count: `${expression.properties.length}`
  }
}

function emitHttpConditionExpression(expression, httpContext, context) {
  if (expression?.type === 'BooleanLiteral') {
    return expression.value ? '1' : '0'
  }

  if (expression?.type === 'UnaryExpression' && expression.operator === '!') {
    return `!(${emitHttpConditionExpression(expression.argument, httpContext, context)})`
  }

  if (expression?.type === 'BinaryExpression') {
    if (expression.operator === '&&' || expression.operator === '||') {
      return `(${emitHttpConditionExpression(expression.left, httpContext, context)} ${expression.operator} ${emitHttpConditionExpression(expression.right, httpContext, context)})`
    }

    const requestCompare = emitHttpRequestStringCompareExpression(expression, httpContext, context)

    if (requestCompare != null) {
      return requestCompare
    }
  }

  context.diagnostics.push(
    diagnostic(
      'CCJS_HTTP_HANDLER',
      'HTTP request listener conditions in the C backend currently support req.method/req.url string comparisons',
      expression?.loc
    )
  )
  return '0'
}

function emitHttpRequestStringCompareExpression(expression, httpContext, context) {
  if (!['===', '==', '!==', '!='].includes(expression.operator)) {
    return null
  }

  const left = resolveHttpRequestStringMember(expression.left, httpContext)
  const right = resolveHttpRequestStringMember(expression.right, httpContext)
  const literal = emitHttpStaticStringValue(left == null ? expression.left : expression.right, httpContext, context)
  const member = left ?? right

  if (member == null || literal == null) {
    return null
  }

  const runtime =
    member === 'method'
      ? `ccjs_http_request_method_equals(${httpContext.requestName}, ${cStringLiteral(literal)}, ${utf8ByteLength(literal)})`
      : `ccjs_http_request_url_equals(${httpContext.requestName}, ${cStringLiteral(literal)}, ${utf8ByteLength(literal)})`

  return ['!==', '!='].includes(expression.operator) ? `!(${runtime})` : runtime
}

function emitHttpStringBytesOperand(expression, httpContext, context) {
  if (expression == null) {
    return {
      lines: [],
      bytes: '""',
      length: '0'
    }
  }

  const staticValue = emitHttpStaticStringValue(expression, httpContext, context)

  if (staticValue != null) {
    return {
      lines: [],
      bytes: cStringLiteral(staticValue),
      length: `${utf8ByteLength(staticValue)}`
    }
  }

  const requestMember = resolveHttpRequestStringMember(expression, httpContext)

  if (requestMember === 'method') {
    return {
      lines: [],
      bytes: `${httpContext.requestName}->method`,
      length: `${httpContext.requestName}->method_len`
    }
  }

  if (requestMember === 'url') {
    return {
      lines: [],
      bytes: `${httpContext.requestName}->url`,
      length: `${httpContext.requestName}->url_len`
    }
  }

  context.diagnostics.push(
    diagnostic(
      'CCJS_HTTP_HANDLER',
      'HTTP response body expressions in the C backend currently support static strings, JSON.stringify(object literals), req.method and req.url',
      expression.loc
    )
  )

  return {
    lines: [],
    bytes: '""',
    length: '0'
  }
}

function emitHttpStaticStringValue(expression, httpContext, context) {
  if (expression?.type === 'StringLiteral') {
    return expression.value
  }

  if (expression?.type === 'TemplateLiteral' && !expression.raw.includes('${')) {
    return expression.raw.slice(1, -1)
  }

  if (expression?.type === 'NumberLiteral') {
    return expression.value
  }

  if (expression?.type === 'BooleanLiteral') {
    return expression.value ? 'true' : 'false'
  }

  if (expression?.type === 'Reference' && expression.path.length === 1) {
    return httpContext.stringLocals?.get(expression.path[0]) ?? null
  }

  return emitHttpStaticJsonStringifyValue(expression, context)
}

function emitHttpStaticJsonStringifyValue(expression, context) {
  if (
    expression?.type !== 'CallExpression' ||
    cJsonRuntimeCallName(expression.callee) !== 'stringify' ||
    expression.args.length !== 1
  ) {
    return null
  }

  return emitHttpStaticJsonValue(expression.args[0], context)
}

function emitHttpStaticJsonValue(expression, context) {
  if (expression?.type === 'StringLiteral') {
    return JSON.stringify(expression.value)
  }

  if (expression?.type === 'TemplateLiteral' && !expression.raw.includes('${')) {
    return JSON.stringify(expression.raw.slice(1, -1))
  }

  if (expression?.type === 'NumberLiteral') {
    return expression.value
  }

  if (expression?.type === 'BooleanLiteral') {
    return expression.value ? 'true' : 'false'
  }

  if (expression?.type === 'NullLiteral') {
    return 'null'
  }

  if (expression?.type === 'ArrayLiteral') {
    const items = expression.elements.map((item) => emitHttpStaticJsonValue(item, context))

    if (items.some((item) => item == null)) {
      return null
    }

    return `[${items.join(',')}]`
  }

  if (expression?.type === 'ObjectLiteral') {
    const fields: string[] = []

    for (const property of expression.properties) {
      const value = emitHttpStaticJsonValue(property.value, context)

      if (value == null) {
        return null
      }

      fields.push(`${JSON.stringify(property.key)}:${value}`)
    }

    return `{${fields.join(',')}}`
  }

  return null
}

function emitHttpStatusCodeExpression(expression, context) {
  if (expression?.type === 'NumberLiteral') {
    return `(int)(${expression.value})`
  }

  context.diagnostics.push(
    diagnostic(
      'CCJS_HTTP_HANDLER',
      'HTTP status values in the C backend currently must be numeric literals',
      expression?.loc
    )
  )
  return '200'
}

function emitHttpStatusCheck(call, context) {
  const status = nextCName(context, 'ccjs_http_status')

  return ['{', `  ccjs_status ${status} = ${call};`, `  if (${status} != CCJS_OK) return ${status};`, '}']
}

function isHttpResponseReference(expression, httpContext) {
  return (
    httpContext.responseName != null &&
    expression?.type === 'Reference' &&
    expression.path.length === 1 &&
    expression.path[0] === httpContext.responseName
  )
}

function resolveHttpRequestStringMember(expression, httpContext) {
  if (
    httpContext.requestName == null ||
    expression?.type !== 'MemberExpression' ||
    expression.object?.type !== 'Reference' ||
    expression.object.path.length !== 1 ||
    expression.object.path[0] !== httpContext.requestName
  ) {
    return null
  }

  return expression.property === 'method' || expression.property === 'url' ? expression.property : null
}

function emitFunctionDeclaration(statement, baseContext) {
  const returnInfo = resolveCFunctionReturnInfo(statement, baseContext)
  const returnType = returnInfo.returnType
  const returnNullable = returnInfo.returnNullable
  const params = resolveFunctionDeclarationParams(statement.name, statement.params, baseContext)
  const context = createFunctionContext(baseContext, returnType, returnNullable)
  context.returnShape = context.functionReturnShapes.get(statement.name) ?? null
  context.throwingFunction = isThrowingFunctionName(statement.name, context)
  context.externalEventLoop = functionTakesEventLoopParam(statement.name, context)
  context.functionReturnOut = 'ccjs_out'
  context.functionErrorOut = 'ccjs_error_out'

  if (baseContext.asyncTaskWrappers.has(statement.name)) {
    return emitAsyncTaskFunctionStubDeclaration(statement, context)
  }

  if (context.throwingFunction) {
    registerErrorChannel(context)
  }

  registerFunctionParamsInContext(statement, params, context)

  const bodyLines: string[] = []

  bodyLines.push(...emitRuntimeParamPreludeForParams(statement, params, context).map((line) => `  ${line}`))

  bodyLines.push(...emitStatementList(statement.body, context).map((line) => `  ${line}`))

  const lines = [
    `${emitFunctionHead(statement, context)} {`,
    ...emitThrowingFunctionPrelude(context).map((line) => `  ${line}`),
    ...emitReturnValueDeclarations(context).map((line) => `  ${line}`),
    ...emitStatusResultDeclarations(context).map((line) => `  ${line}`),
    ...emitLoopFlowDeclarations(context).map((line) => `  ${line}`),
    ...emitReturnFlowDeclarations(context).map((line) => `  ${line}`),
    ...emitEventLoopDeclarations(context).map((line) => `  ${line}`),
    ...emitOwnedValueDeclarations(context).map((line) => `  ${line}`),
    ...emitOwnedPromiseDeclarations(context).map((line) => `  ${line}`),
    ...emitErrorChannelDeclarations(context).map((line) => `  ${line}`),
    ...emitBoxedValueDeclarations(context).map((line) => `  ${line}`),
    ...emitEventLoopInit(context).map((line) => `  ${line}`),
    ...bodyLines
  ]

  if (shouldEmitCleanupLabel(context)) {
    lines.push('ccjs_cleanup:')
    lines.push(...emitThrowingFunctionErrorTransfer(context).map((line) => `  ${line}`))
    lines.push(...emitOwnedValueCleanup(context).map((line) => `  ${line}`))
    lines.push(...emitOwnedPromiseCleanup(context).map((line) => `  ${line}`))
    lines.push(...emitEventLoopCleanup(context).map((line) => `  ${line}`))
    lines.push(...emitBoxedValueCleanup(context).map((line) => `  ${line}`))
    lines.push(...emitCleanupReturn(context).map((line) => `  ${line}`))
  } else if (context.returnType !== 'void') {
    lines.push(`  return ${context.returnType === 'string' ? '""' : '0'};`)
  }

  lines.push('}')

  return lines
}

function registerFunctionParamsInContext(statement, params, context) {
  for (const [index, param] of params.entries()) {
    if (isNullableScalarParam(param)) {
      context.variables.set(param.name, param.valueType)
      context.nullableVariables.add(param.name)
    } else if (
      isBoxedFunctionParam(param, index, statement, context) &&
      ['number', 'boolean', 'string', 'object'].includes(param.valueType)
    ) {
      context.variables.set(param.name, param.valueType)
      context.boxedVariables.add(param.name)
      registerBoxedValue(context, param.name, param.valueType)

      if (param.valueType === 'object') {
        registerObjectShape(context, param.name, param.shape)
      }
    } else if (param.valueType === 'string') {
      context.variables.set(param.name, 'string')
      context.runtimeStrings.add(param.name)
    } else if (param.valueType === 'object') {
      context.variables.set(param.name, 'object')
      registerObjectShape(context, param.name, param.shape)
    } else if (param.valueType === 'array') {
      context.variables.set(param.name, 'array')
      context.runtimeArrayElementTypes.set(param.name, param.arrayElementType ?? 'unknown')
    } else if (param.valueType === 'map') {
      context.variables.set(param.name, 'map')
      context.mapTypes.set(param.name, {
        key: param.mapKeyType ?? 'unknown',
        value: param.mapValueType ?? 'unknown'
      })
    } else if (param.valueType === 'set') {
      context.variables.set(param.name, 'set')
      context.setElementTypes.set(param.name, param.setElementType ?? 'unknown')
    } else if (param.valueType === 'promise') {
      context.variables.set(param.name, 'promise')
      context.promiseValueTypes.set(param.name, param.promiseValueType ?? 'unknown')
    } else if (param.valueType === 'function') {
      const runtimeFunctionType = resolveFunctionParameterRuntimeType(statement.name, index, param, context)

      context.variables.set(param.name, 'function')
      context.functionTypes.set(param.name, runtimeFunctionType ?? param.functionType)

      if (param.nullable === true) {
        context.nullableVariables.add(param.name)
      }

      if (runtimeFunctionType != null) {
        context.runtimeCallbacks.add(param.name)
      }
    } else {
      context.variables.set(param.name, param.valueType)
    }
  }
}

function emitAsyncTaskFunctionStubDeclaration(statement, context) {
  const returnLine =
    context.returnType === 'void'
      ? '  return;'
      : isManagedRuntimeReturnType(context.returnType)
        ? '  return ccjs_undefined_value();'
        : '  return 0;'

  return [`${emitFunctionHead(statement, context)} {`, returnLine, '}']
}

function emitFunctionHead(statement, context) {
  const name = context.functionNames.get(statement.name) ?? emitCFunctionName(statement.name)
  const returnInfo = resolveCFunctionReturnInfo(statement, context)
  const returnType = context.returnType ?? returnInfo.returnType
  const returnNullable = context.returnNullable ?? returnInfo.returnNullable
  const functionParams = resolveFunctionDeclarationParams(statement.name, statement.params, context)
  const params = functionParams.map((param, index) => {
    if (isNullableScalarParam(param)) {
      return `ccjs_value ${emitCScalarParamName(param.name)}`
    }

    if (param.valueType === 'string') {
      return `ccjs_value ${emitCStringParamName(param.name)}`
    }

    if (param.valueType === 'object') {
      if (isBoxedFunctionParam(param, index, statement, context)) {
        return `ccjs_value ${emitCObjectParamName(param.name)}`
      }

      return `ccjs_value ${param.name}`
    }

    if (param.valueType === 'array' || param.valueType === 'map' || param.valueType === 'set') {
      return `ccjs_value ${param.name}`
    }

    if (param.valueType === 'function') {
      if (resolveFunctionParameterRuntimeType(statement.name, index, param, context) != null) {
        return `ccjs_value ${param.name}`
      }

      return emitFunctionParameter(param.name, param.functionType, context, param.loc)
    }

    if (isBoxedFunctionParam(param, index, statement, context) && ['number', 'boolean'].includes(param.valueType)) {
      return `${emitCType(param.valueType)} ${emitCScalarParamName(param.name)}`
    }

    return `${emitCType(param.valueType)} ${param.name}`
  })

  if (functionTakesEventLoopParam(statement.name, context)) {
    params.unshift('ccjs_loop* ccjs_loop')
  }

  if (isThrowingFunctionName(statement.name, context)) {
    if (returnType !== 'void') {
      params.push(`${emitThrowingFunctionOutType(returnType, returnNullable)}* ccjs_out`)
    }

    params.push('ccjs_value* ccjs_error_out')

    return `ccjs_status ${name}(${params.length === 0 ? 'void' : params.join(', ')})`
  }

  return `${emitCReturnType(returnType, returnNullable)} ${name}(${params.length === 0 ? 'void' : params.join(', ')})`
}

function emitClassMethodDeclaration(info, method, baseContext) {
  const context = createFunctionContext(baseContext, method.returnType, method.returnNullable)
  const params = method.params

  context.returnShape = null
  context.functionReturnOut = 'ccjs_out'
  context.functionErrorOut = 'ccjs_error_out'
  context.variables.set('this', 'object')
  context.classInstanceTypes.set('this', info.name)
  registerClassObjectShape(context, 'this', info)
  registerFunctionParamsInContext(method, params, context)

  const bodyLines: string[] = []

  bodyLines.push(...emitRuntimeParamPreludeForParams(method, params, context).map((line) => `  ${line}`))
  bodyLines.push(...emitStatementList(method.body, context).map((line) => `  ${line}`))

  const lines = [
    `${emitClassMethodHead(info, method, context)} {`,
    ...emitReturnValueDeclarations(context).map((line) => `  ${line}`),
    ...emitStatusResultDeclarations(context).map((line) => `  ${line}`),
    ...emitLoopFlowDeclarations(context).map((line) => `  ${line}`),
    ...emitReturnFlowDeclarations(context).map((line) => `  ${line}`),
    ...emitOwnedValueDeclarations(context).map((line) => `  ${line}`),
    ...emitOwnedPromiseDeclarations(context).map((line) => `  ${line}`),
    ...emitErrorChannelDeclarations(context).map((line) => `  ${line}`),
    ...emitBoxedValueDeclarations(context).map((line) => `  ${line}`),
    ...bodyLines
  ]

  if (shouldEmitCleanupLabel(context)) {
    lines.push('ccjs_cleanup:')
    lines.push(...emitOwnedValueCleanup(context).map((line) => `  ${line}`))
    lines.push(...emitOwnedPromiseCleanup(context).map((line) => `  ${line}`))
    lines.push(...emitBoxedValueCleanup(context).map((line) => `  ${line}`))
    lines.push(...emitCleanupReturn(context).map((line) => `  ${line}`))
  } else if (context.returnType !== 'void') {
    lines.push(`  return ${context.returnType === 'string' ? 'ccjs_undefined_value()' : '0'};`)
  }

  lines.push('}')

  return lines
}

function emitClassMethodHead(info, method, context) {
  const params = [
    'ccjs_value this',
    ...method.params.map((param, index) => emitClassMethodParam(param, index, method, context))
  ]

  return `static ${emitCReturnType(method.returnType, method.returnNullable)} ${emitCClassMethodName(info.name, method.name)}(${params.join(', ')})`
}

function emitClassMethodParam(param, index, method, context) {
  if (isNullableScalarParam(param)) {
    return `ccjs_value ${emitCScalarParamName(param.name)}`
  }

  if (param.valueType === 'string') {
    return `ccjs_value ${emitCStringParamName(param.name)}`
  }

  if (param.valueType === 'object') {
    if (isBoxedFunctionParam(param, index, method, context)) {
      return `ccjs_value ${emitCObjectParamName(param.name)}`
    }

    return `ccjs_value ${param.name}`
  }

  if (param.valueType === 'array' || param.valueType === 'map' || param.valueType === 'set') {
    return `ccjs_value ${param.name}`
  }

  if (param.valueType === 'function') {
    if (resolveFunctionParameterRuntimeType(method.name, index, param, context) != null) {
      return `ccjs_value ${param.name}`
    }

    return emitFunctionParameter(param.name, param.functionType, context, param.loc)
  }

  if (isBoxedFunctionParam(param, index, method, context) && ['number', 'boolean'].includes(param.valueType)) {
    return `${emitCType(param.valueType)} ${emitCScalarParamName(param.name)}`
  }

  return `${emitCType(param.valueType)} ${param.name}`
}

function emitHttpServerVariableDeclaration(statement, context) {
  if (!isHttpCreateServerCall(statement.init, context)) {
    return null
  }

  context.variables.set(statement.name, 'http-server')
  registerEventLoop(context)

  return emitHttpServerCreateLines(statement.init, statement.name, context)
}

function emitHttpServerCallStatement(expression, context) {
  if (
    expression.callee?.type === 'MemberExpression' &&
    expression.callee.property === 'listen' &&
    isHttpCreateServerCall(expression.callee.object, context)
  ) {
    const serverName = nextCName(context, 'ccjs_http_server')
    registerEventLoop(context)

    return [
      `ccjs_http_server* ${serverName} = 0;`,
      ...emitHttpServerCreateLines(expression.callee.object, serverName, context, {
        declare: false
      }),
      ...emitHttpServerListenLines(serverName, expression.args, context)
    ]
  }

  if (isHttpServerMethodCall(expression, 'listen', context)) {
    const serverName = expression.callee.object.path[0]
    registerEventLoop(context)

    return emitHttpServerListenLines(serverName, expression.args, context)
  }

  if (isHttpServerMethodCall(expression, 'on', context)) {
    return emitHttpServerOnRequestLines(expression.callee.object.path[0], expression.args, context)
  }

  if (isHttpServerMethodCall(expression, 'close', context)) {
    return emitHttpServerCloseLines(expression.callee.object.path[0], expression.args, context)
  }

  return null
}

function emitHttpServerCreateLines(expression, serverName, context, options: { declare?: boolean } = {}) {
  const listener = expression.args[0]
  const wrapper = context.httpHandlers.get(listener)

  if (listener != null && (listener.type !== 'ArrowFunctionExpression' || wrapper == null)) {
    context.diagnostics.push(
      diagnostic(
        'CCJS_HTTP_SERVER',
        'http.createServer in the C backend currently requires an inline request listener',
        expression.loc
      )
    )
  }

  const lines = options.declare === false ? [] : [`ccjs_http_server* ${serverName} = 0;`]

  lines.push(emitStatusCheck(`ccjs_http_server_new(${emitEventLoopReference(context)}, ${wrapper?.name ?? '0'}, 0, &${serverName})`, context))

  return lines
}

function emitHttpServerListenLines(serverName, args, context) {
  if (args.length < 1) {
    context.diagnostics.push(
      diagnostic('CCJS_HTTP_SERVER', 'server.listen in the C backend currently requires a port argument')
    )

    return []
  }

  const hostArg = args[1]?.type === 'ArrowFunctionExpression' ? null : args[1]
  const callback = args[1]?.type === 'ArrowFunctionExpression' ? args[1] : args[2]

  if (args.length > 3) {
    context.diagnostics.push(
      diagnostic(
        'CCJS_HTTP_SERVER',
        'server.listen in the C backend currently supports port, optional host and optional callback',
        args[3]?.loc
      )
    )
  }

  const port = emitPreparedNumberExpression(args[0], context)
  const host = emitHttpListenHostExpression(hostArg, context)

  return [
    ...port.lines,
    emitStatusCheck(`ccjs_http_server_listen(${serverName}, ${host}, (int)(${port.expression}), 128)`, context),
    ...emitHttpZeroArgCallbackLines(callback, context)
  ]
}

function emitHttpServerOnRequestLines(serverName, args, context) {
  if (args[0]?.type !== 'StringLiteral' || args[0].value !== 'request') {
    context.diagnostics.push(
      diagnostic(
        'CCJS_HTTP_SERVER',
        "server.on in the C backend currently supports only the 'request' event",
        args[0]?.loc
      )
    )
    return []
  }

  const listener = args[1]
  const wrapper = context.httpHandlers.get(listener)

  if (listener?.type !== 'ArrowFunctionExpression' || wrapper == null) {
    context.diagnostics.push(
      diagnostic(
        'CCJS_HTTP_SERVER',
        "server.on('request') in the C backend currently requires an inline request listener",
        listener?.loc
      )
    )
    return []
  }

  return [emitStatusCheck(`ccjs_http_server_on_request(${serverName}, ${wrapper.name}, 0)`, context)]
}

function emitHttpServerCloseLines(serverName, args, context) {
  if (args.length > 1) {
    context.diagnostics.push(
      diagnostic('CCJS_HTTP_SERVER', 'server.close in the C backend supports only an optional callback', args[1]?.loc)
    )
  }

  return [`ccjs_http_server_close(${serverName});`, ...emitHttpZeroArgCallbackLines(args[0], context)]
}

function emitHttpZeroArgCallbackLines(callback, context) {
  if (callback == null) {
    return []
  }

  if (callback.type !== 'ArrowFunctionExpression' || callback.params.length !== 0 || callback.async) {
    context.diagnostics.push(
      diagnostic(
        'CCJS_HTTP_SERVER',
        'HTTP server lifecycle callbacks in the C backend currently require a synchronous zero-argument arrow function',
        callback.loc
      )
    )
    return []
  }

  const body = callback.expressionBody
    ? [
        {
          type: 'ExpressionStatement',
          expression: callback.body,
          loc: callback.loc
        }
      ]
    : callback.body

  return emitStatementList(body, context)
}

function emitHttpListenHostExpression(expression, context) {
  if (expression == null) {
    return '0'
  }

  if (expression.type === 'StringLiteral') {
    return cStringLiteral(expression.value)
  }

  if (expression.type === 'TemplateLiteral' && !expression.raw.includes('${')) {
    return cStringLiteral(expression.raw.slice(1, -1))
  }

  context.diagnostics.push(
    diagnostic(
      'CCJS_HTTP_SERVER',
      'server.listen host in the C backend currently must be a string literal',
      expression.loc
    )
  )
  return '0'
}

function isHttpServerMethodCall(expression, method, context) {
  return (
    expression?.type === 'CallExpression' &&
    expression.callee?.type === 'MemberExpression' &&
    expression.callee.property === method &&
    expression.callee.object?.type === 'Reference' &&
    expression.callee.object.path.length === 1 &&
    context.variables.get(expression.callee.object.path[0]) === 'http-server'
  )
}

function isHttpCreateServerCall(expression, context) {
  if (expression?.type !== 'CallExpression') {
    return false
  }

  if (
    expression.callee?.type === 'Reference' &&
    expression.callee.path.length === 1 &&
    context.httpCreateServerNames.has(expression.callee.path[0])
  ) {
    return true
  }

  return (
    expression.callee?.type === 'MemberExpression' &&
    expression.callee.property === 'createServer' &&
    expression.callee.object?.type === 'Reference' &&
    expression.callee.object.path.length === 1 &&
    context.httpImportNames.has(expression.callee.object.path[0])
  )
}

function isHttpRequestEventCall(expression) {
  return (
    expression?.type === 'CallExpression' &&
    expression.callee?.type === 'MemberExpression' &&
    expression.callee.property === 'on' &&
    expression.args[0]?.type === 'StringLiteral' &&
    expression.args[0].value === 'request'
  )
}

function emitNetHandlerHead(wrapper) {
  if (wrapper.kind === 'connection') {
    return `static ccjs_status ${wrapper.name}(void* user, ccjs_net_server* ccjs_server, ccjs_net_socket* ccjs_socket)`
  }

  if (wrapper.kind === 'socket-data') {
    return `static ccjs_status ${wrapper.name}(void* user, ccjs_net_socket* ccjs_socket, const char* ccjs_bytes, size_t ccjs_len)`
  }

  if (wrapper.kind === 'socket-write') {
    return `static ccjs_status ${wrapper.name}(void* user, ccjs_net_socket* ccjs_socket, ccjs_status ccjs_write_status)`
  }

  if (wrapper.kind === 'socket-event') {
    return `static ccjs_status ${wrapper.name}(void* user, ccjs_net_socket* ccjs_socket)`
  }

  if (wrapper.kind === 'socket-error') {
    return `static ccjs_status ${wrapper.name}(void* user, ccjs_net_socket* ccjs_socket, ccjs_status ccjs_error_status)`
  }

  if (wrapper.kind === 'error') {
    return `static ccjs_status ${wrapper.name}(void* user, ccjs_net_server* ccjs_server, ccjs_status ccjs_error_status)`
  }

  return `static ccjs_status ${wrapper.name}(void* user, ccjs_net_server* ccjs_server)`
}

function emitNetHandlerDeclaration(wrapper, baseContext) {
  const expression = wrapper.expression
  const isSocketHandler = wrapper.kind === 'connection' || wrapper.kind.startsWith('socket-')
  const socketName = wrapper.kind === 'connection' ? expression.params[0]?.name ?? null : null
  const dataName = wrapper.kind === 'socket-data' ? expression.params[0]?.name ?? null : null
  const netContext = {
    kind: wrapper.kind,
    dataName,
    socketName,
    stringLocals: new Map()
  }
  const context = createFunctionContext(baseContext, 'void')
  context.statusReturn = true

  if (socketName != null) {
    context.variables.set(socketName, 'net-socket')
  }

  if (dataName != null) {
    context.variables.set(dataName, 'string')
  }

  const body = expression.expressionBody
    ? [
        {
          type: 'ExpressionStatement',
          expression: expression.body,
          loc: expression.loc
        }
      ]
    : expression.body
  const lines = [
    `${emitNetHandlerHead(wrapper)} {`,
    '  (void)user;',
    ...(wrapper.kind === 'connection' || wrapper.kind === 'event' || wrapper.kind === 'error'
      ? ['  (void)ccjs_server;']
      : []),
    ...(isSocketHandler && socketName == null ? ['  (void)ccjs_socket;'] : []),
    ...(wrapper.kind === 'socket-data' && dataName == null ? ['  (void)ccjs_bytes;', '  (void)ccjs_len;'] : []),
    ...(wrapper.kind === 'error' || wrapper.kind === 'socket-error' ? ['  (void)ccjs_error_status;'] : []),
    ...(wrapper.kind === 'socket-write' ? ['  (void)ccjs_write_status;'] : [])
  ]

  for (const statement of body) {
    lines.push(...emitNetHandlerStatement(statement, netContext, context).map((line) => `  ${line}`))
  }

  lines.push('  return CCJS_OK;')
  lines.push('}')

  return lines
}

function emitNetHandlerStatement(statement, netContext, context) {
  if (statement == null) {
    return []
  }

  if (statement.type === 'BlockStatement') {
    return [
      '{',
      ...statement.body.flatMap((item) => emitNetHandlerStatement(item, netContext, context)).map((line) => `  ${line}`),
      '}'
    ]
  }

  if (statement.type === 'VariableDeclaration') {
    const stringValue = emitNetStaticStringValue(statement.init, netContext)

    if (stringValue == null) {
      context.diagnostics.push(
        diagnostic(
          'CCJS_NET_HANDLER',
          'net event listeners in the C backend currently support only static string local declarations',
          statement.loc
        )
      )
      return []
    }

    netContext.stringLocals.set(statement.name, stringValue)
    return []
  }

  if (statement.type === 'ExpressionStatement' && statement.expression?.type === 'CallExpression') {
    const logStatement = emitNetHandlerConsoleLogStatement(statement.expression, netContext, context)

    if (logStatement != null) {
      return logStatement
    }

    const socketCall = emitNetHandlerSocketCallStatement(statement.expression, netContext, context)

    if (socketCall != null) {
      return socketCall
    }

    const serverCall = emitNetHandlerServerCallStatement(statement.expression, context)

    if (serverCall != null) {
      return serverCall
    }

  }

  if (statement.type === 'ReturnStatement') {
    if (statement.argument?.type === 'CallExpression') {
      const socketCall = emitNetHandlerSocketCallStatement(statement.argument, netContext, context)

      if (socketCall != null) {
        return [...socketCall, 'return CCJS_OK;']
      }
    }

    return ['return CCJS_OK;']
  }

  context.diagnostics.push(
    diagnostic(
      'CCJS_NET_HANDLER',
      'this net event listener statement is not supported by the current C backend slice',
      statement.loc
    )
  )
  return []
}

function emitNetHandlerSocketCallStatement(expression, netContext, context) {
  if (
    expression.callee?.type !== 'MemberExpression' ||
    expression.callee.object?.type !== 'Reference' ||
    expression.callee.object.path.length !== 1
  ) {
    return null
  }

  if (
    netContext.socketName != null &&
    expression.callee.object.path[0] !== netContext.socketName &&
    !String(netContext.kind).startsWith('socket-')
  ) {
    return null
  }

  const method = expression.callee.property

  if (method === 'write' || method === 'end') {
    const callback = expression.args.at(-1)?.type === 'ArrowFunctionExpression' ? expression.args.at(-1) : null
    const bodyArg = callback != null && expression.args.length === 1 ? null : expression.args[0]
    const body = emitNetBytesOperand(bodyArg, netContext, context)
    const wrapper = findNetHandler(context, callback, 'socket-write')
    const runtime =
      method === 'write'
        ? wrapper == null
          ? 'ccjs_net_socket_write'
          : 'ccjs_net_socket_write_with_callback'
        : wrapper == null
          ? 'ccjs_net_socket_end'
          : 'ccjs_net_socket_end_with_callback'
    const callbackArgs = wrapper == null ? '' : `, ${wrapper.name}, 0`

    return [
      ...body.lines,
      ...emitNetStatusCheck(`${runtime}(ccjs_socket, ${body.bytes}, ${body.length}${callbackArgs})`, context)
    ]
  }

  if (method === 'destroy') {
    return emitNetStatusCheck('ccjs_net_socket_destroy(ccjs_socket)', context)
  }

  if (method === 'close') {
    return ['ccjs_net_socket_close(ccjs_socket);']
  }

  context.diagnostics.push(
    diagnostic(
      'CCJS_NET_HANDLER',
      `socket.${method} is not supported inside net connection listeners by the current C backend slice`,
      expression.callee.loc ?? expression.loc
    )
  )
  return []
}

function emitNetHandlerConsoleLogStatement(expression, netContext, context) {
  if (!isConsoleLog(expression)) {
    return null
  }

  const stream = expression.callee.property === 'warn' || expression.callee.property === 'error'
    ? 'CCJS_CONSOLE_STDERR'
    : 'CCJS_CONSOLE_STDOUT'

  if (
    expression.args.length === 1 &&
    netContext.dataName != null &&
    expression.args[0]?.type === 'Reference' &&
    expression.args[0].path.length === 1 &&
    expression.args[0].path[0] === netContext.dataName
  ) {
    return stream === 'CCJS_CONSOLE_STDOUT'
      ? ['printf("%.*s\\n", (int)ccjs_len, ccjs_bytes);']
      : [`if (ccjs_console_printf(${stream}, "%.*s\\n", (int)ccjs_len, ccjs_bytes) < 0) return CCJS_ERR_TYPE;`]
  }

  return emitConsoleLogStatement(expression.callee.property, expression.args, context)
}

function emitNetHandlerServerCallStatement(expression, context) {
  if (
    expression.callee?.type !== 'MemberExpression' ||
    expression.callee.object?.type !== 'Reference' ||
    expression.callee.object.path.length !== 1
  ) {
    return null
  }

  if (expression.callee.property !== 'close') {
    return null
  }

  return ['ccjs_net_server_close(ccjs_server);']
}

function emitNetSocketVariableDeclaration(statement, context) {
  if (!isNetConnectCall(statement.init, context)) {
    return null
  }

  context.variables.set(statement.name, 'net-socket')
  registerEventLoop(context)

  return emitNetSocketConnectLines(statement.init, statement.name, context)
}

function emitNetServerVariableDeclaration(statement, context) {
  if (!isNetCreateServerCall(statement.init, context)) {
    return null
  }

  context.variables.set(statement.name, 'net-server')
  registerEventLoop(context)

  return emitNetServerCreateLines(statement.init, statement.name, context)
}

function emitNetAddressVariableDeclaration(statement, context) {
  if (!isNetAddressCall(statement.init, context)) {
    return null
  }

  const receiverName = statement.init.callee.object.path[0]
  const runtime =
    context.variables.get(receiverName) === 'net-socket' ? 'ccjs_net_socket_address' : 'ccjs_net_server_address'
  context.variables.set(statement.name, 'net-address')

  return [
    `ccjs_net_address ${statement.name};`,
    emitStatusCheck(`${runtime}(${receiverName}, &${statement.name})`, context)
  ]
}

function emitNetAddressMemberVariableDeclaration(statement, context) {
  const member = resolveNetSocketAddressMember(statement.init, context)

  if (member == null) {
    return null
  }

  if (member.valueType === 'string') {
    context.variables.set(statement.name, 'string')

    return [
      `ccjs_net_address ${member.tempName};`,
      emitStatusCheck(`${member.runtime}(${member.socketName}, &${member.tempName})`, context),
      `const char *${statement.name} = ${member.tempName}.${member.field};`
    ]
  }

  context.variables.set(statement.name, 'number')

  return [
    `double ${statement.name} = 0;`,
    '{',
    `  ccjs_net_address ${member.tempName};`,
    `  ${emitStatusCheck(`${member.runtime}(${member.socketName}, &${member.tempName})`, context)}`,
    `  ${statement.name} = (double)${member.tempName}.${member.field};`,
    '}'
  ]
}

function emitNetNumberVariableDeclaration(statement, context) {
  const counter = resolveNetSocketCounterMember(statement.init, context)

  if (counter == null) {
    return null
  }

  context.variables.set(statement.name, 'number')

  return [
    `double ${statement.name} = 0;`,
    '{',
    `  size_t ccjs_net_counter = 0;`,
    `  ${emitStatusCheck(`${counter.runtime}(${counter.socketName}, &ccjs_net_counter)`, context)}`,
    `  ${statement.name} = (double)ccjs_net_counter;`,
    '}'
  ]
}

function emitNetSocketCallStatement(expression, context) {
  if (isNetSocketMethodCall(expression, 'on', context)) {
    return emitNetSocketOnLines(expression.callee.object.path[0], expression.args, context)
  }

  if (isNetSocketMethodCall(expression, 'write', context)) {
    return emitNetSocketWriteLines(expression.callee.object.path[0], 'write', expression.args, context)
  }

  if (isNetSocketMethodCall(expression, 'end', context)) {
    return emitNetSocketWriteLines(expression.callee.object.path[0], 'end', expression.args, context)
  }

  if (isNetSocketMethodCall(expression, 'destroy', context)) {
    return [emitStatusCheck(`ccjs_net_socket_destroy(${expression.callee.object.path[0]})`, context)]
  }

  if (isNetSocketMethodCall(expression, 'close', context)) {
    return [`ccjs_net_socket_close(${expression.callee.object.path[0]});`]
  }

  if (isNetSocketMethodCall(expression, 'setEncoding', context)) {
    return emitNetSocketSetEncodingLines(expression.callee.object.path[0], expression.args, context)
  }

  const optionCall = emitNetSocketOptionCallStatement(expression, context)

  if (optionCall != null) {
    return optionCall
  }

  if (isNetSocketAnyMethodCall(expression, context)) {
    context.diagnostics.push(
      diagnostic(
        'CCJS_NET_SOCKET',
        `socket.${expression.callee.property} is not supported by the current C net backend slice`,
        expression.callee.loc ?? expression.loc
      )
    )
    return []
  }

  return null
}

function emitNetServerCallStatement(expression, context) {
  if (
    expression.callee?.type === 'MemberExpression' &&
    expression.callee.property === 'listen' &&
    isNetCreateServerCall(expression.callee.object, context)
  ) {
    const serverName = nextCName(context, 'ccjs_net_server')
    registerEventLoop(context)

    return [
      `ccjs_net_server* ${serverName} = 0;`,
      ...emitNetServerCreateLines(expression.callee.object, serverName, context, {
        declare: false
      }),
      ...emitNetServerListenLines(serverName, expression.args, context)
    ]
  }

  if (isNetServerMethodCall(expression, 'listen', context)) {
    const serverName = expression.callee.object.path[0]
    registerEventLoop(context)

    return emitNetServerListenLines(serverName, expression.args, context)
  }

  if (isNetServerMethodCall(expression, 'on', context)) {
    return emitNetServerOnLines(expression.callee.object.path[0], expression.args, context)
  }

  if (isNetServerMethodCall(expression, 'close', context)) {
    return emitNetServerCloseLines(expression.callee.object.path[0], expression.args, context)
  }

  if (isNetServerAnyMethodCall(expression, context)) {
    context.diagnostics.push(
      diagnostic(
        'CCJS_NET_SERVER',
        `server.${expression.callee.property} is not supported by the current C net backend slice`,
        expression.callee.loc ?? expression.loc
      )
    )
    return []
  }

  return null
}

function emitNetSocketConnectLines(expression, socketName, context, options: { declare?: boolean } = {}) {
  const optionsArg = expression.args[0]?.type === 'ObjectLiteral' ? expression.args[0] : null
  const callback = emitNetConnectCallback(expression)
  const portArg = optionsArg == null ? expression.args[0] : findObjectLiteralPropertyValue(optionsArg, 'port')
  const hostArg =
    optionsArg == null
      ? expression.args[1]?.type === 'ArrowFunctionExpression'
        ? null
        : expression.args[1]
      : findObjectLiteralPropertyValue(optionsArg, 'host')
  const wrapper = findNetHandler(context, callback, 'socket-event')

  if (portArg == null) {
    context.diagnostics.push(
      diagnostic('CCJS_NET_SOCKET', 'net.connect in the C backend currently requires a port argument', expression.loc)
    )
  }

  if (callback != null && (callback.type !== 'ArrowFunctionExpression' || wrapper == null)) {
    context.diagnostics.push(
      diagnostic(
        'CCJS_NET_SOCKET',
        'net.connect callback in the C backend currently requires an inline listener',
        callback.loc ?? expression.loc
      )
    )
  }

  const port = portArg == null ? { lines: [], expression: '0' } : emitPreparedNumberExpression(portArg, context)
  const host = emitNetConnectHostExpression(hostArg, context)
  const lines = options.declare === false ? [] : [`ccjs_net_socket* ${socketName} = 0;`]

  lines.push(
    ...port.lines,
    emitStatusCheck(`ccjs_net_connect(${emitEventLoopReference(context)}, ${host}, (int)(${port.expression}), 0, 0, 0, 0, &${socketName})`, context)
  )

  if (wrapper != null) {
    lines.push(emitStatusCheck(`ccjs_net_socket_on_connect(${socketName}, ${wrapper.name}, 0)`, context))
  }

  return lines
}

function emitNetSocketOnLines(socketName, args, context) {
  const eventName = args[0]?.type === 'StringLiteral' ? args[0].value : null
  const kind =
    eventName === 'data'
      ? 'socket-data'
      : ['connect', 'ready', 'end', 'close', 'drain'].includes(eventName ?? '')
        ? 'socket-event'
        : eventName === 'error'
          ? 'socket-error'
          : null

  if (kind == null) {
    context.diagnostics.push(
      diagnostic(
        'CCJS_NET_SOCKET',
        "socket.on in the C backend currently supports 'connect', 'ready', 'data', 'end', 'close', 'error' and 'drain'",
        args[0]?.loc
      )
    )
    return []
  }

  const listener = args[1]
  const wrapper = findNetHandler(context, listener, kind)

  if (listener?.type !== 'ArrowFunctionExpression' || wrapper == null) {
    context.diagnostics.push(
      diagnostic(
        'CCJS_NET_SOCKET',
        `socket.on('${eventName}') in the C backend currently requires an inline listener`,
        listener?.loc
      )
    )
    return []
  }

  const runtime =
    eventName === 'connect'
      ? 'ccjs_net_socket_on_connect'
      : eventName === 'ready'
        ? 'ccjs_net_socket_on_ready'
        : eventName === 'data'
          ? 'ccjs_net_socket_on_data'
          : eventName === 'end'
            ? 'ccjs_net_socket_on_end'
            : eventName === 'close'
              ? 'ccjs_net_socket_on_close'
              : eventName === 'error'
                ? 'ccjs_net_socket_on_error'
                : 'ccjs_net_socket_on_drain'
  const lines = [emitStatusCheck(`${runtime}(${socketName}, ${wrapper.name}, 0)`, context)]

  if (eventName === 'data' || eventName === 'end') {
    lines.push(...emitNetMaybeReadStartLines(socketName, context))
  }

  return lines
}

function emitNetSocketWriteLines(socketName, method, args, context) {
  const callback = args.at(-1)?.type === 'ArrowFunctionExpression' ? args.at(-1) : null
  const bodyArg = callback != null && args.length === 1 ? null : args[0]
  const body = emitNetBytesOperand(bodyArg, null, context)
  const wrapper = findNetHandler(context, callback, 'socket-write')
  const runtime =
    method === 'write'
      ? wrapper == null
        ? 'ccjs_net_socket_write'
        : 'ccjs_net_socket_write_with_callback'
      : wrapper == null
        ? 'ccjs_net_socket_end'
        : 'ccjs_net_socket_end_with_callback'
  const callbackArgs = wrapper == null ? '' : `, ${wrapper.name}, 0`

  if (callback != null && wrapper == null) {
    context.diagnostics.push(
      diagnostic(
        'CCJS_NET_SOCKET',
        `socket.${method} callback in the C backend currently requires an inline listener`,
        callback.loc
      )
    )
  }

  return [
    ...body.lines,
    emitStatusCheck(`${runtime}(${socketName}, ${body.bytes}, ${body.length}${callbackArgs})`, context)
  ]
}

function emitNetSocketSetEncodingLines(socketName, args, context) {
  const value = emitNetStaticStringValue(args[0], null)

  if (value == null) {
    context.diagnostics.push(
      diagnostic('CCJS_NET_SOCKET', 'socket.setEncoding in the C backend currently requires a static string', args[0]?.loc)
    )
    return []
  }

  return [emitStatusCheck(`ccjs_net_socket_set_encoding(${socketName}, ${cStringLiteral(value)}, ${utf8ByteLength(value)})`, context)]
}

function emitNetSocketOptionCallStatement(expression, context) {
  if (!isNetSocketAnyMethodCall(expression, context)) {
    return null
  }

  const socketName = expression.callee.object.path[0]
  const method = expression.callee.property

  if (method === 'setNoDelay') {
    const enabled =
      expression.args[0] == null
        ? { lines: [], expression: '1' }
        : emitPreparedNumberExpression(expression.args[0], context)

    return [
      ...enabled.lines,
      emitStatusCheck(`ccjs_net_socket_set_no_delay(${socketName}, ${enabled.expression} ? 1 : 0)`, context)
    ]
  }

  if (method === 'setKeepAlive') {
    const enabled =
      expression.args[0] == null
        ? { lines: [], expression: '0' }
        : emitPreparedNumberExpression(expression.args[0], context)
    const delay =
      expression.args[1] == null
        ? { lines: [], expression: '0' }
        : emitPreparedNumberExpression(expression.args[1], context)

    return [
      ...enabled.lines,
      ...delay.lines,
      emitStatusCheck(
        `ccjs_net_socket_set_keep_alive(${socketName}, ${enabled.expression} ? 1 : 0, (unsigned int)(${delay.expression}))`,
        context
      )
    ]
  }

  if (method === 'ref' || method === 'unref') {
    if (expression.args.length > 0) {
      context.diagnostics.push(
        diagnostic('CCJS_NET_SOCKET', `socket.${method} in the C backend does not take arguments`, expression.args[0]?.loc)
      )
    }

    return [emitStatusCheck(`${method === 'ref' ? 'ccjs_net_socket_ref' : 'ccjs_net_socket_unref'}(${socketName})`, context)]
  }

  if (method === 'setTimeout') {
    context.diagnostics.push(
      diagnostic(
        'CCJS_NET_SOCKET',
        'socket.setTimeout is not supported by the current C net backend slice yet',
        expression.callee.loc ?? expression.loc
      )
    )
    return []
  }

  return null
}

function emitNetMaybeReadStartLines(socketName, context) {
  if (context.netReadingSockets.has(socketName)) {
    return []
  }

  context.netReadingSockets.add(socketName)
  return [emitStatusCheck(`ccjs_net_socket_read_start(${socketName})`, context)]
}

function emitNetServerCreateLines(expression, serverName, context, options: { declare?: boolean } = {}) {
  const listener = emitNetCreateServerConnectionListener(expression)
  const wrapper = findNetHandler(context, listener, 'connection')

  if (listener != null && (listener.type !== 'ArrowFunctionExpression' || wrapper == null)) {
    context.diagnostics.push(
      diagnostic(
        'CCJS_NET_SERVER',
        'net.createServer in the C backend currently requires an inline connection listener',
        listener.loc ?? expression.loc
      )
    )
  }

  const lines = options.declare === false ? [] : [`ccjs_net_server* ${serverName} = 0;`]

  lines.push(
    emitStatusCheck(
      `ccjs_net_server_new(${emitEventLoopReference(context)}, ${wrapper?.name ?? '0'}, 0, &${serverName})`,
      context
    )
  )

  return lines
}

function emitNetServerListenLines(serverName, args, context) {
  const options = args[0]?.type === 'ObjectLiteral' ? args[0] : null
  const callback = emitNetListenCallback(args, options)
  const portArg = options == null ? emitNetListenPortArg(args) : findObjectLiteralPropertyValue(options, 'port')
  const hostArg = options == null ? emitNetListenHostArg(args) : findObjectLiteralPropertyValue(options, 'host')
  const backlogArg = options == null ? emitNetListenBacklogArg(args) : findObjectLiteralPropertyValue(options, 'backlog')

  if (options != null && findObjectLiteralPropertyValue(options, 'exclusive') != null) {
    context.diagnostics.push(
      diagnostic(
        'CCJS_NET_SERVER',
        'server.listen exclusive options are not supported by the current C net backend slice',
        options.loc
      )
    )
  }

  const port = portArg == null ? { lines: [], expression: '0' } : emitPreparedNumberExpression(portArg, context)
  const host = emitNetListenHostExpression(hostArg, context)
  const backlog = backlogArg == null ? { lines: [], expression: '128' } : emitPreparedNumberExpression(backlogArg, context)

  return [
    ...port.lines,
    ...backlog.lines,
    emitStatusCheck(`ccjs_net_server_listen(${serverName}, ${host}, (int)(${port.expression}), (int)(${backlog.expression}))`, context),
    ...emitNetZeroArgCallbackLines(callback, context)
  ]
}

function emitNetServerOnLines(serverName, args, context) {
  const eventName = args[0]?.type === 'StringLiteral' ? args[0].value : null
  const kind =
    eventName === 'connection'
      ? 'connection'
      : eventName === 'listening' || eventName === 'close'
        ? 'event'
        : eventName === 'error'
          ? 'error'
          : null

  if (kind == null) {
    context.diagnostics.push(
      diagnostic(
        'CCJS_NET_SERVER',
        "server.on in the C backend currently supports 'connection', 'listening', 'close' and 'error'",
        args[0]?.loc
      )
    )
    return []
  }

  const listener = args[1]
  const wrapper = findNetHandler(context, listener, kind)

  if (listener?.type !== 'ArrowFunctionExpression' || wrapper == null) {
    context.diagnostics.push(
      diagnostic(
        'CCJS_NET_SERVER',
        `server.on('${eventName}') in the C backend currently requires an inline listener`,
        listener?.loc
      )
    )
    return []
  }

  const runtime =
    eventName === 'connection'
      ? 'ccjs_net_server_on_connection'
      : eventName === 'listening'
        ? 'ccjs_net_server_on_listening'
        : eventName === 'close'
          ? 'ccjs_net_server_on_close'
          : 'ccjs_net_server_on_error'

  return [emitStatusCheck(`${runtime}(${serverName}, ${wrapper.name}, 0)`, context)]
}

function emitNetServerCloseLines(serverName, args, context) {
  if (args.length > 1) {
    context.diagnostics.push(
      diagnostic('CCJS_NET_SERVER', 'server.close in the C backend supports only an optional callback', args[1]?.loc)
    )
  }

  return [`ccjs_net_server_close(${serverName});`, ...emitNetZeroArgCallbackLines(args[0], context)]
}

function emitNetZeroArgCallbackLines(callback, context) {
  if (callback == null) {
    return []
  }

  if (callback.type !== 'ArrowFunctionExpression' || callback.params.length !== 0 || callback.async) {
    context.diagnostics.push(
      diagnostic(
        'CCJS_NET_SERVER',
        'net server lifecycle callbacks in the C backend currently require a synchronous zero-argument arrow function',
        callback.loc
      )
    )
    return []
  }

  const body = callback.expressionBody
    ? [
        {
          type: 'ExpressionStatement',
          expression: callback.body,
          loc: callback.loc
        }
      ]
    : callback.body

  return emitStatementList(body, context)
}

function emitNetListenCallback(args, options) {
  if (options != null) {
    return args[1]?.type === 'ArrowFunctionExpression' ? args[1] : null
  }

  return args.find((arg) => arg?.type === 'ArrowFunctionExpression') ?? null
}

function emitNetListenPortArg(args) {
  return args[0]?.type === 'ArrowFunctionExpression' ? null : args[0] ?? null
}

function emitNetListenHostArg(args) {
  if (args[1]?.type === 'StringLiteral' || (args[1]?.type === 'TemplateLiteral' && !args[1].raw.includes('${'))) {
    return args[1]
  }

  return null
}

function emitNetListenBacklogArg(args) {
  if (args[1]?.type === 'NumberLiteral') {
    return args[1]
  }

  if (args[2]?.type === 'NumberLiteral') {
    return args[2]
  }

  return null
}

function emitNetListenHostExpression(expression, context) {
  if (expression == null) {
    return '0'
  }

  if (expression.type === 'StringLiteral') {
    return cStringLiteral(expression.value)
  }

  if (expression.type === 'TemplateLiteral' && !expression.raw.includes('${')) {
    return cStringLiteral(expression.raw.slice(1, -1))
  }

  context.diagnostics.push(
    diagnostic(
      'CCJS_NET_SERVER',
      'server.listen host in the C backend currently must be a string literal',
      expression.loc
    )
  )
  return '0'
}

function emitNetConnectHostExpression(expression, context) {
  if (expression == null) {
    return '"127.0.0.1"'
  }

  return emitNetListenHostExpression(expression, context)
}

function emitNetBytesOperand(expression, netContext, context) {
  if (expression == null) {
    return {
      lines: [],
      bytes: '""',
      length: '0'
    }
  }

  if (
    netContext?.dataName != null &&
    expression?.type === 'Reference' &&
    expression.path.length === 1 &&
    expression.path[0] === netContext.dataName
  ) {
    return {
      lines: [],
      bytes: 'ccjs_bytes',
      length: 'ccjs_len'
    }
  }

  const staticValue = emitNetStaticStringValue(expression, netContext)

  if (staticValue != null) {
    return {
      lines: [],
      bytes: cStringLiteral(staticValue),
      length: `${utf8ByteLength(staticValue)}`
    }
  }

  return emitPreparedStringBytesOperand(expression, context, 'ccjs_net_string')
}

function emitNetStaticStringValue(expression, netContext) {
  if (expression?.type === 'StringLiteral') {
    return expression.value
  }

  if (expression?.type === 'TemplateLiteral' && !expression.raw.includes('${')) {
    return expression.raw.slice(1, -1)
  }

  if (expression?.type === 'Reference' && expression.path.length === 1) {
    return netContext?.stringLocals?.get(expression.path[0]) ?? null
  }

  return null
}

function emitNetStatusCheck(call, context) {
  const status = nextCName(context, 'ccjs_net_status')

  return ['{', `  ccjs_status ${status} = ${call};`, `  if (${status} != CCJS_OK) return ${status};`, '}']
}

function emitPreparedNetAddressPortExpression(expression, context) {
  if (
    expression?.type !== 'MemberExpression' ||
    expression.property !== 'port' ||
    expression.object?.type !== 'Reference' ||
    expression.object.path.length !== 1 ||
    context.variables.get(expression.object.path[0]) !== 'net-address'
  ) {
    return null
  }

  return {
    lines: [],
    expression: expression.object.path[0] + '.port'
  }
}

function resolveNetAddressStringMember(expression, context) {
  if (
    expression?.type !== 'MemberExpression' ||
    !['address', 'family'].includes(expression.property) ||
    expression.object?.type !== 'Reference' ||
    expression.object.path.length !== 1 ||
    context.variables.get(expression.object.path[0]) !== 'net-address'
  ) {
    return null
  }

  return expression.property === 'family' ? `${expression.object.path[0]}.family` : `${expression.object.path[0]}.address`
}

function isNetAddressCall(expression, context) {
  return (
    expression?.type === 'CallExpression' &&
    expression.callee?.type === 'MemberExpression' &&
    expression.callee.property === 'address' &&
    expression.callee.object?.type === 'Reference' &&
    expression.callee.object.path.length === 1 &&
    (context.variables.get(expression.callee.object.path[0]) === 'net-server' ||
      context.variables.get(expression.callee.object.path[0]) === 'net-socket')
  )
}

function resolveNetSocketAddressMember(expression, context) {
  if (
    expression?.type !== 'MemberExpression' ||
    expression.object?.type !== 'Reference' ||
    expression.object.path.length !== 1 ||
    context.variables.get(expression.object.path[0]) !== 'net-socket'
  ) {
    return null
  }

  const property = expression.property
  const isRemote = property === 'remoteAddress' || property === 'remotePort'
  const isLocal = property === 'localAddress' || property === 'localPort'

  if (!isRemote && !isLocal) {
    return null
  }

  return {
    socketName: expression.object.path[0],
    runtime: isRemote ? 'ccjs_net_socket_remote_address' : 'ccjs_net_socket_address',
    tempName: nextCName(context, 'ccjs_net_address'),
    field: property === 'remotePort' || property === 'localPort' ? 'port' : 'address',
    valueType: property === 'remotePort' || property === 'localPort' ? 'number' : 'string'
  }
}

function resolveNetSocketCounterMember(expression, context) {
  if (
    expression?.type !== 'MemberExpression' ||
    expression.object?.type !== 'Reference' ||
    expression.object.path.length !== 1 ||
    context.variables.get(expression.object.path[0]) !== 'net-socket'
  ) {
    return null
  }

  if (expression.property === 'bytesRead') {
    return {
      socketName: expression.object.path[0],
      runtime: 'ccjs_net_socket_get_bytes_read'
    }
  }

  if (expression.property === 'bytesWritten') {
    return {
      socketName: expression.object.path[0],
      runtime: 'ccjs_net_socket_get_bytes_written'
    }
  }

  return null
}

function isNetSocketMethodCall(expression, method, context) {
  return isNetSocketAnyMethodCall(expression, context) && expression.callee.property === method
}

function isNetSocketAnyMethodCall(expression, context) {
  return (
    expression?.type === 'CallExpression' &&
    expression.callee?.type === 'MemberExpression' &&
    expression.callee.object?.type === 'Reference' &&
    expression.callee.object.path.length === 1 &&
    context.variables.get(expression.callee.object.path[0]) === 'net-socket'
  )
}

function isNetServerMethodCall(expression, method, context) {
  return isNetServerAnyMethodCall(expression, context) && expression.callee.property === method
}

function isNetServerAnyMethodCall(expression, context) {
  return (
    expression?.type === 'CallExpression' &&
    expression.callee?.type === 'MemberExpression' &&
    expression.callee.object?.type === 'Reference' &&
    expression.callee.object.path.length === 1 &&
    context.variables.get(expression.callee.object.path[0]) === 'net-server'
  )
}

function isNetCreateServerCall(expression, context) {
  if (expression?.type !== 'CallExpression') {
    return false
  }

  if (
    expression.callee?.type === 'Reference' &&
    expression.callee.path.length === 1 &&
    context.netCreateServerNames.has(expression.callee.path[0])
  ) {
    return true
  }

  return (
    expression.callee?.type === 'MemberExpression' &&
    expression.callee.property === 'createServer' &&
    expression.callee.object?.type === 'Reference' &&
    expression.callee.object.path.length === 1 &&
    context.netImportNames.has(expression.callee.object.path[0])
  )
}

function isNetConnectCall(expression, context) {
  if (expression?.type !== 'CallExpression') {
    return false
  }

  if (
    expression.callee?.type === 'Reference' &&
    expression.callee.path.length === 1 &&
    context.netConnectNames.has(expression.callee.path[0])
  ) {
    return true
  }

  return (
    expression.callee?.type === 'MemberExpression' &&
    (expression.callee.property === 'connect' || expression.callee.property === 'createConnection') &&
    expression.callee.object?.type === 'Reference' &&
    expression.callee.object.path.length === 1 &&
    context.netImportNames.has(expression.callee.object.path[0])
  )
}

function emitNetCreateServerConnectionListener(expression) {
  if (expression.args[0]?.type === 'ArrowFunctionExpression') {
    return expression.args[0]
  }

  if (expression.args[1]?.type === 'ArrowFunctionExpression') {
    return expression.args[1]
  }

  return null
}

function emitNetConnectCallback(expression) {
  if (expression.args[0]?.type === 'ObjectLiteral') {
    return expression.args[1]?.type === 'ArrowFunctionExpression' ? expression.args[1] : null
  }

  if (expression.args[1]?.type === 'ArrowFunctionExpression') {
    return expression.args[1]
  }

  if (expression.args[2]?.type === 'ArrowFunctionExpression') {
    return expression.args[2]
  }

  return null
}

function findNetHandler(context, expression, kind) {
  if (expression == null) {
    return null
  }

  for (const wrapper of context.netHandlers.values()) {
    if (wrapper.expression === expression && wrapper.kind === kind) {
      return wrapper
    }
  }

  return null
}

function emitCClassMethodName(className, methodName) {
  return `ccjs_method_${emitCIdentifier(className)}_${emitCIdentifier(methodName)}`
}

function resolveCFunctionReturnInfo(statement, context) {
  const returnType = resolveFunctionReturnType(statement.name, statement.returnType, context)
  const returnNullable = resolveFunctionReturnNullable(statement.name, statement.returnNullable, context)

  if (context.functionAsyncFlags.get(statement.name) === true && returnType === 'promise') {
    return {
      returnType:
        context.functionReturnPromiseValueTypes.get(statement.name) ?? statement.returnPromiseValueType ?? 'void',
      returnNullable: false
    }
  }

  return {
    returnType,
    returnNullable
  }
}

function emitFunctionParameter(name, functionType, context, loc) {
  reportUnsupportedCFunctionType(functionType, context, loc)

  if (isRuntimeFunctionType(functionType)) {
    return `ccjs_value ${name}`
  }

  return emitFunctionPointerParameter(name, functionType)
}

function emitFunctionPointerParameter(name, functionType) {
  return `${emitFunctionPointerReturnType(functionType)} (*${name})(${emitFunctionPointerParams(functionType)})`
}

function emitFunctionPointerVariable(name, init, context, isConst, functionType, loc) {
  reportUnsupportedCFunctionType(functionType, context, loc)

  return `${emitFunctionPointerReturnType(functionType)} (*${isConst ? 'const ' : ''}${name})(${emitFunctionPointerParams(functionType)}) = ${emitFunctionValueExpression(init, context)}`
}

function reportUnsupportedCFunctionType(functionType, context, loc) {
  if (functionType == null) {
    return
  }

  if (isPlainFunctionPointerType(functionType) || isRuntimeFunctionType(functionType)) {
    return
  }

  context.diagnostics.push(
    diagnostic(
      'CCJS_C_FUNCTION_VALUE',
      'typed C callbacks currently support only void callbacks with number/boolean/string/object parameters',
      loc
    )
  )
}

const genericFunctionType = {
  kind: 'function',
  params: [],
  returnType: 'void'
}

function normalizeFunctionType(functionType) {
  return functionType ?? genericFunctionType
}

function isPlainFunctionPointerType(functionType) {
  return (
    functionType == null ||
    (functionType.returnType === 'void' &&
      functionType.params.every((param) => ['number', 'boolean'].includes(param.valueType)))
  )
}

function isRuntimeFunctionType(functionType) {
  return (
    functionType != null &&
    isSupportedRuntimeCallbackReturnType(functionType.returnType) &&
    functionType.params.some((param) => ['string', 'object'].includes(param.valueType)) &&
    functionType.params.every((param) => ['number', 'boolean', 'string', 'object'].includes(param.valueType))
  )
}

function isNullableFunctionType(valueType, nullable) {
  return valueType === 'function' && nullable === true
}

function isSupportedRuntimeCallbackType(functionType) {
  const normalized = normalizeFunctionType(functionType)

  return (
    isSupportedRuntimeCallbackReturnType(normalized.returnType) &&
    normalized.params.every((param) => ['number', 'boolean', 'string', 'object'].includes(param.valueType))
  )
}

function isSupportedRuntimeCallbackReturnType(returnType) {
  return ['void', 'number', 'boolean', 'string', 'object'].includes(returnType)
}

function runtimeFunctionParamKey(functionName, index) {
  return `${functionName}:${index}`
}

function markRuntimeFunctionParam(callee, index, functionType, context) {
  if (callee?.type !== 'Reference' || callee.path.length !== 1) {
    return
  }

  const name = callee.path[0]

  if (!context.functionParams.has(name) || !isSupportedRuntimeCallbackType(functionType)) {
    return
  }

  context.runtimeFunctionParams.set(runtimeFunctionParamKey(name, index), normalizeFunctionType(functionType))
}

function resolveFunctionParameterRuntimeType(functionName, index, param, context) {
  const promoted = context.runtimeFunctionParams.get(runtimeFunctionParamKey(functionName, index))

  if (promoted != null) {
    return promoted
  }

  if (isNullableFunctionType(param.valueType, param.nullable)) {
    return normalizeFunctionType(param.functionType)
  }

  return isRuntimeFunctionType(param.functionType) ? normalizeFunctionType(param.functionType) : null
}

function resolveRuntimeFunctionArgumentType(callee, index, param, context) {
  if (param?.valueType !== 'function') {
    return null
  }

  if (callee?.type === 'Reference' && callee.path.length === 1) {
    const promoted = context.runtimeFunctionParams.get(runtimeFunctionParamKey(callee.path[0], index))

    if (promoted != null) {
      return promoted
    }
  }

  if (isNullableFunctionType(param.valueType, param.nullable)) {
    return normalizeFunctionType(param.functionType)
  }

  return isRuntimeFunctionType(param.functionType) ? normalizeFunctionType(param.functionType) : null
}

function collectDgramMessageHandlers(irPrograms: IrProgram[], context) {
  const handlers = new Map()
  const register = (expression) => {
    if (expression?.type !== 'ArrowFunctionExpression') {
      return
    }

    if (handlers.has(expression)) {
      return
    }

    handlers.set(expression, {
      name: `ccjs_dgram_message_handler_${handlers.size}`,
      expression
    })
  }
  const visitStatement = (statement) => {
    if (statement == null) {
      return
    }

    if (statement.type === 'VariableDeclaration') {
      visitExpression(statement.init)
      return
    }

    if (statement.type === 'ExpressionStatement') {
      visitExpression(statement.expression)
      return
    }

    if (statement.type === 'ReturnStatement' || statement.type === 'ThrowStatement') {
      visitExpression(statement.argument)
      return
    }

    if (statement.type === 'BlockStatement') {
      statement.body.forEach(visitStatement)
      return
    }

    if (statement.type === 'IfStatement') {
      visitExpression(statement.condition)
      visitStatement(statement.consequent)
      visitStatement(statement.alternate)
      return
    }

    if (statement.type === 'WhileStatement') {
      visitExpression(statement.condition)
      visitStatement(statement.body)
      return
    }

    if (statement.type === 'ForStatement') {
      if (statement.init?.type === 'VariableDeclaration') {
        visitStatement(statement.init)
      } else {
        visitExpression(statement.init)
      }

      visitExpression(statement.test)
      visitExpression(statement.update)
      visitStatement(statement.body)
      return
    }

    if (statement.type === 'ForOfStatement') {
      visitExpression(statement.iterable)
      visitStatement(statement.body)
      return
    }

    if (statement.type === 'SwitchStatement') {
      visitExpression(statement.discriminant)
      statement.cases.forEach((item) => {
        visitExpression(item.test)
        item.consequent.forEach(visitStatement)
      })
      return
    }

    if (statement.type === 'TryStatement') {
      visitStatement(statement.block)
      visitStatement(statement.handler?.body)
      visitStatement(statement.finalizer)
    }
  }
  const visitExpression = (expression) => {
    if (expression == null) {
      return
    }

    if (expression.type === 'CallExpression') {
      if (isDgramCreateSocketCall(expression, context)) {
        register(emitDgramCreateSocketMessageListener(expression))
      }

      if (
        expression.callee?.type === 'MemberExpression' &&
        expression.callee.property === 'on' &&
        expression.args[0]?.type === 'StringLiteral' &&
        expression.args[0].value === 'message'
      ) {
        register(expression.args[1])
      }

      visitExpression(expression.callee)
      expression.args.forEach(visitExpression)
      return
    }

    if (expression.type === 'OptionalCallExpression' || expression.type === 'NewExpression') {
      visitExpression(expression.callee)
      expression.args.forEach(visitExpression)
      return
    }

    if (expression.type === 'ArrowFunctionExpression') {
      if (expression.expressionBody) {
        visitExpression(expression.body)
      } else {
        expression.body.forEach(visitStatement)
      }

      return
    }

    if (expression.type === 'AssignmentExpression') {
      visitExpression(expression.target)
      visitExpression(expression.value)
      return
    }

    if (expression.type === 'BinaryExpression') {
      visitExpression(expression.left)
      visitExpression(expression.right)
      return
    }

    if (
      expression.type === 'UnaryExpression' ||
      expression.type === 'UpdateExpression' ||
      expression.type === 'AwaitExpression'
    ) {
      visitExpression(expression.argument)
      return
    }

    if (expression.type === 'MemberExpression' || expression.type === 'OptionalMemberExpression') {
      visitExpression(expression.object)
      return
    }

    if (expression.type === 'IndexExpression' || expression.type === 'OptionalIndexExpression') {
      visitExpression(expression.object)
      visitExpression(expression.index)
      return
    }

    if (expression.type === 'ArrayLiteral') {
      expression.elements.forEach(visitExpression)
      return
    }

    if (expression.type === 'ObjectLiteral') {
      expression.properties.forEach((property) => visitExpression(property.value))
    }
  }

  for (const ir of irPrograms) {
    for (const item of collectIrTopLevelNodeEntries(ir)) {
      if (item.kind === 'function') {
        item.node.body.forEach(visitStatement)
      } else if (item.kind === 'statement') {
        visitStatement(item.node)
      }
    }
  }

  return handlers
}

function collectHttpHandlers(irPrograms: IrProgram[], context) {
  const handlers = new Map()
  const register = (expression) => {
    if (expression?.type !== 'ArrowFunctionExpression') {
      return
    }

    if (handlers.has(expression)) {
      return
    }

    handlers.set(expression, {
      name: `ccjs_http_handler_${handlers.size}`,
      expression
    })
  }
  const visitStatement = (statement) => {
    if (statement == null) {
      return
    }

    if (statement.type === 'VariableDeclaration') {
      visitExpression(statement.init)
      return
    }

    if (statement.type === 'ExpressionStatement') {
      visitExpression(statement.expression)
      return
    }

    if (statement.type === 'ReturnStatement' || statement.type === 'ThrowStatement') {
      visitExpression(statement.argument)
      return
    }

    if (statement.type === 'BlockStatement') {
      statement.body.forEach(visitStatement)
      return
    }

    if (statement.type === 'IfStatement') {
      visitExpression(statement.condition)
      visitStatement(statement.consequent)
      visitStatement(statement.alternate)
      return
    }

    if (statement.type === 'WhileStatement') {
      visitExpression(statement.condition)
      visitStatement(statement.body)
      return
    }

    if (statement.type === 'ForStatement') {
      if (statement.init?.type === 'VariableDeclaration') {
        visitStatement(statement.init)
      } else {
        visitExpression(statement.init)
      }

      visitExpression(statement.test)
      visitExpression(statement.update)
      visitStatement(statement.body)
      return
    }

    if (statement.type === 'ForOfStatement') {
      visitExpression(statement.iterable)
      visitStatement(statement.body)
      return
    }

    if (statement.type === 'SwitchStatement') {
      visitExpression(statement.discriminant)
      statement.cases.forEach((item) => {
        visitExpression(item.test)
        item.consequent.forEach(visitStatement)
      })
      return
    }

    if (statement.type === 'TryStatement') {
      visitStatement(statement.block)
      visitStatement(statement.handler?.body)
      visitStatement(statement.finalizer)
    }
  }
  const visitExpression = (expression) => {
    if (expression == null) {
      return
    }

    if (expression.type === 'CallExpression') {
      if (isHttpCreateServerCall(expression, context)) {
        register(expression.args[0])
      }

      if (isHttpRequestEventCall(expression) && expression.args[0]?.type === 'StringLiteral') {
        register(expression.args[1])
      }

      visitExpression(expression.callee)
      expression.args.forEach(visitExpression)
      return
    }

    if (expression.type === 'OptionalCallExpression' || expression.type === 'NewExpression') {
      visitExpression(expression.callee)
      expression.args.forEach(visitExpression)
      return
    }

    if (expression.type === 'ArrowFunctionExpression') {
      if (expression.expressionBody) {
        visitExpression(expression.body)
      } else {
        expression.body.forEach(visitStatement)
      }

      return
    }

    if (expression.type === 'AssignmentExpression') {
      visitExpression(expression.target)
      visitExpression(expression.value)
      return
    }

    if (expression.type === 'BinaryExpression') {
      visitExpression(expression.left)
      visitExpression(expression.right)
      return
    }

    if (
      expression.type === 'UnaryExpression' ||
      expression.type === 'UpdateExpression' ||
      expression.type === 'AwaitExpression'
    ) {
      visitExpression(expression.argument)
      return
    }

    if (expression.type === 'MemberExpression' || expression.type === 'OptionalMemberExpression') {
      visitExpression(expression.object)
      return
    }

    if (expression.type === 'IndexExpression' || expression.type === 'OptionalIndexExpression') {
      visitExpression(expression.object)
      visitExpression(expression.index)
      return
    }

    if (expression.type === 'ArrayLiteral') {
      expression.elements.forEach(visitExpression)
      return
    }

    if (expression.type === 'ObjectLiteral') {
      expression.properties.forEach((property) => visitExpression(property.value))
    }
  }

  for (const ir of irPrograms) {
    for (const item of collectIrTopLevelNodeEntries(ir)) {
      if (item.kind === 'function') {
        item.node.body.forEach(visitStatement)
      } else if (item.kind === 'statement') {
        visitStatement(item.node)
      }
    }
  }

  return handlers
}

function collectNetHandlers(irPrograms: IrProgram[], context) {
  const handlers = new Map()
  const register = (kind, expression) => {
    if (expression?.type !== 'ArrowFunctionExpression') {
      return
    }

    for (const wrapper of handlers.values()) {
      if (wrapper.kind === kind && wrapper.expression === expression) {
        return
      }
    }

    const cKind = kind.replaceAll('-', '_')

    handlers.set(`${kind}:${handlers.size}`, {
      kind,
      name: `ccjs_net_${cKind}_handler_${handlers.size}`,
      expression
    })
  }
  const registerEventListener = (expression) => {
    if (
      expression?.type !== 'CallExpression' ||
      expression.callee?.type !== 'MemberExpression' ||
      expression.callee.property !== 'on' ||
      expression.args[0]?.type !== 'StringLiteral'
    ) {
      return
    }

    if (expression.args[0].value === 'connection') {
      register('connection', expression.args[1])
    } else if (expression.args[0].value === 'listening' || expression.args[0].value === 'close') {
      register('event', expression.args[1])
    } else if (expression.args[0].value === 'error') {
      register('error', expression.args[1])
    }
  }
  const registerSocketEventListener = (expression) => {
    if (
      expression?.type !== 'CallExpression' ||
      expression.callee?.type !== 'MemberExpression' ||
      expression.callee.property !== 'on' ||
      expression.args[0]?.type !== 'StringLiteral'
    ) {
      return
    }

    const eventName = expression.args[0].value

    if (eventName === 'data') {
      register('socket-data', expression.args[1])
    } else if (['connect', 'ready', 'end', 'close', 'drain'].includes(eventName)) {
      register('socket-event', expression.args[1])
    } else if (eventName === 'error') {
      register('socket-error', expression.args[1])
    }
  }
  const registerSocketWriteCallback = (expression) => {
    if (
      expression?.type !== 'CallExpression' ||
      expression.callee?.type !== 'MemberExpression' ||
      !['write', 'end'].includes(expression.callee.property)
    ) {
      return
    }

    const callback = expression.args.at(-1)

    if (callback?.type === 'ArrowFunctionExpression') {
      register('socket-write', callback)
    }
  }
  const visitStatement = (statement) => {
    if (statement == null) {
      return
    }

    if (statement.type === 'VariableDeclaration') {
      visitExpression(statement.init)
      return
    }

    if (statement.type === 'ExpressionStatement') {
      visitExpression(statement.expression)
      return
    }

    if (statement.type === 'ReturnStatement' || statement.type === 'ThrowStatement') {
      visitExpression(statement.argument)
      return
    }

    if (statement.type === 'BlockStatement') {
      statement.body.forEach(visitStatement)
      return
    }

    if (statement.type === 'IfStatement') {
      visitExpression(statement.condition)
      visitStatement(statement.consequent)
      visitStatement(statement.alternate)
      return
    }

    if (statement.type === 'WhileStatement') {
      visitExpression(statement.condition)
      visitStatement(statement.body)
      return
    }

    if (statement.type === 'ForStatement') {
      if (statement.init?.type === 'VariableDeclaration') {
        visitStatement(statement.init)
      } else {
        visitExpression(statement.init)
      }

      visitExpression(statement.test)
      visitExpression(statement.update)
      visitStatement(statement.body)
      return
    }

    if (statement.type === 'ForOfStatement') {
      visitExpression(statement.iterable)
      visitStatement(statement.body)
      return
    }

    if (statement.type === 'SwitchStatement') {
      visitExpression(statement.discriminant)
      statement.cases.forEach((item) => {
        visitExpression(item.test)
        item.consequent.forEach(visitStatement)
      })
      return
    }

    if (statement.type === 'TryStatement') {
      visitStatement(statement.block)
      visitStatement(statement.handler?.body)
      visitStatement(statement.finalizer)
    }
  }
  const visitExpression = (expression) => {
    if (expression == null) {
      return
    }

    if (expression.type === 'CallExpression') {
      if (isNetCreateServerCall(expression, context)) {
        register('connection', emitNetCreateServerConnectionListener(expression))
      }

      if (isNetConnectCall(expression, context)) {
        register('socket-event', emitNetConnectCallback(expression))
      }

      registerEventListener(expression)
      registerSocketEventListener(expression)
      registerSocketWriteCallback(expression)
      visitExpression(expression.callee)
      expression.args.forEach(visitExpression)
      return
    }

    if (expression.type === 'OptionalCallExpression' || expression.type === 'NewExpression') {
      visitExpression(expression.callee)
      expression.args.forEach(visitExpression)
      return
    }

    if (expression.type === 'ArrowFunctionExpression') {
      if (expression.expressionBody) {
        visitExpression(expression.body)
      } else {
        expression.body.forEach(visitStatement)
      }

      return
    }

    if (expression.type === 'AssignmentExpression') {
      visitExpression(expression.target)
      visitExpression(expression.value)
      return
    }

    if (expression.type === 'BinaryExpression') {
      visitExpression(expression.left)
      visitExpression(expression.right)
      return
    }

    if (
      expression.type === 'UnaryExpression' ||
      expression.type === 'UpdateExpression' ||
      expression.type === 'AwaitExpression'
    ) {
      visitExpression(expression.argument)
      return
    }

    if (expression.type === 'MemberExpression' || expression.type === 'OptionalMemberExpression') {
      visitExpression(expression.object)
      return
    }

    if (expression.type === 'IndexExpression' || expression.type === 'OptionalIndexExpression') {
      visitExpression(expression.object)
      visitExpression(expression.index)
      return
    }

    if (expression.type === 'ArrayLiteral') {
      expression.elements.forEach(visitExpression)
      return
    }

    if (expression.type === 'ObjectLiteral') {
      expression.properties.forEach((property) => visitExpression(property.value))
    }
  }

  for (const ir of irPrograms) {
    for (const item of collectIrTopLevelNodeEntries(ir)) {
      if (item.kind === 'function') {
        item.node.body.forEach(visitStatement)
      } else if (item.kind === 'statement') {
        visitStatement(item.node)
      }
    }
  }

  return handlers
}

function collectCallbackWrappers(irPrograms: IrProgram[], context) {
  const wrappers = new Map()
  const pendingPlainFunctionArgs: any[] = []
  const register = (expression, functionType, scopes) => {
    const arrowNeedsEventLoop =
      expression?.type === 'ArrowFunctionExpression' &&
      functionUsesExternalEventLoop(expression, context.externalEventLoopFunctions)

    if (
      isPlainFunctionPointerType(functionType) &&
      expression?.type === 'ArrowFunctionExpression' &&
      !arrowNeedsEventLoop
    ) {
      registerPlainArrow(expression, functionType, scopes)
      return
    }

    if (arrowNeedsEventLoop && isSupportedRuntimeCallbackType(functionType)) {
      registerRuntime(expression, functionType, scopes)
      return
    }

    if (!isRuntimeFunctionType(functionType)) {
      return
    }

    if (expression?.type === 'ArrowFunctionExpression') {
      registerArrow(expression, functionType, scopes)
      return
    }

    registerNamed(expression, functionType)
  }
  const registerRuntime = (expression, functionType, scopes) => {
    const normalized = normalizeFunctionType(functionType)

    if (!isSupportedRuntimeCallbackType(normalized)) {
      return
    }

    if (expression?.type === 'ArrowFunctionExpression') {
      registerArrow(expression, normalized, scopes)
      return
    }

    registerNamed(expression, normalized)
  }
  const registerPlain = (expression, functionType, scopes) => {
    if (expression?.type === 'ArrowFunctionExpression') {
      registerPlainArrow(expression, functionType, scopes)
    }
  }
  const hasCaptures = (expression, scopes) =>
    expression?.type === 'ArrowFunctionExpression' && collectArrowCaptures(expression, scopes, context).length > 0
  const shouldPromotePlainFunctionExpression = (expression, functionType, scopes) =>
    isPlainFunctionPointerType(functionType) &&
    isSupportedRuntimeCallbackType(functionType) &&
    hasCaptures(expression, scopes)
  const registerNamed = (expression, functionType) => {
    if (expression?.type !== 'Reference' || expression.path.length !== 1) {
      return
    }

    const target = expression.path[0]

    if (!context.functionNames.has(target)) {
      return
    }

    const key = runtimeCallbackWrapperKey(target, functionType)

    if (wrappers.has(key)) {
      return
    }

    wrappers.set(key, {
      kind: 'named',
      key,
      name: `ccjs_callback_${emitCIdentifier(target)}_${wrappers.size}`,
      target,
      functionType
    })
  }
  const registerArrow = (expression, functionType, scopes) => {
    if (context.callbackArrowWrappers.has(expression)) {
      return
    }

    const index = wrappers.size
    const key = `arrow:${index}`
    const captures = collectArrowCaptures(expression, scopes, context)

    for (const capture of captures) {
      if (
        capture.mutable &&
        ['number', 'boolean', 'string', 'object'].includes(capture.valueType) &&
        capture.declaration != null
      ) {
        context.boxedMutableCaptureDeclarations.add(capture.declaration)
      }
    }

    const wrapper = {
      kind: 'arrow',
      key,
      name: `ccjs_callback_arrow_${index}`,
      contextTypeName: `ccjs_callback_context_${index}`,
      finalizerName: `ccjs_callback_context_${index}_finalize`,
      expression,
      functionType,
      needsEventLoop: functionUsesExternalEventLoop(expression, context.externalEventLoopFunctions),
      captures
    }

    wrappers.set(key, wrapper)
    context.callbackArrowWrappers.set(expression, wrapper)
  }
  const registerPlainArrow = (expression, functionType, scopes) => {
    if (context.callbackArrowWrappers.has(expression)) {
      return
    }

    const captures = collectArrowCaptures(expression, scopes, context)

    if (captures.length > 0) {
      return
    }

    const index = wrappers.size
    const key = `plain-arrow:${index}`
    const wrapper = {
      kind: 'plain-arrow',
      key,
      name: `ccjs_callback_arrow_${index}`,
      expression,
      functionType
    }

    wrappers.set(key, wrapper)
    context.callbackArrowWrappers.set(expression, wrapper)
  }
  const declare = (scope, name, info) => {
    scope.set(name, info)
  }
  const declareParams = (scope, params) => {
    for (const param of params) {
      declare(scope, param.name, {
        name: param.name,
        valueType: param.valueType,
        declaration: param,
        functionType: param.functionType,
        nullable: param.nullable === true,
        shape: param.shape,
        runtimeManaged: ['string', 'object'].includes(param.valueType),
        mutable: true
      })
    }
  }
  const declareVariable = (scope, statement, scopes) => {
    const valueType =
      statement.valueType === 'unknown' ? inferCapturedExpressionValueType(statement.init, scopes) : statement.valueType

    declare(scope, statement.name, {
      name: statement.name,
      valueType,
      functionType: statement.functionType,
      declaration: statement,
      nullable: statement.nullable === true,
      shape: statement.shape,
      runtimeCallback:
        isNullableFunctionType(valueType, statement.nullable) ||
        isRuntimeFunctionType(statement.functionType) ||
        shouldPromotePlainFunctionExpression(statement.init, statement.functionType, scopes),
      runtimeManaged: isRuntimeManagedCaptureBinding(statement, scopes, valueType),
      mutable: statement.kind === 'let'
    })
  }
  const lookup = (name, scopes) => {
    for (let index = scopes.length - 1; index >= 0; index -= 1) {
      const entry = scopes[index].get(name)

      if (entry != null) {
        return entry
      }
    }

    return null
  }
  const isRuntimeManagedCaptureBinding = (statement, scopes, valueType) => {
    if (valueType === 'object') {
      return true
    }

    if (valueType !== 'string') {
      return false
    }

    if (statement.init?.type === 'StringLiteral') {
      return false
    }

    if (statement.init?.type === 'TemplateLiteral' && !statement.init.raw.includes('${')) {
      return false
    }

    if (statement.init?.type === 'Reference' && statement.init.path.length === 1) {
      return lookup(statement.init.path[0], scopes)?.runtimeManaged === true
    }

    return true
  }
  const inferCapturedExpressionValueType = (expression, scopes) => {
    if (expression?.valueType != null && expression.valueType !== 'unknown') {
      return expression.valueType
    }

    if (expression?.type === 'Reference' && expression.path.length === 1) {
      return lookup(expression.path[0], scopes)?.valueType ?? 'unknown'
    }

    if (expression?.type === 'MemberExpression') {
      const object = inferCapturedExpressionInfo(expression.object, scopes)
      const field = object.shape?.fields?.find((field) => field.name === expression.property)

      return field?.valueType ?? 'unknown'
    }

    if (expression?.type === 'IndexExpression' && expression.index.type === 'StringLiteral') {
      const object = inferCapturedExpressionInfo(expression.object, scopes)
      const field = object.shape?.fields?.find((field) => field.name === expression.index.value)

      return field?.valueType ?? 'unknown'
    }

    return 'unknown'
  }
  const inferCapturedExpressionInfo = (expression, scopes) => {
    if (expression?.type === 'Reference' && expression.path.length === 1) {
      const entry = lookup(expression.path[0], scopes)

      if (entry != null) {
        return entry
      }
    }

    return {
      valueType: inferCapturedExpressionValueType(expression, scopes),
      shape: null
    }
  }
  const visitStatement = (statement, scopes) => {
    if (statement?.type === 'VariableDeclaration') {
      if (isNullableFunctionType(statement.valueType, statement.nullable)) {
        registerRuntime(statement.init, statement.functionType, scopes)
      } else if (shouldPromotePlainFunctionExpression(statement.init, statement.functionType, scopes)) {
        registerRuntime(statement.init, statement.functionType, scopes)
      } else {
        register(statement.init, statement.functionType, scopes)
      }

      visitExpression(statement.init, scopes)
      declareVariable(scopes.at(-1), statement, scopes)
      return
    }

    if (statement?.type === 'ExpressionStatement') {
      visitExpression(statement.expression, scopes)
      return
    }

    if (statement?.type === 'ReturnStatement') {
      visitExpression(statement.argument, scopes)
      return
    }

    if (statement?.type === 'ThrowStatement') {
      visitExpression(statement.argument, scopes)
      return
    }

    if (statement?.type === 'BlockStatement') {
      const scope = new Map()
      statement.body.forEach((item) => visitStatement(item, [...scopes, scope]))
      return
    }

    if (statement?.type === 'IfStatement') {
      visitExpression(statement.condition, scopes)
      visitStatement(statement.consequent, scopes)
      visitStatement(statement.alternate, scopes)
      return
    }

    if (statement?.type === 'WhileStatement') {
      visitExpression(statement.condition, scopes)
      visitStatement(statement.body, scopes)
      return
    }

    if (statement?.type === 'ForStatement') {
      const scope = new Map()
      const loopScopes = [...scopes, scope]

      if (statement.init?.type === 'VariableDeclaration') {
        visitStatement(statement.init, loopScopes)
      } else {
        visitExpression(statement.init, loopScopes)
      }

      visitExpression(statement.test, loopScopes)
      visitExpression(statement.update, loopScopes)
      visitStatement(statement.body, loopScopes)
      return
    }

    if (statement?.type === 'ForOfStatement') {
      visitExpression(statement.iterable, scopes)
      const scope = new Map()
      declare(scope, statement.name, {
        name: statement.name,
        valueType: 'unknown',
        mutable: statement.kind === 'let'
      })
      visitStatement(statement.body, [...scopes, scope])
      return
    }

    if (statement?.type === 'SwitchStatement') {
      visitExpression(statement.discriminant, scopes)

      for (const item of statement.cases) {
        visitExpression(item.test, scopes)
        const scope = new Map()
        item.consequent.forEach((statement) => visitStatement(statement, [...scopes, scope]))
      }
    }

    if (statement?.type === 'TryStatement') {
      visitStatement(statement.block, scopes)
      visitStatement(statement.handler?.body, scopes)
      visitStatement(statement.finalizer, scopes)
    }
  }
  const visitExpression = (expression, scopes) => {
    if (expression == null) {
      return
    }

    if (expression.type === 'CallExpression') {
      if (cTimerStartCallName(expression.callee) != null) {
        registerRuntime(expression.args[0], timerCallbackFunctionType(), scopes)
      }

      const params = resolveStaticFunctionParams(expression.callee, context)

      for (const [index, arg] of expression.args.entries()) {
        const param = params?.[index]

        if (param?.valueType === 'function') {
          if (isNullableFunctionType(param.valueType, param.nullable)) {
            registerRuntime(arg, param.functionType, scopes)
          } else if (isRuntimeFunctionType(param.functionType)) {
            registerRuntime(arg, param.functionType, scopes)
          } else {
            pendingPlainFunctionArgs.push({
              callee: expression.callee,
              index,
              arg,
              functionType: normalizeFunctionType(param.functionType),
              scopes
            })

            const argInfo = arg.type === 'Reference' && arg.path.length === 1 ? lookup(arg.path[0], scopes) : null

            if (hasCaptures(arg, scopes) || argInfo?.runtimeCallback === true) {
              markRuntimeFunctionParam(expression.callee, index, param.functionType, context)
            }
          }
        }

        visitExpression(arg, scopes)
      }

      visitExpression(expression.callee, scopes)
      return
    }

    if (expression.type === 'AssignmentExpression') {
      const targetInfo =
        expression.target?.type === 'Reference' && expression.target.path.length === 1
          ? lookup(expression.target.path[0], scopes)
          : null

      if (isNullableFunctionType(targetInfo?.valueType, targetInfo?.nullable)) {
        registerRuntime(expression.value, targetInfo.functionType, scopes)
      }

      visitExpression(expression.target, scopes)
      visitExpression(expression.value, scopes)
      return
    }

    if (expression.type === 'BinaryExpression') {
      visitExpression(expression.left, scopes)
      visitExpression(expression.right, scopes)
      return
    }

    if (
      expression.type === 'UnaryExpression' ||
      expression.type === 'UpdateExpression' ||
      expression.type === 'AwaitExpression'
    ) {
      visitExpression(expression.argument, scopes)
      return
    }

    if (expression.type === 'MemberExpression' || expression.type === 'OptionalMemberExpression') {
      visitExpression(expression.object, scopes)
      return
    }

    if (expression.type === 'IndexExpression' || expression.type === 'OptionalIndexExpression') {
      visitExpression(expression.object, scopes)
      visitExpression(expression.index, scopes)
      return
    }

    if (expression.type === 'NewExpression' && isPromiseConstructorExpression(expression)) {
      visitExpression(expression.callee, scopes)

      const executor = expression.args[0]

      if (executor?.type === 'ArrowFunctionExpression') {
        const scope = new Map()

        for (const [index, param] of executor.params.entries()) {
          declare(scope, param.name, {
            name: param.name,
            valueType: 'promise-settlement',
            promiseSettlementKind: index === 1 ? 'reject' : 'resolve',
            loc: param.loc,
            mutable: false
          })
        }

        const executorScopes = [...scopes, scope]

        if (executor.expressionBody) {
          visitExpression(executor.body, executorScopes)
        } else {
          executor.body.forEach((statement) => visitStatement(statement, executorScopes))
        }

        return
      }

      expression.args.forEach((arg) => visitExpression(arg, scopes))
      return
    }

    if (expression.type === 'OptionalCallExpression' || expression.type === 'NewExpression') {
      visitExpression(expression.callee, scopes)
      expression.args.forEach((arg) => visitExpression(arg, scopes))
      return
    }

    if (expression.type === 'ArrayLiteral') {
      expression.elements.forEach((element) => visitExpression(element, scopes))
      return
    }

    if (expression.type === 'ObjectLiteral') {
      expression.properties.forEach((property) => visitExpression(property.value, scopes))
      return
    }

    if (expression.type === 'ArrowFunctionExpression') {
      const scope = new Map()

      for (const param of expression.params) {
        declare(scope, param.name, {
          name: param.name,
          valueType: param.valueType,
          declaration: param,
          functionType: param.functionType,
          nullable: param.nullable === true,
          shape: param.shape,
          runtimeManaged: ['string', 'object'].includes(param.valueType),
          mutable: false
        })
      }

      const arrowScopes = [...scopes, scope]

      if (expression.expressionBody) {
        visitExpression(expression.body, arrowScopes)
      } else {
        expression.body.forEach((statement) => visitStatement(statement, arrowScopes))
      }

      return
    }
  }

  for (const ir of irPrograms) {
    const topLevelScope = new Map()

    for (const item of collectIrTopLevelNodeEntries(ir)) {
      if (item.kind === 'function') {
        const scope = new Map()
        declareParams(scope, item.node.params)
        item.node.body.forEach((statement) => visitStatement(statement, [topLevelScope, scope]))
      } else if (item.kind === 'statement') {
        visitStatement(item.node, [topLevelScope])
      }
    }
  }

  for (const pending of pendingPlainFunctionArgs) {
    if (
      resolveRuntimeFunctionArgumentType(
        pending.callee,
        pending.index,
        {
          valueType: 'function',
          functionType: pending.functionType
        },
        context
      ) != null
    ) {
      registerRuntime(pending.arg, pending.functionType, pending.scopes)
    } else {
      registerPlain(pending.arg, pending.functionType, pending.scopes)
    }
  }

  return wrappers
}

function collectPromiseChainWrappers(irPrograms: IrProgram[], context) {
  const wrappers = new Map()
  const declare = (scope, name, info) => {
    scope.set(name, info)
  }
  const declareParams = (scope, params) => {
    for (const param of params) {
      declare(scope, param.name, {
        name: param.name,
        valueType: param.valueType,
        declaration: param,
        functionType: param.functionType,
        nullable: param.nullable === true,
        shape: param.shape,
        runtimeManaged: ['string', 'object'].includes(param.valueType),
        mutable: false
      })
    }
  }
  const lookup = (name, scopes) => {
    for (let index = scopes.length - 1; index >= 0; index -= 1) {
      const entry = scopes[index].get(name)

      if (entry != null) {
        return entry
      }
    }

    return null
  }
  const isRuntimeManagedCaptureBinding = (statement, scopes, valueType) => {
    if (valueType === 'object') {
      return true
    }

    if (valueType !== 'string') {
      return false
    }

    if (statement.init?.type === 'StringLiteral') {
      return false
    }

    if (statement.init?.type === 'TemplateLiteral' && !statement.init.raw.includes('${')) {
      return false
    }

    if (statement.init?.type === 'Reference' && statement.init.path.length === 1) {
      return lookup(statement.init.path[0], scopes)?.runtimeManaged === true
    }

    return true
  }
  const declareVariable = (scope, statement, scopes) => {
    declare(scope, statement.name, {
      name: statement.name,
      valueType: statement.valueType,
      declaration: statement,
      functionType: statement.functionType,
      nullable: statement.nullable === true,
      shape: statement.shape,
      runtimeManaged: isRuntimeManagedCaptureBinding(statement, scopes, statement.valueType),
      mutable: statement.kind === 'let'
    })
  }
  const register = (expression, scopes) => {
    if (!isPromiseMethodAst(expression)) {
      return
    }

    const callback = expression.args[0]

    if (
      callback?.type !== 'ArrowFunctionExpression' ||
      callback.params.length > 1 ||
      resolvePromiseChainArrowBody(callback) == null
    ) {
      return
    }

    if (context.promiseChainArrowWrappers.has(callback)) {
      return
    }

    const index = wrappers.size
    const key = `promise-chain-arrow:${index}`
    const captures = collectArrowCaptures(callback, scopes, context)

    for (const capture of captures) {
      if (
        capture.mutable &&
        ['number', 'boolean', 'string', 'object'].includes(capture.valueType) &&
        capture.declaration != null
      ) {
        context.boxedMutableCaptureDeclarations.add(capture.declaration)
      }
    }

    const wrapper = {
      kind: 'promise-chain-arrow',
      key,
      name: `ccjs_promise_chain_arrow_${index}`,
      contextTypeName: `ccjs_promise_chain_context_${index}`,
      finalizerName: `ccjs_promise_chain_context_${index}_finalize`,
      expression: callback,
      returnType: callback.returnType ?? expression.promiseValueType ?? 'unknown',
      returnShape: callback.returnShape ?? null,
      needsEventLoop: functionUsesExternalEventLoop(callback, context.externalEventLoopFunctions),
      captures
    }

    wrappers.set(key, wrapper)
    context.promiseChainArrowWrappers.set(callback, wrapper)
  }
  const visitStatement = (statement, scopes) => {
    if (statement == null) {
      return
    }

    if (statement.type === 'VariableDeclaration') {
      visitExpression(statement.init, scopes)
      declareVariable(scopes.at(-1), statement, scopes)
      return
    }

    if (statement.type === 'ExpressionStatement') {
      visitExpression(statement.expression, scopes)
      return
    }

    if (statement.type === 'ReturnStatement' || statement.type === 'ThrowStatement') {
      visitExpression(statement.argument, scopes)
      return
    }

    if (statement.type === 'BlockStatement') {
      const scope = new Map()
      statement.body.forEach((item) => visitStatement(item, [...scopes, scope]))
      return
    }

    if (statement.type === 'IfStatement') {
      visitExpression(statement.condition, scopes)
      visitStatement(statement.consequent, scopes)
      visitStatement(statement.alternate, scopes)
      return
    }

    if (statement.type === 'WhileStatement') {
      visitExpression(statement.condition, scopes)
      visitStatement(statement.body, scopes)
      return
    }

    if (statement.type === 'ForStatement') {
      const scope = new Map()
      const loopScopes = [...scopes, scope]

      if (statement.init?.type === 'VariableDeclaration') {
        visitStatement(statement.init, loopScopes)
      } else {
        visitExpression(statement.init, loopScopes)
      }

      visitExpression(statement.test, loopScopes)
      visitExpression(statement.update, loopScopes)
      visitStatement(statement.body, loopScopes)
      return
    }

    if (statement.type === 'ForOfStatement') {
      visitExpression(statement.iterable, scopes)
      const scope = new Map()
      declare(scope, statement.name, {
        name: statement.name,
        valueType: 'unknown',
        mutable: statement.kind === 'let'
      })
      visitStatement(statement.body, [...scopes, scope])
      return
    }

    if (statement.type === 'SwitchStatement') {
      visitExpression(statement.discriminant, scopes)

      for (const item of statement.cases) {
        visitExpression(item.test, scopes)
        const scope = new Map()
        item.consequent.forEach((statement) => visitStatement(statement, [...scopes, scope]))
      }
      return
    }

    if (statement.type === 'TryStatement') {
      visitStatement(statement.block, scopes)
      visitStatement(statement.handler?.body, scopes)
      visitStatement(statement.finalizer, scopes)
    }
  }
  const visitExpression = (expression, scopes) => {
    if (expression == null) {
      return
    }

    if (expression.type === 'CallExpression') {
      register(expression, scopes)
      visitExpression(expression.callee, scopes)
      expression.args.forEach((arg) => visitExpression(arg, scopes))
      return
    }

    if (expression.type === 'OptionalCallExpression' || expression.type === 'NewExpression') {
      visitExpression(expression.callee, scopes)
      expression.args.forEach((arg) => visitExpression(arg, scopes))
      return
    }

    if (expression.type === 'AssignmentExpression') {
      visitExpression(expression.target, scopes)
      visitExpression(expression.value, scopes)
      return
    }

    if (expression.type === 'BinaryExpression') {
      visitExpression(expression.left, scopes)
      visitExpression(expression.right, scopes)
      return
    }

    if (
      expression.type === 'UnaryExpression' ||
      expression.type === 'UpdateExpression' ||
      expression.type === 'AwaitExpression'
    ) {
      visitExpression(expression.argument, scopes)
      return
    }

    if (expression.type === 'MemberExpression' || expression.type === 'OptionalMemberExpression') {
      visitExpression(expression.object, scopes)
      return
    }

    if (expression.type === 'IndexExpression' || expression.type === 'OptionalIndexExpression') {
      visitExpression(expression.object, scopes)
      visitExpression(expression.index, scopes)
      return
    }

    if (expression.type === 'ArrayLiteral') {
      expression.elements.forEach((element) => visitExpression(element, scopes))
      return
    }

    if (expression.type === 'ObjectLiteral') {
      expression.properties.forEach((property) => visitExpression(property.value, scopes))
    }
  }

  for (const ir of irPrograms) {
    const topLevelScope = new Map()

    for (const item of collectIrTopLevelNodeEntries(ir)) {
      if (item.kind === 'function') {
        const scope = new Map()
        declareParams(scope, item.node.params)
        item.node.body.forEach((statement) => visitStatement(statement, [topLevelScope, scope]))
      } else if (item.kind === 'statement') {
        visitStatement(item.node, [topLevelScope])
      }
    }
  }

  return wrappers
}

function collectArrowCaptures(expression, outerScopes, context) {
  const captures = new Map()
  const localScope = new Map()
  const localScopes = [localScope]

  for (const param of expression.params) {
    localScope.set(param.name, {
      name: param.name,
      valueType: param.valueType,
      mutable: true
    })
  }

  const lookup = (name, scopes) => {
    for (let index = scopes.length - 1; index >= 0; index -= 1) {
      const entry = scopes[index].get(name)

      if (entry != null) {
        return entry
      }
    }

    return null
  }
  const addReference = (reference) => {
    if (reference.path.length !== 1) {
      return
    }

    const name = reference.path[0]

    if (lookup(name, localScopes) != null || context.functionNames.has(name) || isCJsGlobalRoot(name, context)) {
      return
    }

    const outer = lookup(name, outerScopes)

    if (outer != null && !captures.has(name)) {
      captures.set(name, {
        ...outer,
        name
      })
    }
  }
  const declareLocal = (statement) => {
    localScopes[localScopes.length - 1].set(statement.name, {
      name: statement.name,
      valueType: statement.valueType,
      functionType: statement.functionType,
      shape: statement.shape,
      mutable: statement.kind === 'let'
    })
  }
  const visitStatement = (statement) => {
    if (statement == null) {
      return
    }

    if (statement.type === 'VariableDeclaration') {
      visitExpression(statement.init)
      declareLocal(statement)
      return
    }

    if (statement.type === 'ExpressionStatement') {
      visitExpression(statement.expression)
      return
    }

    if (statement.type === 'ReturnStatement' || statement.type === 'ThrowStatement') {
      visitExpression(statement.argument)
      return
    }

    if (statement.type === 'BlockStatement') {
      localScopes.push(new Map())
      statement.body.forEach(visitStatement)
      localScopes.pop()
      return
    }

    if (statement.type === 'IfStatement') {
      visitExpression(statement.condition)
      visitStatement(statement.consequent)
      visitStatement(statement.alternate)
      return
    }

    if (statement.type === 'WhileStatement') {
      visitExpression(statement.condition)
      visitStatement(statement.body)
      return
    }

    if (statement.type === 'ForStatement') {
      localScopes.push(new Map())

      if (statement.init?.type === 'VariableDeclaration') {
        visitStatement(statement.init)
      } else {
        visitExpression(statement.init)
      }

      visitExpression(statement.test)
      visitExpression(statement.update)
      visitStatement(statement.body)
      localScopes.pop()
      return
    }

    if (statement.type === 'ForOfStatement') {
      visitExpression(statement.iterable)
      localScopes.push(
        new Map([
          [
            statement.name,
            {
              name: statement.name,
              valueType: 'unknown',
              mutable: statement.kind === 'let'
            }
          ]
        ])
      )
      visitStatement(statement.body)
      localScopes.pop()
      return
    }

    if (statement.type === 'SwitchStatement') {
      visitExpression(statement.discriminant)

      for (const item of statement.cases) {
        visitExpression(item.test)
        localScopes.push(new Map())
        item.consequent.forEach(visitStatement)
        localScopes.pop()
      }
    }

    if (statement.type === 'TryStatement') {
      visitStatement(statement.block)

      if (statement.handler != null) {
        const catchScope = new Map()

        if (statement.handler.param != null) {
          catchScope.set(statement.handler.param, {
            name: statement.handler.param,
            valueType: 'string',
            mutable: true
          })
        }

        localScopes.push(catchScope)
        visitStatement(statement.handler.body)
        localScopes.pop()
      }

      visitStatement(statement.finalizer)
    }
  }
  const visitExpression = (node) => {
    if (node == null) {
      return
    }

    if (node.type === 'TemplateLiteral') {
      for (const expression of collectTemplatePlaceholderExpressions(node)) {
        visitExpression(expression)
      }

      return
    }

    if (node.type === 'Reference') {
      addReference(node)
      return
    }

    if (node.type === 'MemberExpression' || node.type === 'OptionalMemberExpression') {
      visitExpression(node.object)
      return
    }

    if (node.type === 'IndexExpression' || node.type === 'OptionalIndexExpression') {
      visitExpression(node.object)
      visitExpression(node.index)
      return
    }

    if (node.type === 'CallExpression' || node.type === 'OptionalCallExpression' || node.type === 'NewExpression') {
      visitExpression(node.callee)
      node.args.forEach(visitExpression)
      return
    }

    if (node.type === 'AssignmentExpression') {
      visitExpression(node.target)
      visitExpression(node.value)
      return
    }

    if (node.type === 'BinaryExpression') {
      visitExpression(node.left)
      visitExpression(node.right)
      return
    }

    if (node.type === 'UnaryExpression' || node.type === 'UpdateExpression' || node.type === 'AwaitExpression') {
      visitExpression(node.argument)
      return
    }

    if (node.type === 'ArrayLiteral') {
      node.elements.forEach(visitExpression)
      return
    }

    if (node.type === 'ObjectLiteral') {
      node.properties.forEach((property) => visitExpression(property.value))
    }
  }

  if (expression.expressionBody) {
    visitExpression(expression.body)
  } else {
    expression.body.forEach(visitStatement)
  }

  return [...captures.values()]
}

function resolveStaticFunctionParams(callee, context) {
  if (callee?.type !== 'Reference' || callee.path.length !== 1) {
    return null
  }

  return context.functionParams.get(callee.path[0]) ?? null
}

function runtimeCallbackWrapperKey(target, functionType) {
  return `${target}:${functionType.returnType}(${functionType.params.map((param) => param.valueType).join(',')})`
}

function runtimeCallbackWrapperFor(target, functionType, context) {
  return context.callbackWrappers.get(runtimeCallbackWrapperKey(target, functionType)) ?? null
}

function emitRuntimeCallbackWrapperHead(wrapper) {
  return `static ccjs_status ${wrapper.name}(void* context, const ccjs_value* args, size_t arg_count, ccjs_value* out)`
}

function emitPromiseChainCallbackWrapperHead(wrapper) {
  return `static ccjs_status ${wrapper.name}(void* context, ccjs_value ccjs_value_input, ccjs_value* out)`
}

function emitPromiseChainCallbackWrapperDeclaration(wrapper, baseContext) {
  const lines: string[] = []

  if (isPromiseChainCallbackWrapperWithContext(wrapper)) {
    lines.push(...emitRuntimeArrowCallbackContextFinalizerDeclaration(wrapper))
    lines.push('')
  }

  const context = createFunctionContext(baseContext, 'void')
  context.cleanupEnabled = false
  context.statusReturn = true
  context.runtimeCallbackReturnType = wrapper.returnType
  context.runtimeCallbackReturnShape = wrapper.returnShape ?? null
  context.runtimeCallbackReturnOut = '(*out)'
  context.runtimeCallbackCleanupLabel = 'ccjs_promise_callback_cleanup'
  const bodyLines = [
    ...emitRuntimeArrowCallbackContextLocals(wrapper, context),
    ...emitPromiseChainCallbackParamPrelude(wrapper, context)
  ]
  const statementLines = emitPromiseChainCallbackStatementLines(wrapper, context)

  lines.push(
    `${emitPromiseChainCallbackWrapperHead(wrapper)} {`,
    isPromiseChainCallbackWrapperWithContext(wrapper)
      ? '  if (context == 0) return CCJS_ERR_TYPE;'
      : '  (void)context;',
    '  if (out == 0) return CCJS_ERR_TYPE;',
    '  *out = ccjs_undefined_value();',
    ...bodyLines.map((line) => `  ${line}`),
    ...emitLoopFlowDeclarations(context).map((line) => `  ${line}`),
    ...emitReturnFlowDeclarations(context).map((line) => `  ${line}`),
    ...emitOwnedValueDeclarations(context).map((line) => `  ${line}`),
    ...emitErrorChannelDeclarations(context).map((line) => `  ${line}`),
    ...emitBoxedValueDeclarations(context).map((line) => `  ${line}`),
    ...statementLines.map((line) => `  ${line}`),
    ...(context.usedRuntimeCallbackCleanupGoto === true ? [`${context.runtimeCallbackCleanupLabel}:`] : []),
    ...emitOwnedValueCleanup(context).map((line) => `  ${line}`),
    ...emitBoxedValueCleanup(context).map((line) => `  ${line}`),
    '  return CCJS_OK;',
    '}'
  )

  return lines
}

function emitPromiseChainCallbackParamPrelude(wrapper, context) {
  const param = wrapper.expression.params[0]

  if (param == null) {
    return ['(void)ccjs_value_input;']
  }

  const valueType = param.valueType ?? 'unknown'
  context.variables.set(param.name, valueType)

  if (valueType === 'number') {
    return [
      emitRuntimeTypeCheck('ccjs_value_input.tag != CCJS_TAG_NUMBER', context),
      `double ${param.name} = ccjs_value_input.as.number;`
    ]
  }

  if (valueType === 'boolean') {
    return [
      emitRuntimeTypeCheck('ccjs_value_input.tag != CCJS_TAG_BOOL', context),
      `double ${param.name} = ccjs_value_input.as.boolean ? 1 : 0;`
    ]
  }

  if (valueType === 'string') {
    context.runtimeStrings.add(param.name)

    return [
      emitRuntimeTypeCheck('ccjs_value_input.tag != CCJS_TAG_STRING || ccjs_value_input.as.ref == 0', context),
      `ccjs_string* ${param.name} = (ccjs_string*)ccjs_value_input.as.ref;`
    ]
  }

  if (valueType === 'object') {
    return [
      emitRuntimeTypeCheck('ccjs_value_input.tag != CCJS_TAG_OBJECT || ccjs_value_input.as.ref == 0', context),
      `ccjs_value ${param.name} = ccjs_value_input;`
    ]
  }

  return [`ccjs_value ${param.name} = ccjs_value_input;`]
}

function emitPromiseChainCallbackStatementLines(wrapper, context) {
  const body = resolvePromiseChainArrowBody(wrapper.expression)

  if (body == null) {
    return []
  }

  if (body.kind === 'statement-list') {
    return emitStatementList(body.statements, context)
  }

  const prefixLines = emitStatementList(body.prefixStatements, context)

  return [...prefixLines, ...emitPromiseChainCallbackReturnLines(body.returnExpression, wrapper, context)]
}

function emitPromiseChainCallbackReturnLines(returnExpression, wrapper, context) {
  if (wrapper.returnType === 'number' || wrapper.returnType === 'boolean') {
    const value = emitPreparedNumberExpression(returnExpression, context)
    const expression =
      wrapper.returnType === 'number'
        ? `ccjs_number_value(${value.expression})`
        : `ccjs_bool_value((${value.expression}) != 0)`

    return [...value.lines, `*out = ${expression};`]
  }

  if (isManagedRuntimeReturnType(wrapper.returnType)) {
    return emitRuntimeCallbackRuntimeValueReturnLines(returnExpression, context)
  }

  return []
}

function isRuntimeCallbackWrapper(wrapper) {
  return wrapper.kind !== 'plain-arrow'
}

function emitPlainArrowCallbackWrapperHead(wrapper) {
  return `static ${emitFunctionPointerReturnType(wrapper.functionType)} ${wrapper.name}(${emitPlainArrowCallbackParams(wrapper)})`
}

function emitPlainArrowCallbackParams(wrapper) {
  const params = wrapper.functionType?.params ?? []

  if (params.length === 0) {
    return 'void'
  }

  return params
    .map((param, index) => `${emitCType(param.valueType)} ${plainArrowCallbackParamName(wrapper, index)}`)
    .join(', ')
}

function emitPlainArrowCallbackWrapperDeclaration(wrapper, baseContext) {
  const context = createFunctionContext(baseContext, wrapper.functionType?.returnType ?? 'void')
  context.cleanupEnabled = false

  for (const [index, param] of (wrapper.functionType?.params ?? []).entries()) {
    context.variables.set(plainArrowCallbackParamName(wrapper, index), param.valueType)
  }

  const statements = wrapper.expression.expressionBody
    ? [
        {
          type: 'ExpressionStatement',
          expression: wrapper.expression.body
        }
      ]
    : wrapper.expression.body
  const statementLines = emitStatementList(statements, context)
  const lines = [
    `${emitPlainArrowCallbackWrapperHead(wrapper)} {`,
    ...emitOwnedValueDeclarations(context).map((line) => `  ${line}`),
    ...emitBoxedValueDeclarations(context).map((line) => `  ${line}`),
    ...statementLines.map((line) => `  ${line}`)
  ]

  if (shouldEmitCleanupLabel(context)) {
    lines.push('ccjs_cleanup:')
    lines.push(...emitOwnedValueCleanup(context).map((line) => `  ${line}`))
    lines.push(...emitBoxedValueCleanup(context).map((line) => `  ${line}`))
    lines.push(`  ${emitCleanupReturn(context)}`)
  }

  lines.push('}')

  return lines
}

function plainArrowCallbackParamName(wrapper, index) {
  return wrapper.expression.params[index]?.name ?? `ccjs_arg_${index}`
}

function emitRuntimeCallbackWrapperDeclaration(wrapper, context) {
  if (wrapper.kind === 'arrow') {
    return emitRuntimeArrowCallbackWrapperDeclaration(wrapper, context)
  }

  const targetTakesEventLoop = functionTakesEventLoopParam(wrapper.target, context)
  const lines = [
    `${emitRuntimeCallbackWrapperHead(wrapper)} {`,
    targetTakesEventLoop ? '  if (context == 0) return CCJS_ERR_TYPE;' : '  (void)context;',
    `  if (out == 0 || arg_count != ${wrapper.functionType.params.length}${wrapper.functionType.params.length === 0 ? '' : ' || args == 0'}) return CCJS_ERR_TYPE;`,
    '  *out = ccjs_undefined_value();'
  ]
  const args: string[] = []

  for (const [index, param] of wrapper.functionType.params.entries()) {
    lines.push(...emitRuntimeCallbackWrapperArgChecks(param, index).map((line) => `  ${line}`))
    args.push(emitRuntimeCallbackWrapperArg(param, index))
  }

  const callArgs = targetTakesEventLoop ? ['(ccjs_loop*)context', ...args] : args
  const call = `${context.functionNames.get(wrapper.target) ?? emitCFunctionName(wrapper.target)}(${callArgs.join(', ')})`

  if (wrapper.functionType.returnType === 'number') {
    lines.push(`  *out = ccjs_number_value(${call});`)
  } else if (wrapper.functionType.returnType === 'boolean') {
    lines.push(`  *out = ccjs_bool_value((${call}) != 0);`)
  } else if (isManagedRuntimeReturnType(wrapper.functionType.returnType)) {
    lines.push(`  *out = ${call};`)
  } else {
    lines.push(`  ${call};`)
  }

  lines.push('  return CCJS_OK;')
  lines.push('}')

  return lines
}

function isRuntimeArrowCallbackWrapperWithContext(wrapper) {
  return wrapper.kind === 'arrow' && hasRuntimeArrowCallbackContext(wrapper)
}

function isPromiseChainCallbackWrapperWithContext(wrapper) {
  return wrapper.kind === 'promise-chain-arrow' && hasRuntimeArrowCallbackContext(wrapper)
}

function hasRuntimeArrowCallbackContext(wrapper) {
  return wrapper.captures.length > 0 || wrapper.needsEventLoop === true
}

function emitRuntimeArrowCallbackContextType(wrapper) {
  return [
    `typedef struct ${wrapper.contextTypeName} {`,
    ...(wrapper.needsEventLoop === true ? ['  ccjs_loop* ccjs_loop;'] : []),
    ...wrapper.captures.map(
      (capture) => `  ${emitRuntimeArrowCaptureCType(capture)} ${emitRuntimeArrowCaptureField(capture)};`
    ),
    `} ${wrapper.contextTypeName};`
  ]
}

function emitRuntimeArrowCallbackContextFinalizerDeclaration(wrapper) {
  const lines = [
    `static void ${wrapper.finalizerName}(void* context) {`,
    '  if (context == 0) return;',
    `  ${wrapper.contextTypeName}* captured = (${wrapper.contextTypeName}*)context;`
  ]

  for (const capture of wrapper.captures.filter(isRetainedRuntimeArrowCapture)) {
    lines.push(`  ccjs_release(captured->${emitRuntimeArrowCaptureField(capture)});`)
  }

  for (const capture of wrapper.captures.filter(isPromiseSettlementRuntimeArrowCapture)) {
    lines.push(`  if (captured->${emitRuntimeArrowCaptureField(capture)} != 0) {`)
    lines.push(`    ccjs_promise_release(captured->${emitRuntimeArrowCaptureField(capture)});`)
    lines.push('  }')
  }

  lines.push(
    `  ccjs_default_free(0, context, sizeof(${wrapper.contextTypeName}), _Alignof(${wrapper.contextTypeName}));`
  )
  lines.push('}')

  return lines
}

function emitRuntimeArrowCallbackWrapperDeclaration(wrapper, baseContext) {
  const lines: string[] = []

  if (isRuntimeArrowCallbackWrapperWithContext(wrapper)) {
    lines.push(...emitRuntimeArrowCallbackContextFinalizerDeclaration(wrapper))
    lines.push('')
  }

  const context = createFunctionContext(baseContext, 'void')
  context.cleanupEnabled = false
  context.statusReturn = true
  context.runtimeCallbackReturnType = wrapper.functionType.returnType
  context.runtimeCallbackReturnShape = wrapper.functionType.returnShape ?? null
  context.runtimeCallbackReturnOut = '(*out)'
  context.runtimeCallbackCleanupLabel = 'ccjs_callback_cleanup'
  const bodyLines: string[] = []

  bodyLines.push(...emitRuntimeArrowCallbackContextLocals(wrapper, context))
  bodyLines.push(...emitRuntimeArrowCallbackParamPrelude(wrapper, context))
  const statementLines = emitRuntimeArrowCallbackStatementLines(wrapper, context)

  lines.push(`${emitRuntimeCallbackWrapperHead(wrapper)} {`)

  if (isRuntimeArrowCallbackWrapperWithContext(wrapper)) {
    lines.push('  if (context == 0) return CCJS_ERR_TYPE;')
  } else {
    lines.push('  (void)context;')
  }

  lines.push(
    `  if (out == 0 || arg_count != ${wrapper.functionType.params.length}${wrapper.functionType.params.length === 0 ? '' : ' || args == 0'}) return CCJS_ERR_TYPE;`
  )
  lines.push('  *out = ccjs_undefined_value();')
  lines.push(...bodyLines.map((line) => `  ${line}`))
  lines.push(...emitLoopFlowDeclarations(context).map((line) => `  ${line}`))
  lines.push(...emitReturnFlowDeclarations(context).map((line) => `  ${line}`))
  lines.push(...emitOwnedValueDeclarations(context).map((line) => `  ${line}`))
  lines.push(...emitErrorChannelDeclarations(context).map((line) => `  ${line}`))
  lines.push(...emitBoxedValueDeclarations(context).map((line) => `  ${line}`))
  lines.push(...statementLines.map((line) => `  ${line}`))
  if (context.usedRuntimeCallbackCleanupGoto === true) {
    lines.push(`${context.runtimeCallbackCleanupLabel}:`)
  }
  lines.push(...emitOwnedValueCleanup(context).map((line) => `  ${line}`))
  lines.push(...emitBoxedValueCleanup(context).map((line) => `  ${line}`))
  lines.push('  return CCJS_OK;')
  lines.push('}')

  return lines
}

function emitRuntimeArrowCallbackStatementLines(wrapper, context) {
  if (wrapper.functionType.returnType === 'number' || wrapper.functionType.returnType === 'boolean') {
    if (!wrapper.expression.expressionBody) {
      return emitStatementList(wrapper.expression.body, context)
    }

    const value = emitPreparedNumberExpression(wrapper.expression.body, context)
    const expression =
      wrapper.functionType.returnType === 'number'
        ? `ccjs_number_value(${value.expression})`
        : `ccjs_bool_value((${value.expression}) != 0)`

    return [...value.lines, `*out = ${expression};`]
  }

  if (isManagedRuntimeReturnType(wrapper.functionType.returnType)) {
    if (!wrapper.expression.expressionBody) {
      return emitStatementList(wrapper.expression.body, context)
    }

    return emitRuntimeCallbackRuntimeValueReturnLines(wrapper.expression.body, context)
  }

  const statements = wrapper.expression.expressionBody
    ? [
        {
          type: 'ExpressionStatement',
          expression: wrapper.expression.body
        }
      ]
    : wrapper.expression.body

  return emitStatementList(statements, context)
}

function emitRuntimeArrowCallbackContextLocals(wrapper, context) {
  if (!hasRuntimeArrowCallbackContext(wrapper)) {
    return []
  }

  const lines = [`${wrapper.contextTypeName}* captured = (${wrapper.contextTypeName}*)context;`]

  if (wrapper.needsEventLoop === true) {
    context.eventLoopUsed = true
    context.externalEventLoop = true
    lines.push('if (captured->ccjs_loop == 0) return CCJS_ERR_TYPE;')
    lines.push('ccjs_loop* ccjs_loop = captured->ccjs_loop;')
  }

  for (const capture of wrapper.captures) {
    if (capture.valueType === 'promise-settlement') {
      const promise = capture.name

      context.promiseConstructorHandlers.set(capture.name, {
        kind: capture.promiseSettlementKind ?? 'resolve',
        promise
      })
      lines.push(`ccjs_promise* ${promise} = captured->${emitRuntimeArrowCaptureField(capture)};`)
      continue
    }

    context.variables.set(capture.name, capture.valueType)

    if (isSupportedMutableRuntimeArrowCapture(capture, context)) {
      context.boxedVariables.add(capture.name)

      if (capture.valueType === 'object') {
        registerObjectShape(context, capture.name, capture.shape)
      }

      lines.push(
        `${emitRuntimeArrowCaptureCType(capture)} ${capture.name} = captured->${emitRuntimeArrowCaptureField(capture)};`
      )
      continue
    }

    if (isRetainedRuntimeArrowCapture(capture)) {
      if (capture.valueType === 'string') {
        context.runtimeStrings.add(capture.name)
        lines.push(
          `ccjs_string* ${capture.name} = (ccjs_string*)captured->${emitRuntimeArrowCaptureField(capture)}.as.ref;`
        )
        continue
      }

      if (capture.valueType === 'object') {
        registerObjectShape(context, capture.name, capture.shape)
        lines.push(`ccjs_value ${capture.name} = captured->${emitRuntimeArrowCaptureField(capture)};`)
        continue
      }
    }

    lines.push(
      `${emitRuntimeArrowCaptureCType(capture)} ${capture.name} = captured->${emitRuntimeArrowCaptureField(capture)};`
    )
  }

  return lines
}

function emitRuntimeArrowCallbackParamPrelude(wrapper, context) {
  const lines: string[] = []

  for (const [index, param] of wrapper.functionType.params.entries()) {
    const name = wrapper.expression.params[index]?.name ?? `ccjs_arg_${index}`

    lines.push(...emitRuntimeCallbackWrapperArgChecks(param, index))
    context.variables.set(name, param.valueType)

    if (param.valueType === 'string') {
      context.runtimeStrings.add(name)
      lines.push(`ccjs_string* ${name} = (ccjs_string*)args[${index}].as.ref;`)
      continue
    }

    if (param.valueType === 'object') {
      registerObjectShape(context, name, param.shape)
      lines.push(`ccjs_value ${name} = args[${index}];`)
      continue
    }

    if (param.valueType === 'number') {
      lines.push(`double ${name} = args[${index}].as.number;`)
      continue
    }

    if (param.valueType === 'boolean') {
      lines.push(`double ${name} = args[${index}].as.boolean ? 1 : 0;`)
    }
  }

  return lines
}

function emitRuntimeArrowCaptureCType(capture) {
  if (capture.mutable) {
    if (['number', 'boolean'].includes(capture.valueType)) {
      return 'double*'
    }

    if (['string', 'object'].includes(capture.valueType)) {
      return 'ccjs_value*'
    }
  }

  if (isRetainedRuntimeArrowCapture(capture)) {
    return 'ccjs_value'
  }

  if (capture.valueType === 'promise-settlement') {
    return 'ccjs_promise*'
  }

  if (capture.valueType === 'string') {
    return 'const char*'
  }

  if (capture.valueType === 'timer') {
    return 'ccjs_timer_handle*'
  }

  return 'double'
}

function emitRuntimeArrowCaptureField(capture) {
  return emitCIdentifier(capture.name)
}

function isRetainedRuntimeArrowCapture(capture) {
  return capture.runtimeManaged === true && ['string', 'object'].includes(capture.valueType) && !capture.mutable
}

function isPromiseSettlementRuntimeArrowCapture(capture) {
  return capture.valueType === 'promise-settlement'
}

function isSupportedMutableRuntimeArrowCapture(capture, context) {
  return (
    capture.mutable &&
    ['number', 'boolean', 'string', 'object'].includes(capture.valueType) &&
    capture.declaration != null &&
    context.boxedMutableCaptureDeclarations.has(capture.declaration)
  )
}

function emitRuntimeCallbackWrapperArgChecks(param, index) {
  if (param.valueType === 'string') {
    return [`if (args[${index}].tag != CCJS_TAG_STRING || args[${index}].as.ref == 0) return CCJS_ERR_TYPE;`]
  }

  if (param.valueType === 'object') {
    return [`if (args[${index}].tag != CCJS_TAG_OBJECT || args[${index}].as.ref == 0) return CCJS_ERR_TYPE;`]
  }

  if (param.valueType === 'number') {
    return [`if (args[${index}].tag != CCJS_TAG_NUMBER) return CCJS_ERR_TYPE;`]
  }

  if (param.valueType === 'boolean') {
    return [`if (args[${index}].tag != CCJS_TAG_BOOL) return CCJS_ERR_TYPE;`]
  }

  return []
}

function emitRuntimeCallbackWrapperArg(param, index) {
  if (param.valueType === 'number') {
    return `args[${index}].as.number`
  }

  if (param.valueType === 'boolean') {
    return `(args[${index}].as.boolean ? 1 : 0)`
  }

  return `args[${index}]`
}

function emitFunctionPointerReturnType(functionType) {
  return emitCType(functionType?.returnType ?? 'void')
}

function emitFunctionPointerParams(functionType) {
  if (functionType == null || functionType.params.length === 0) {
    return 'void'
  }

  return functionType.params.map((param) => emitCType(param.valueType)).join(', ')
}

function emitMainWrapper(irPrograms, baseContext) {
  const context = createFunctionContext(baseContext, 'number')
  const body = collectIrTopLevelNodesFromPrograms(irPrograms, 'statement')
  const bodyLines: string[] = []
  const lines = ['int main(void) {']

  bodyLines.push(...emitStatementList(body, context).map((line) => `  ${line}`))

  lines.push(...emitLoopFlowDeclarations(context).map((line) => `  ${line}`))
  lines.push(...emitReturnValueDeclarations(context).map((line) => `  ${line}`))
  lines.push(...emitReturnFlowDeclarations(context).map((line) => `  ${line}`))
  lines.push(...emitEventLoopDeclarations(context).map((line) => `  ${line}`))
  lines.push(...emitOwnedValueDeclarations(context).map((line) => `  ${line}`))
  lines.push(...emitOwnedPromiseDeclarations(context).map((line) => `  ${line}`))
  lines.push(...emitErrorChannelDeclarations(context).map((line) => `  ${line}`))
  lines.push(...emitBoxedValueDeclarations(context).map((line) => `  ${line}`))
  lines.push(...emitEventLoopInit(context).map((line) => `  ${line}`))
  lines.push(...bodyLines)
  lines.push(...emitEventLoopDrain(context).map((line) => `  ${line}`))

  if (shouldEmitCleanupLabel(context)) {
    lines.push('ccjs_cleanup:')
    lines.push(...emitOwnedValueCleanup(context).map((line) => `  ${line}`))
    lines.push(...emitOwnedPromiseCleanup(context).map((line) => `  ${line}`))
    lines.push(...emitEventLoopCleanup(context).map((line) => `  ${line}`))
    lines.push(...emitBoxedValueCleanup(context).map((line) => `  ${line}`))
  }

  lines.push(`  return ${emitMainReturnExpression(context)};`)
  lines.push('}')

  return lines
}

function emitMainReturnExpression(context) {
  const successReturn = context.returnType === 'number' ? '(int)ccjs_return' : '0'

  return context.unhandledRejectionFlag == null
    ? successReturn
    : `${context.unhandledRejectionFlag} == 0 ? ${successReturn} : 1`
}

function emitRuntimeParamPrelude(statement, context) {
  const params = resolveFunctionDeclarationParams(statement.name, statement.params, context)

  return emitRuntimeParamPreludeForParams(statement, params, context)
}

function emitRuntimeParamPreludeForParams(statement, params, context) {
  return params.flatMap((param, index) => {
    if (isNullableScalarParam(param)) {
      const paramName = emitCScalarParamName(param.name)
      const expectedTag = cRuntimeValueTag(param.valueType)

      return [
        ...emitRuntimeNullableValueCheck(paramName, expectedTag, context),
        `ccjs_value ${param.name} = ${paramName};`
      ]
    }

    if (isBoxedFunctionParam(param, index, statement, context) && ['string', 'object'].includes(param.valueType)) {
      const paramName =
        param.valueType === 'string' ? emitCStringParamName(param.name) : emitCObjectParamName(param.name)
      const tag = param.valueType === 'string' ? 'CCJS_TAG_STRING' : 'CCJS_TAG_OBJECT'

      return [
        emitRuntimeTypeCheck(`${paramName}.tag != ${tag} || ${paramName}.as.ref == 0`, context),
        `${param.name} = ccjs_default_alloc(0, sizeof(ccjs_value), _Alignof(ccjs_value));`,
        `if (${param.name} == 0) ${emitFailureStatement(context)}`,
        `*${param.name} = ${paramName};`,
        `ccjs_retain(*${param.name});`
      ]
    }

    if (param.valueType === 'string') {
      const paramName = emitCStringParamName(param.name)

      return [
        emitRuntimeTypeCheck(`${paramName}.tag != CCJS_TAG_STRING || ${paramName}.as.ref == 0`, context),
        `ccjs_string* ${param.name} = (ccjs_string*)${paramName}.as.ref;`
      ]
    }

    if (param.valueType === 'object') {
      return [emitRuntimeTypeCheck(`${param.name}.tag != CCJS_TAG_OBJECT || ${param.name}.as.ref == 0`, context)]
    }

    if (param.valueType === 'array' || param.valueType === 'map' || param.valueType === 'set') {
      const tag = cRuntimeValueTag(param.valueType)

      return [emitRuntimeTypeCheck(`${param.name}.tag != ${tag} || ${param.name}.as.ref == 0`, context)]
    }

    if (
      param.valueType === 'function' &&
      resolveFunctionParameterRuntimeType(statement.name, index, param, context) != null
    ) {
      if (param.nullable === true) {
        return emitRuntimeNullableValueCheck(param.name, 'CCJS_TAG_FUNCTION', context)
      }

      return [emitRuntimeTypeCheck(`${param.name}.tag != CCJS_TAG_FUNCTION || ${param.name}.as.ref == 0`, context)]
    }

    if (isBoxedFunctionParam(param, index, statement, context) && ['number', 'boolean'].includes(param.valueType)) {
      return [
        `${param.name} = ccjs_default_alloc(0, sizeof(double), _Alignof(double));`,
        `if (${param.name} == 0) ${emitFailureStatement(context)}`,
        `*${param.name} = ${emitCScalarParamName(param.name)};`
      ]
    }

    return []
  })
}

function emitThrowingFunctionPrelude(context) {
  if (!context.throwingFunction) {
    return []
  }

  return [
    `if (${context.functionErrorOut} == 0${context.returnType === 'void' ? '' : ` || ${context.functionReturnOut} == 0`}) return CCJS_ERR_TYPE;`,
    `*${context.functionErrorOut} = ccjs_undefined_value();`,
    ...(context.returnType === 'void'
      ? []
      : [`*${context.functionReturnOut} = ${isThrowingFunctionRuntimeOut(context) ? 'ccjs_undefined_value()' : '0'};`])
  ]
}

function emitStatement(statement, context) {
  if (statement.type === 'BlockStatement') {
    return withVariableScope(context, () => [
      '{',
      ...emitStatementBody(statement, context).map((line) => `  ${line}`),
      '}'
    ])
  }

  if (statement.type === 'IfStatement') {
    return emitIfStatement(statement, context)
  }

  if (statement.type === 'WhileStatement') {
    return emitWhileStatement(statement, context)
  }

  if (statement.type === 'ForStatement') {
    return emitForStatement(statement, context)
  }

  if (statement.type === 'ForOfStatement') {
    return emitForOfStatement(statement, context)
  }

  if (statement.type === 'SwitchStatement') {
    return emitSwitchStatement(statement, context)
  }

  if (statement.type === 'TryStatement') {
    return emitTryStatement(statement, context)
  }

  if (statement.type === 'ThrowStatement') {
    return emitThrowStatement(statement, context)
  }

  if (statement.type === 'BreakStatement') {
    return emitBreakJump(context)
  }

  if (statement.type === 'ContinueStatement') {
    return emitContinueJump(context)
  }

  if (statement.type === 'VariableDeclaration') {
    const dgramSocket = emitDgramSocketVariableDeclaration(statement, context)

    if (dgramSocket != null) {
      return dgramSocket
    }

    const dgramNumber = emitDgramNumberVariableDeclaration(statement, context)

    if (dgramNumber != null) {
      return dgramNumber
    }

    const dgramAddress = emitDgramAddressVariableDeclaration(statement, context)

    if (dgramAddress != null) {
      return dgramAddress
    }

    const httpServer = emitHttpServerVariableDeclaration(statement, context)

    if (httpServer != null) {
      return httpServer
    }

    const netServer = emitNetServerVariableDeclaration(statement, context)

    if (netServer != null) {
      return netServer
    }

    const netSocket = emitNetSocketVariableDeclaration(statement, context)

    if (netSocket != null) {
      return netSocket
    }

    const netAddress = emitNetAddressVariableDeclaration(statement, context)

    if (netAddress != null) {
      return netAddress
    }

    const netAddressMember = emitNetAddressMemberVariableDeclaration(statement, context)

    if (netAddressMember != null) {
      return netAddressMember
    }

    const netNumber = emitNetNumberVariableDeclaration(statement, context)

    if (netNumber != null) {
      return netNumber
    }

    const fetchAbortController = emitFetchAbortControllerVariableDeclaration(statement, context)

    if (fetchAbortController != null) {
      return fetchAbortController
    }

    const asyncPromiseCall = emitPreparedAsyncFunctionPromiseCallExpression(statement.init, context, {
      out: statement.name
    })

    if (asyncPromiseCall != null) {
      return asyncPromiseCall.lines
    }

    const promiseMethod = emitPreparedPromiseMethodExpression(statement.init, context, {
      out: statement.name
    })

    if (promiseMethod != null) {
      return promiseMethod.lines
    }

    const fetchCall = emitPreparedFetchCallExpression(statement.init, context, {
      out: statement.name
    })

    if (fetchCall != null) {
      return fetchCall.lines
    }

    const fsCall = emitPreparedFsCallExpression(statement.init, context, {
      out: statement.name
    })

    if (fsCall != null) {
      return fsCall.lines
    }

    const promiseConstructor = emitPreparedPromiseConstructorExpression(statement.init, context, {
      out: statement.name
    })

    if (promiseConstructor != null) {
      return promiseConstructor.lines
    }

    const promise = emitPreparedPromiseStaticExpression(statement.init, context, {
      out: statement.name
    })

    if (promise != null) {
      return promise.lines
    }

    const promiseCall = emitPreparedPromiseReturningCallExpression(statement.init, context, {
      out: statement.name
    })

    if (promiseCall != null) {
      return promiseCall.lines
    }

    if (isCollectionConstructorExpression(statement.init)) {
      return emitCollectionVariableDeclaration(statement, context)
    }

    const arrayMapCall = emitPreparedArrayMapCallExpression(statement.init, context)

    if (arrayMapCall != null) {
      return emitArrayMapVariableDeclaration(statement, arrayMapCall, context)
    }

    const arrayFilterCall = emitPreparedArrayFilterCallExpression(statement.init, context)

    if (arrayFilterCall != null) {
      return emitArrayFilterVariableDeclaration(statement, arrayFilterCall, context)
    }

    const arraySortCall = emitPreparedArraySortCallExpression(statement.init, context)

    if (arraySortCall != null) {
      return emitArraySortVariableDeclaration(statement, arraySortCall, context)
    }

    const fetchHeadersCall = emitPreparedFetchHeadersCallExpression(statement.init, context, {
      out: statement.name
    })

    if (fetchHeadersCall != null && statement.valueType === 'boolean') {
      context.variables.set(statement.name, 'boolean')
      return fetchHeadersCall.lines
    }

    if (statement.nullable === true && isRuntimeNullableType(statement.valueType)) {
      return emitNullableRuntimeValueVariableDeclaration(statement, context)
    }

    if (isErrorConstructorExpression(statement.init)) {
      return emitErrorObjectVariableDeclaration(statement, context)
    }

    if (isClassConstructorExpression(statement.init, context)) {
      return emitClassObjectVariableDeclaration(statement, context)
    }

    const jsonParseDeclaration = emitJsonParseVariableDeclaration(statement, context)

    if (jsonParseDeclaration != null) {
      return jsonParseDeclaration
    }

    if (statement.init?.type === 'ObjectLiteral') {
      if (context.boxedMutableCaptureDeclarations.has(statement)) {
        return emitBoxedObjectVariableDeclaration(statement, context)
      }

      return emitObjectVariableDeclaration(statement, context)
    }

    if (statement.init?.type === 'ArrayLiteral') {
      return emitArrayVariableDeclaration(statement, context)
    }

    if (isMemberAccessExpression(statement.init)) {
      const member = resolveKnownObjectMember(statement.init, context)

      if (member != null) {
        return emitKnownObjectMemberVariableDeclaration(statement, member, context)
      }
    }

    if (isIndexAccessExpression(statement.init)) {
      const direntElement = emitDirentArrayIndexVariableDeclaration(statement, context)

      if (direntElement != null) {
        return direntElement
      }

      const element = resolveKnownArrayIndex(statement.init, context)

      if (element != null) {
        return emitKnownArrayIndexVariableDeclaration(statement, element, context)
      }

      const field = resolveKnownObjectIndex(statement.init, context)

      if (field != null) {
        return emitDynamicObjectMemberVariableDeclaration(statement, field, context)
      }
    }

    if (isRuntimeValueLocalExpression(statement.init, context)) {
      return emitRuntimeValueVariableDeclaration(statement, statement.init, context)
    }

    if (isIndexAccessExpression(statement.init)) {
      const runtimeElement = resolveRuntimeArrayIndex(statement.init, context)

      if (runtimeElement?.valueType === 'object') {
        return emitRuntimeValueVariableDeclaration(statement, statement.init, context)
      }
    }

    if (statement.init?.type === 'CallExpression' && statement.nullable !== true && inferExpressionType(statement.init, context) === 'string') {
      return emitRuntimeStringVariableDeclaration(statement, statement.init, context)
    }

    return emitScalarVariableDeclaration(statement, context)
  }

  if (statement.type === 'ExpressionStatement' && isConsoleLog(statement.expression)) {
    return emitConsoleLogStatement(statement.expression.callee.property, statement.expression.args, context)
  }

  if (statement.type === 'ExpressionStatement') {
    const promiseSettlement = emitPromiseConstructorSettlementCall(statement.expression, context)

    if (promiseSettlement != null) {
      return promiseSettlement
    }
  }

  if (statement.type === 'ExpressionStatement' && statement.expression.type === 'CallExpression') {
    const dgramSocketCall = emitDgramSocketCallStatement(statement.expression, context)

    if (dgramSocketCall != null) {
      return dgramSocketCall
    }

    const httpServerCall = emitHttpServerCallStatement(statement.expression, context)

    if (httpServerCall != null) {
      return httpServerCall
    }

    const netServerCall = emitNetServerCallStatement(statement.expression, context)

    if (netServerCall != null) {
      return netServerCall
    }

    const netSocketCall = emitNetSocketCallStatement(statement.expression, context)

    if (netSocketCall != null) {
      return netSocketCall
    }

    const arrayPopCall = emitPreparedArrayPopCallExpression(statement.expression, context, {
      discard: true
    })

    if (arrayPopCall != null) {
      return arrayPopCall.lines
    }

    const arrayPushCall = emitPreparedArrayPushCallExpression(statement.expression, context)

    if (arrayPushCall != null) {
      return arrayPushCall.lines
    }

    const arrayMapCall = emitPreparedArrayMapCallExpression(statement.expression, context)

    if (arrayMapCall != null) {
      return arrayMapCall.lines
    }

    const arrayFilterCall = emitPreparedArrayFilterCallExpression(statement.expression, context)

    if (arrayFilterCall != null) {
      return arrayFilterCall.lines
    }

    const arraySortCall = emitPreparedArraySortCallExpression(statement.expression, context)

    if (arraySortCall != null) {
      return arraySortCall.lines
    }

    const classMethodCall = emitPreparedClassMethodCallExpression(statement.expression, context)

    if (classMethodCall != null) {
      return classMethodCall.expression === ''
        ? classMethodCall.lines
        : [...classMethodCall.lines, `${classMethodCall.expression};`]
    }

    const fetchAbortCall = emitFetchAbortControllerAbortStatement(statement.expression, context)

    if (fetchAbortCall != null) {
      return fetchAbortCall
    }

    if (isArrayMethodCall(statement.expression)) {
      context.diagnostics.push(
        diagnostic(
          'CCJS_C_ARRAY_METHOD',
          'array methods are not supported by the current C backend slice',
          statement.loc
        )
      )
      return []
    }

    const collectionCall = emitPreparedCollectionCallExpression(statement.expression, context)

    if (collectionCall != null) {
      return collectionCall.lines
    }

    const cryptoCall = emitPreparedCryptoCallExpression(statement.expression, context, {
      discard: true
    })

    if (cryptoCall != null) {
      return cryptoCall.lines
    }

    const fetchCall = emitPreparedFetchCallExpression(statement.expression, context)

    if (fetchCall != null) {
      return fetchCall.lines
    }

    const fsCall = emitPreparedFsCallExpression(statement.expression, context)

    if (fsCall != null) {
      return fsCall.lines
    }

    const fsSyncCall = emitPreparedFsSyncStatementExpression(statement.expression, context)

    if (fsSyncCall != null) {
      return fsSyncCall.lines
    }

    const timerCall = emitPreparedTimerCallExpression(statement.expression, context)

    if (timerCall != null) {
      return timerCall.lines
    }

    const promise = emitPreparedPromiseStaticExpression(statement.expression, context)

    if (promise != null) {
      return promise.lines
    }

    const call = emitPreparedCallExpression(statement.expression, context)

    return call.expression === '' ? call.lines : [...call.lines, `${call.expression};`]
  }

  if (statement.type === 'ExpressionStatement' && statement.expression.type === 'AwaitExpression') {
    const value = emitCAwaitValueExpression(statement.expression, context)

    return value.lines
  }

  if (statement.type === 'ExpressionStatement' && statement.expression.type === 'UpdateExpression') {
    const value = emitPreparedUpdateExpression(statement.expression, context)

    return [...value.lines, `${value.expression};`]
  }

  if (statement.type === 'ExpressionStatement' && statement.expression.type === 'AssignmentExpression') {
    const mapIndexAssignment = emitPreparedMapIndexAssignment(statement.expression, context)

    if (mapIndexAssignment != null) {
      return mapIndexAssignment.lines
    }

    if (statement.expression.target.type === 'MemberExpression') {
      const member = resolveKnownObjectMember(statement.expression.target, context)

      if (member != null) {
        return emitKnownObjectMemberAssignment(statement.expression, member, context)
      }
    }

    if (statement.expression.target.type === 'IndexExpression') {
      const bytesIndexAssignment = emitPreparedBytesIndexAssignment(statement.expression, context)

      if (bytesIndexAssignment != null) {
        return bytesIndexAssignment.lines
      }

      const element = resolveKnownArrayIndex(statement.expression.target, context)

      if (element != null) {
        return emitKnownArrayIndexAssignment(statement.expression, element, context)
      }

      const field = resolveKnownObjectIndex(statement.expression.target, context)

      if (field != null) {
        return emitDynamicObjectMemberAssignment(statement.expression, field, context)
      }
    }

    const valueType = inferExpressionType(statement.expression.value, context)

    if (isNullableRuntimeValueAssignment(statement.expression, context)) {
      return emitNullableRuntimeValueAssignment(statement.expression, context)
    }

    if (isBoxedRuntimeValueAssignment(statement.expression, context)) {
      return emitBoxedRuntimeValueAssignment(statement.expression, context)
    }

    if (valueType === 'number' || valueType === 'boolean') {
      const value = emitPreparedNumberExpression(statement.expression.value, context)

      return [...value.lines, `${emitReference(statement.expression.target, context)} = ${value.expression};`]
    }

    return [
      `${emitReference(statement.expression.target, context)} = ${emitCExpression(statement.expression.value, context)};`
    ]
  }

  if (statement.type === 'ReturnStatement') {
    const argument = normalizeCAsyncReturnArgument(statement.argument, context, statement.loc)
    const returnStatement =
      argument === statement.argument
        ? statement
        : {
            ...statement,
            argument
          }

    if (isRuntimeCallbackReturnContext(context)) {
      return emitRuntimeCallbackReturnStatement(returnStatement, context)
    }

    if (context.returnType === 'promise') {
      return emitPromiseReturnStatement(returnStatement, context)
    }

    if (context.returnNullable === true && isNullableScalarType(context.returnType)) {
      return emitNullableScalarReturnStatement(returnStatement, context)
    }

    if (isManagedRuntimeReturnType(context.returnType)) {
      return emitRuntimeValueReturnStatement(returnStatement, context)
    }

    if (context.returnType !== 'void') {
      const value =
        argument == null
          ? {
              lines: [],
              expression: '0'
            }
          : emitPreparedNumberExpression(argument, context)

      return [...value.lines, `ccjs_return = ${value.expression};`, ...emitReturnJump(context)]
    }

    const value = argument?.type === 'AwaitExpression' ? emitCAwaitValueExpression(argument, context) : null

    if (argument == null || context.returnType === 'void') {
      if (context.cleanupEnabled) {
        return [...(value?.lines ?? []), ...emitReturnJump(context)]
      }

      return ['return;']
    }

    return [`return ${emitCExpression(argument, context)};`]
  }

  if (statement.type === 'ExpressionStatement' && statement.expression.type === 'OptionalCallExpression') {
    return emitOptionalRuntimeCallbackCallExpression(statement.expression, context)
  }

  return []
}

function normalizeCAsyncReturnArgument(argument, context, loc) {
  if (
    argument == null ||
    context.returnType === 'promise' ||
    (argument.valueType !== 'promise' && inferExpressionType(argument, context) !== 'promise')
  ) {
    return argument
  }

  return {
    type: 'AwaitExpression',
    argument,
    valueType: context.returnType,
    loc
  }
}

function emitPromiseReturnStatement(statement, context) {
  const promise = emitPreparedPromiseExpression(statement.argument, context, {
    out: 'ccjs_return',
    owned: false
  })

  if (promise == null) {
    context.diagnostics.push(
      diagnostic(
        'CCJS_C_ASYNC',
        'this Promise return expression is not supported by the current C backend slice',
        statement.loc
      )
    )

    return emitReturnJump(context)
  }

  return [...promise.lines, ...emitReturnJump(context)]
}

function emitIfStatement(statement, context) {
  const condition = emitPreparedNumberExpression(statement.condition, context)
  const narrowing = resolveNullableScalarConditionNarrowing(statement.condition, context)
  const lines = [
    ...condition.lines,
    `if ${emitCConditionClause(condition.expression)} {`,
    ...withVariableScope(context, () =>
      withNullableScalarNarrowing(context, narrowing.trueNames, () => emitStatementBody(statement.consequent, context))
    ).map((line) => `  ${line}`)
  ]

  if (statement.alternate == null) {
    lines.push('}')
    return lines
  }

  lines.push('} else {')
  lines.push(
    ...withVariableScope(context, () =>
      withNullableScalarNarrowing(context, narrowing.falseNames, () => emitStatementBody(statement.alternate, context))
    ).map((line) => `  ${line}`)
  )
  lines.push('}')

  return lines
}

function emitWhileStatement(statement, context) {
  const condition = emitPreparedNumberExpression(statement.condition, context)
  const narrowing = resolveNullableScalarConditionNarrowing(statement.condition, context)
  const breakLabel = nextCName(context, 'ccjs_break')
  const continueLabel = nextCName(context, 'ccjs_continue')
  const body = withBreakTarget(context, breakLabel, false, () =>
    withContinueTarget(context, continueLabel, false, () =>
      withVariableScope(context, () =>
        withNullableScalarNarrowing(context, narrowing.trueNames, () => emitStatementBody(statement.body, context))
      )
    )
  )

  if (condition.lines.length === 0) {
    return [
      `while ${emitCConditionClause(condition.expression)} {`,
      ...body.map((line) => `  ${line}`),
      ...emitContinueTargetLabel(continueLabel, context),
      '}',
      ...emitBreakTargetLabel(breakLabel, context)
    ]
  }

  return [
    'while (1) {',
    ...condition.lines.map((line) => `  ${line}`),
    `  if ${emitCNegatedConditionClause(condition.expression)} break;`,
    ...body.map((line) => `  ${line}`),
    ...emitContinueTargetLabel(continueLabel, context),
    '}',
    ...emitBreakTargetLabel(breakLabel, context)
  ]
}

function emitForStatement(statement, context) {
  return withVariableScope(context, () => {
    const init = emitPreparedForInitializer(statement.init, context)
    const test = emitPreparedForExpressionClause(statement.test, context)
    const update = emitPreparedForExpressionClause(statement.update, context)
    const narrowing = resolveNullableScalarConditionNarrowing(statement.test, context)
    const breakLabel = nextCName(context, 'ccjs_break')
    const continueLabel = nextCName(context, 'ccjs_continue')
    const body = withBreakTarget(context, breakLabel, false, () =>
      withContinueTarget(context, continueLabel, false, () =>
        withVariableScope(context, () =>
          withNullableScalarNarrowing(context, narrowing.trueNames, () => emitStatementBody(statement.body, context))
        )
      )
    )
    const needsPreparedLowering = init.lines.length > 0 || test.lines.length > 0 || update.lines.length > 0

    if (!needsPreparedLowering) {
      return [
        `for (${init.expression}; ${test.expression}; ${update.expression}) {`,
        ...body.map((line) => `  ${line}`),
        ...emitContinueTargetLabel(continueLabel, context),
        '}',
        ...emitBreakTargetLabel(breakLabel, context)
      ]
    }

    const lines = ['{']

    lines.push(...init.lines.map((line) => `  ${line}`))

    if (init.expression !== '') {
      lines.push(`  ${init.expression};`)
    }

    lines.push('  for (;;) {')
    lines.push(...test.lines.map((line) => `    ${line}`))

    if (test.expression !== '') {
      lines.push(`    if ${emitCNegatedConditionClause(test.expression)} break;`)
    }

    lines.push(...body.map((line) => `    ${line}`))
    lines.push(...emitContinueTargetLabel(continueLabel, context).map((line) => `  ${line}`))
    lines.push(...update.lines.map((line) => `    ${line}`))

    if (update.expression !== '') {
      lines.push(`    ${update.expression};`)
    }

    lines.push('  }')
    lines.push(...emitBreakTargetLabel(breakLabel, context).map((line) => `  ${line}`))
    lines.push('}')

    return lines
  })
}

function emitCConditionClause(expression: string): string {
  const trimmed = expression.trim()

  return isWrappedCExpression(trimmed) ? trimmed : `(${trimmed})`
}

function emitCNegatedConditionClause(expression: string): string {
  return `(!${emitCConditionClause(expression)})`
}

function isWrappedCExpression(expression: string): boolean {
  if (!expression.startsWith('(') || !expression.endsWith(')')) {
    return false
  }

  let depth = 0

  for (let index = 0; index < expression.length; index += 1) {
    const char = expression[index]

    if (char === '(') {
      depth += 1
    } else if (char === ')') {
      depth -= 1

      if (depth === 0 && index < expression.length - 1) {
        return false
      }
    }

    if (depth < 0) {
      return false
    }
  }

  return depth === 0
}

function emitForOfStatement(statement, context) {
  const setup: string[] = []
  let array: any = resolveKnownForOfArray(statement.iterable, context)
  let runtimeArray: any = null
  let runtimeMap: any = null
  let runtimeSet: any = null

  if (array == null && statement.iterable?.type === 'ArrayLiteral') {
    const name = nextCName(context, 'ccjs_for_array')

    setup.push(
      ...emitArrayVariableDeclaration(
        {
          kind: 'const',
          name,
          init: statement.iterable
        },
        context
      )
    )
    array = resolveKnownForOfArray(
      {
        type: 'Reference',
        path: [name]
      },
      context
    )
  }

  if (array == null) {
    runtimeArray = resolveRuntimeForOfArray(statement.iterable, context)
  }

  if (array == null && runtimeArray == null) {
    runtimeMap = resolveRuntimeForOfMap(statement.iterable, context)
  }

  if (runtimeMap != null) {
    return emitRuntimeMapForOfStatement(statement, runtimeMap, context)
  }

  if (array == null && runtimeArray == null) {
    runtimeSet = resolveRuntimeForOfSet(statement.iterable, context)
  }

  if (runtimeSet != null) {
    return emitRuntimeSetForOfStatement(statement, runtimeSet, context)
  }

  if (array == null && runtimeArray == null) {
    context.diagnostics.push(
      diagnostic('CCJS_C_FOR_OF', 'C for...of currently supports arrays, Map values and Set values', statement.loc)
    )
    return []
  }

  const elementType = runtimeArray?.elementType ?? resolveForOfElementType(array.elements)

  if (!['number', 'boolean', 'string'].includes(elementType)) {
    context.diagnostics.push(
      diagnostic(
        'CCJS_C_FOR_OF',
        'C for...of currently supports only uniform number/boolean/string arrays',
        statement.loc
      )
    )
    return []
  }

  const index = nextCName(context, 'ccjs_for_index')
  const value = nextCName(context, 'ccjs_for_value')
  const length = runtimeArray == null ? `${array.elements.length}` : nextCName(context, 'ccjs_for_length')
  const arrayName = runtimeArray?.name ?? array.name
  const breakLabel = nextCName(context, 'ccjs_break')
  const continueLabel = nextCName(context, 'ccjs_continue')
  const loopValue = elementType === 'boolean' ? `((double)(${value}.as.boolean ? 1 : 0))` : `${value}.as.number`

  registerOwnedValue(context, value)

  return withVariableScope(context, () => {
    context.variables.set(statement.name, elementType)
    if (elementType === 'string') {
      context.runtimeStrings.add(statement.name)
    }
    const body = withBreakTarget(context, breakLabel, false, () =>
      withContinueTarget(context, continueLabel, false, () =>
        withVariableScope(context, () => emitStatementBody(statement.body, context))
      )
    )
    const declaration =
      elementType === 'string'
        ? `ccjs_string* ${statement.name} = (ccjs_string*)${value}.as.ref;`
        : `double ${statement.name} = ${loopValue};`
    const checks =
      elementType === 'string'
        ? [emitRuntimeTypeCheck(`${value}.tag != CCJS_TAG_STRING || ${value}.as.ref == 0`, context)]
        : []

    return [
      ...setup,
      ...(runtimeArray?.lines ?? []),
      ...(runtimeArray == null
        ? []
        : [`size_t ${length} = 0;`, emitStatusCheck(`ccjs_array_len(${arrayName}, &${length})`, context)]),
      `for (size_t ${index} = 0; ${index} < ${length}; ${index} += 1) {`,
      ...emitPrepareOwnedValueWrite(value).map((line) => `  ${line}`),
      `  ${emitStatusCheck(`ccjs_array_get(${arrayName}, ${index}, &${value})`, context)}`,
      ...checks.map((line) => `  ${line}`),
      `  ${declaration}`,
      ...body.map((line) => `  ${line}`),
      ...emitContinueTargetLabel(continueLabel, context),
      '}',
      ...emitBreakTargetLabel(breakLabel, context),
      ...emitPrepareOwnedValueWrite(value)
    ]
  })
}

function emitRuntimeMapForOfStatement(statement, runtimeMap, context) {
  const keyType = runtimeMap.keyType ?? 'unknown'
  const valueType = runtimeMap.valueType ?? 'unknown'

  if (!['number', 'boolean', 'string'].includes(keyType) || !['number', 'boolean', 'string'].includes(valueType)) {
    context.diagnostics.push(
      diagnostic(
        'CCJS_C_FOR_OF',
        'C for...of currently supports only Map entries with number/boolean/string keys and values',
        statement.loc
      )
    )
    return []
  }

  const index = nextCName(context, 'ccjs_for_map_index')
  const map = nextCName(context, 'ccjs_for_map')
  const shapeName = nextCName(context, 'ccjs_shape_map_entry')
  const fieldsName = `${shapeName}_fields`
  const breakLabel = nextCName(context, 'ccjs_break')
  const continueLabel = nextCName(context, 'ccjs_continue')
  const fields = [
    {
      name: 'key',
      readonly: true,
      valueType: keyType
    },
    {
      name: 'value',
      readonly: true,
      valueType
    }
  ]

  registerOwnedValue(context, statement.name)

  return withVariableScope(context, () => {
    context.variables.set(statement.name, 'object')
    context.objectShapes.set(statement.name, fields)
    const body = withBreakTarget(context, breakLabel, false, () =>
      withContinueTarget(context, continueLabel, false, () =>
        withVariableScope(context, () => emitStatementBody(statement.body, context))
      )
    )

    return [
      `static const ccjs_field_info ${fieldsName}[] = {`,
      '  { "key", CCJS_FIELD_READONLY },',
      '  { "value", CCJS_FIELD_READONLY },',
      '};',
      `static const ccjs_shape ${shapeName} = {`,
      '  2,',
      `  ${fieldsName}`,
      '};',
      ...runtimeMap.lines,
      `ccjs_map* ${map} = (ccjs_map*)${runtimeMap.name}.as.ref;`,
      `for (size_t ${index} = 0; ${index} < ${map}->cap; ${index} += 1) {`,
      `  if (${map}->entries[${index}].state != CCJS_MAP_SLOT_OCCUPIED) continue;`,
      ...emitPrepareOwnedValueWrite(statement.name).map((line) => `  ${line}`),
      `  ${emitStatusCheck(`ccjs_object_new(&ccjs_default_allocator, &${shapeName}, &${statement.name})`, context)}`,
      `  ${emitStatusCheck(`ccjs_object_init_known(${statement.name}, 0, ${map}->entries[${index}].key)`, context)}`,
      `  ${emitStatusCheck(`ccjs_object_init_known(${statement.name}, 1, ${map}->entries[${index}].value)`, context)}`,
      ...body.map((line) => `  ${line}`),
      ...emitContinueTargetLabel(continueLabel, context),
      '}',
      ...emitBreakTargetLabel(breakLabel, context),
      ...emitPrepareOwnedValueWrite(statement.name)
    ]
  })
}

function emitRuntimeSetForOfStatement(statement, runtimeSet, context) {
  const elementType = runtimeSet.elementType

  if (!['number', 'boolean', 'string'].includes(elementType)) {
    context.diagnostics.push(
      diagnostic(
        'CCJS_C_FOR_OF',
        'C for...of currently supports only uniform number/boolean/string Set values',
        statement.loc
      )
    )
    return []
  }

  const index = nextCName(context, 'ccjs_for_set_index')
  const set = nextCName(context, 'ccjs_for_set')
  const value = nextCName(context, 'ccjs_for_value')
  const breakLabel = nextCName(context, 'ccjs_break')
  const continueLabel = nextCName(context, 'ccjs_continue')
  const loopValue = elementType === 'boolean' ? `((double)(${value}.as.boolean ? 1 : 0))` : `${value}.as.number`

  registerOwnedValue(context, value)

  return withVariableScope(context, () => {
    context.variables.set(statement.name, elementType)
    if (elementType === 'string') {
      context.runtimeStrings.add(statement.name)
    }
    const body = withBreakTarget(context, breakLabel, false, () =>
      withContinueTarget(context, continueLabel, false, () =>
        withVariableScope(context, () => emitStatementBody(statement.body, context))
      )
    )
    const declaration =
      elementType === 'string'
        ? `ccjs_string* ${statement.name} = (ccjs_string*)${value}.as.ref;`
        : `double ${statement.name} = ${loopValue};`
    const checks =
      elementType === 'string'
        ? [emitRuntimeTypeCheck(`${value}.tag != CCJS_TAG_STRING || ${value}.as.ref == 0`, context)]
        : elementType === 'boolean'
          ? [emitRuntimeTypeCheck(`${value}.tag != CCJS_TAG_BOOL`, context)]
          : [emitRuntimeTypeCheck(`${value}.tag != CCJS_TAG_NUMBER`, context)]

    return [
      ...runtimeSet.lines,
      `ccjs_set* ${set} = (ccjs_set*)${runtimeSet.name}.as.ref;`,
      `for (size_t ${index} = 0; ${index} < ${set}->cap; ${index} += 1) {`,
      `  if (${set}->entries[${index}].state != CCJS_SET_SLOT_OCCUPIED) continue;`,
      ...emitPrepareOwnedValueWrite(value).map((line) => `  ${line}`),
      `  ${value} = ${set}->entries[${index}].value;`,
      `  ccjs_retain(${value});`,
      ...checks.map((line) => `  ${line}`),
      `  ${declaration}`,
      ...body.map((line) => `  ${line}`),
      ...emitContinueTargetLabel(continueLabel, context),
      '}',
      ...emitBreakTargetLabel(breakLabel, context),
      ...emitPrepareOwnedValueWrite(value)
    ]
  })
}

function emitSwitchStatement(statement, context) {
  const discriminant = emitPreparedNumberExpression(statement.discriminant, context)
  const breakLabel = nextCName(context, 'ccjs_break')
  const lines = [...discriminant.lines, `switch ((int)${discriminant.expression}) {`]

  for (const item of statement.cases) {
    lines.push(item.test == null ? '  default: {' : `  case ${emitSwitchCaseLabel(item.test, context)}: {`)
    lines.push(
      ...withBreakTarget(context, breakLabel, false, () =>
        withVariableScope(context, () => emitStatementList(item.consequent, context))
      ).map((line) => `    ${line}`)
    )
    lines.push('  }')
  }

  lines.push('}')
  lines.push(...emitBreakTargetLabel(breakLabel, context))

  return lines
}

function emitSwitchCaseLabel(expression, context) {
  if (expression?.type === 'NumberLiteral') {
    return `(int)${expression.value}`
  }

  if (expression?.type === 'BooleanLiteral') {
    return `(int)${expression.value ? '1' : '0'}`
  }

  if (
    expression?.type === 'UnaryExpression' &&
    expression.argument.type === 'NumberLiteral' &&
    ['+', '-'].includes(expression.operator)
  ) {
    return `(int)(${expression.operator}${expression.argument.value})`
  }

  context.diagnostics.push(
    diagnostic(
      'CCJS_C_SWITCH_CASE',
      'C switch case labels must be numeric or boolean literals in the current backend slice',
      expression?.loc
    )
  )

  return '0'
}

function emitTryStatement(statement, context) {
  if (statement.handler != null && currentErrorTarget(context) != null && containsAwaitExpression(statement.block)) {
    context.diagnostics.push(
      diagnostic(
        'CCJS_C_ASYNC',
        'nested async try/catch state-machine lowering is not supported by the current C backend slice',
        statement.loc
      )
    )
  }

  registerErrorChannel(context)

  const id = nextCName(context, 'ccjs_try')
  const catchLabel = statement.handler == null ? null : `${id}_catch`
  const finallyLabel = statement.finalizer == null ? null : `${id}_finally`
  const endLabel = `${id}_end`
  const throwTarget = catchLabel ?? finallyLabel
  const outerReturnTarget = currentReturnTarget(context)
  const outerBreakTarget = currentBreakTarget(context)
  const outerContinueTarget = currentContinueTarget(context)
  const lines = ['{']
  const tryBody = withErrorTarget(context, throwTarget, () =>
    withFinallyFlowTarget(context, finallyLabel, () =>
      withVariableScope(context, () => emitStatementBody(statement.block, context))
    )
  )

  lines.push(...tryBody.map((line) => `  ${line}`))
  lines.push(`  goto ${finallyLabel ?? endLabel};`)

  if (statement.handler != null && catchLabel != null) {
    const catchValueType = inferCatchBindingValueType(statement, context)
    const catchBody = withFinallyFlowTarget(context, finallyLabel, () =>
      withVariableScope(context, () => {
        const body: string[] = []

        if (statement.handler.param != null) {
          if (catchValueType === 'object') {
            context.variables.set(statement.handler.param, 'object')
            registerErrorObjectShape(context, statement.handler.param)
            body.push(`ccjs_value ${statement.handler.param} = ccjs_error;`)
          } else {
            context.variables.set(statement.handler.param, 'string')
            context.runtimeStrings.add(statement.handler.param)
            body.push(`ccjs_string* ${statement.handler.param} = (ccjs_string*)ccjs_error.as.ref;`)
          }
        }

        body.push(...emitStatementBody(statement.handler.body, context))

        return body
      })
    )

    lines.push(`${catchLabel}:`)
    lines.push(`  if (${emitCatchBindingTypeCheck(catchValueType)}) ${emitFailureStatement(context)}`)
    lines.push('  ccjs_error_active = 0;')
    lines.push('  {')
    lines.push(...catchBody.map((line) => `    ${line}`))
    lines.push('  }')
    lines.push('  ccjs_release(ccjs_error);')
    lines.push('  ccjs_error = ccjs_undefined_value();')
  }

  if (statement.finalizer != null && finallyLabel != null) {
    const outerThrowTarget = currentErrorTarget(context)
    const finalizerBody = withErrorTarget(context, outerThrowTarget, () =>
      withReturnTarget(context, outerReturnTarget, () =>
        withBreakTarget(context, outerBreakTarget?.label ?? null, outerBreakTarget?.throughFinally === true, () =>
          withContinueTarget(
            context,
            outerContinueTarget?.label ?? null,
            outerContinueTarget?.throughFinally === true,
            () => withVariableScope(context, () => emitStatementBody(statement.finalizer, context))
          )
        )
      )
    )

    lines.push(`${finallyLabel}:`)
    lines.push(...finalizerBody.map((line) => `  ${line}`))

    if (outerThrowTarget != null) {
      lines.push(`  if (ccjs_error_active) goto ${outerThrowTarget};`)
    } else {
      lines.push(`  if (ccjs_error_active) ${emitFailureStatement(context)}`)
    }

    if (context.returnFlowUsed) {
      if (outerReturnTarget != null) {
        lines.push(`  if (ccjs_return_active) goto ${outerReturnTarget};`)
      } else {
        lines.push(`  if (ccjs_return_active) ${emitReturnCleanupStatement(context)}`)
      }
    }

    if (context.breakFlowUsed && outerBreakTarget != null) {
      lines.push(`  if (ccjs_break_active) goto ${outerBreakTarget.label};`)
    }

    if (context.continueFlowUsed && outerContinueTarget != null) {
      lines.push(`  if (ccjs_continue_active) goto ${outerContinueTarget.label};`)
    }
  }

  lines.push(`${endLabel}:`)
  lines.push('  ;')
  lines.push('}')

  return lines
}

function emitThrowStatement(statement, context) {
  const target = currentErrorTarget(context)

  if (target == null && !context.throwingFunction) {
    context.diagnostics.push(
      diagnostic('CCJS_C_THROW', 'uncaught throw is not supported by the current C backend slice', statement.loc)
    )
    return []
  }

  const isErrorObject = isErrorValueExpression(statement.argument, context)

  if (inferExpressionType(statement.argument, context) !== 'string' && !isErrorObject) {
    context.diagnostics.push(
      diagnostic(
        'CCJS_C_THROW',
        'C throw currently supports only string values and lightweight Error objects in local try/catch regions',
        statement.loc
      )
    )
    return []
  }

  registerErrorChannel(context)

  const value = emitCValueExpression(statement.argument, context)

  return [
    ...value.lines,
    ...emitPrepareOwnedValueWrite('ccjs_error'),
    `ccjs_error = ${value.expression};`,
    emitRuntimeTypeCheck(
      isErrorObject
        ? 'ccjs_error.tag != CCJS_TAG_OBJECT || ccjs_error.as.ref == 0'
        : 'ccjs_error.tag != CCJS_TAG_STRING || ccjs_error.as.ref == 0',
      context
    ),
    'ccjs_retain(ccjs_error);',
    ...(target == null ? ['ccjs_status_result = CCJS_ERR_THROW;'] : []),
    'ccjs_error_active = 1;',
    `goto ${target ?? 'ccjs_cleanup'};`
  ]
}

function inferCatchBindingValueType(statement, context) {
  const types = [
    ...collectIrLocalThrowValueTypes(statement.block, {
      errorObjectNames: context.errorObjectNames,
      functionThrowValueTypes: context.functionThrowValueTypes
    }),
    ...collectLocalAwaitRejectionValueTypes(statement.block, context)
  ]

  return types.length > 0 && types.every((type) => type === 'error') ? 'object' : 'string'
}

function collectLocalAwaitRejectionValueTypes(
  node,
  context,
  localPromiseRejectionValueTypes = new Map(),
  localErrorObjectNames = new Set(context.errorObjectNames)
) {
  if (node == null) {
    return []
  }

  if (Array.isArray(node)) {
    const types: string[] = []

    for (const item of node) {
      types.push(
        ...collectLocalAwaitRejectionValueTypes(item, context, localPromiseRejectionValueTypes, localErrorObjectNames)
      )
    }

    return types
  }

  if (typeof node !== 'object') {
    return []
  }

  if (node.type === 'BlockStatement') {
    return collectLocalAwaitRejectionValueTypes(
      node.body,
      context,
      new Map(localPromiseRejectionValueTypes),
      new Set(localErrorObjectNames)
    )
  }

  if (node.type === 'VariableDeclaration') {
    const types = collectLocalAwaitRejectionValueTypes(
      node.init,
      context,
      localPromiseRejectionValueTypes,
      localErrorObjectNames
    )

    if (isErrorConstructorExpression(node.init)) {
      localErrorObjectNames.add(node.name)
    }

    if (node.valueType === 'promise') {
      const rejectionValueType = inferPromiseRejectionValueType(
        node.init,
        context,
        localPromiseRejectionValueTypes,
        localErrorObjectNames
      )

      if (rejectionValueType !== 'unknown') {
        localPromiseRejectionValueTypes.set(node.name, rejectionValueType)
      }
    }

    return types
  }

  if (node.type === 'AwaitExpression') {
    const rejectionValueType = inferPromiseRejectionValueType(
      node.argument,
      context,
      localPromiseRejectionValueTypes,
      localErrorObjectNames
    )

    return rejectionValueType === 'unknown' ? [] : [rejectionValueType]
  }

  return Object.values(node).flatMap((value) =>
    collectLocalAwaitRejectionValueTypes(value, context, localPromiseRejectionValueTypes, localErrorObjectNames)
  )
}

function inferPromiseRejectionValueType(
  expression,
  context,
  localPromiseRejectionValueTypes = context.promiseRejectionValueTypes,
  localErrorObjectNames = context.errorObjectNames
) {
  if (expression?.type === 'CallExpression' && cPromiseRuntimeCallName(expression.callee) === 'reject') {
    return inferRejectedValueType(expression.args[0], context, localErrorObjectNames)
  }

  if (expression?.type === 'CallExpression' && cFsRuntimeExpressionMethod(expression) != null) {
    return 'error'
  }

  if (expression?.type === 'CallExpression' && cFetchRuntimeExpressionMethod(expression) != null) {
    return 'error'
  }

  if (expression?.type === 'Reference' && expression.path.length === 1) {
    return (
      localPromiseRejectionValueTypes.get(expression.path[0]) ??
      context.promiseRejectionValueTypes.get(expression.path[0]) ??
      'unknown'
    )
  }

  return 'unknown'
}

function inferRejectedValueType(expression, context, localErrorObjectNames = context.errorObjectNames) {
  if (isKnownErrorValueExpression(expression, context, localErrorObjectNames)) {
    return 'error'
  }

  if (
    expression?.type === 'StringLiteral' ||
    expression?.type === 'TemplateLiteral' ||
    inferExpressionType(expression, context) === 'string'
  ) {
    return 'string'
  }

  return 'unknown'
}

function emitCatchBindingTypeCheck(valueType) {
  return valueType === 'object'
    ? 'ccjs_error.tag != CCJS_TAG_OBJECT || ccjs_error.as.ref == 0'
    : 'ccjs_error.tag != CCJS_TAG_STRING || ccjs_error.as.ref == 0'
}

function registerErrorChannel(context) {
  context.errorChannelUsed = true
  registerOwnedValue(context, 'ccjs_error')
}

function currentErrorTarget(context) {
  return context.errorTargets.at(-1) ?? null
}

function emitBreakJump(context) {
  const target = currentBreakTarget(context)

  if (target == null) {
    return ['break;']
  }

  if (target.throughFinally) {
    registerBreakFlow(context)

    return ['ccjs_break_active = 1;', `goto ${target.label};`]
  }

  return [`goto ${target.label};`]
}

function emitContinueJump(context) {
  const target = currentContinueTarget(context)

  if (target == null) {
    return ['continue;']
  }

  if (target.throughFinally) {
    registerContinueFlow(context)

    return ['ccjs_continue_active = 1;', `goto ${target.label};`]
  }

  return [`goto ${target.label};`]
}

function emitBreakTargetLabel(label, context) {
  return [`${label}:`, ...(context.breakFlowUsed ? ['  if (ccjs_break_active) ccjs_break_active = 0;'] : []), ';']
}

function emitContinueTargetLabel(label, context) {
  return [
    `${label}:`,
    ...(context.continueFlowUsed ? ['  if (ccjs_continue_active) ccjs_continue_active = 0;'] : []),
    '  ;'
  ]
}

function registerBreakFlow(context) {
  context.breakFlowUsed = true
}

function registerContinueFlow(context) {
  context.continueFlowUsed = true
}

function currentBreakTarget(context) {
  return context.breakTargets.at(-1) ?? null
}

function currentContinueTarget(context) {
  return context.continueTargets.at(-1) ?? null
}

function withBreakTarget(context, label, throughFinally, callback) {
  if (label == null) {
    return callback()
  }

  context.breakTargets.push({
    label,
    throughFinally
  })

  try {
    return callback()
  } finally {
    context.breakTargets.pop()
  }
}

function withContinueTarget(context, label, throughFinally, callback) {
  if (label == null) {
    return callback()
  }

  context.continueTargets.push({
    label,
    throughFinally
  })

  try {
    return callback()
  } finally {
    context.continueTargets.pop()
  }
}

function withFinallyFlowTarget(context, label, callback) {
  return withReturnTarget(context, label, () =>
    withBreakTarget(context, label, true, () => withContinueTarget(context, label, true, callback))
  )
}

function emitReturnJump(context) {
  const target = currentReturnTarget(context)

  if (target != null) {
    registerReturnFlow(context)

    return ['ccjs_return_active = 1;', `goto ${target};`]
  }

  return [emitReturnCleanupStatement(context)]
}

function emitReturnCleanupStatement(context) {
  if (context.statusReturn && context.runtimeCallbackCleanupLabel != null) {
    context.usedRuntimeCallbackCleanupGoto = true

    return `goto ${context.runtimeCallbackCleanupLabel};`
  }

  if (context.cleanupEnabled) {
    context.usedCleanupGoto = true

    return 'goto ccjs_cleanup;'
  }

  return context.returnType === 'void' ? 'return;' : 'return ccjs_return;'
}

function registerReturnFlow(context) {
  context.returnFlowUsed = true
}

function currentReturnTarget(context) {
  return context.returnTargets.at(-1) ?? null
}

function withReturnTarget(context, target, callback) {
  if (target == null) {
    return callback()
  }

  context.returnTargets.push(target)

  try {
    return callback()
  } finally {
    context.returnTargets.pop()
  }
}

function withErrorTarget(context, target, callback) {
  if (target == null) {
    return callback()
  }

  context.errorTargets.push(target)

  try {
    return callback()
  } finally {
    context.errorTargets.pop()
  }
}

function emitStatementBody(statement, context) {
  if (statement.type === 'BlockStatement') {
    return emitStatementList(statement.body, context)
  }

  return emitStatement(statement, context)
}

function emitStatementList(statements, context) {
  return statements.flatMap((statement) => {
    const lines = emitStatement(statement, context)

    applyNullableScalarEarlyReturnNarrowing(statement, context)

    return lines
  })
}

function applyNullableScalarEarlyReturnNarrowing(statement, context) {
  if (
    statement.type !== 'IfStatement' ||
    statement.alternate != null ||
    !statementDefinitelyReturns(statement.consequent)
  ) {
    return
  }

  const narrowing = resolveNullableScalarConditionNarrowing(statement.condition, context)

  narrowNullableScalars(context, narrowing.falseNames)
}

function statementDefinitelyReturns(statement) {
  if (statement.type === 'ReturnStatement') {
    return true
  }

  if (statement.type === 'BlockStatement') {
    return statement.body.some(statementDefinitelyReturns)
  }

  if (statement.type === 'IfStatement' && statement.alternate != null) {
    return statementDefinitelyReturns(statement.consequent) && statementDefinitelyReturns(statement.alternate)
  }

  return false
}

function emitForInitializer(init, context) {
  if (init == null) {
    return ''
  }

  if (init.type === 'VariableDeclaration') {
    return emitVariableDeclaration(init, context)
  }

  return emitCExpression(init, context)
}

function emitPreparedForInitializer(init, context) {
  if (init == null) {
    return {
      lines: [],
      expression: ''
    }
  }

  if (init.type === 'VariableDeclaration') {
    return emitPreparedForVariableDeclaration(init, context)
  }

  return emitPreparedForExpressionClause(init, context)
}

function emitPreparedForVariableDeclaration(statement, context) {
  const fetchCall = emitPreparedFetchCallExpression(statement.init, context, {
    out: statement.name
  })

  if (fetchCall != null) {
    return {
      lines: fetchCall.lines,
      expression: ''
    }
  }

  const fsCall = emitPreparedFsCallExpression(statement.init, context, {
    out: statement.name
  })

  if (fsCall != null) {
    return {
      lines: fsCall.lines,
      expression: ''
    }
  }

  const promiseConstructor = emitPreparedPromiseConstructorExpression(statement.init, context, {
    out: statement.name
  })

  if (promiseConstructor != null) {
    return {
      lines: promiseConstructor.lines,
      expression: ''
    }
  }

  const promise = emitPreparedPromiseStaticExpression(statement.init, context, {
    out: statement.name
  })

  if (promise != null) {
    return {
      lines: promise.lines,
      expression: ''
    }
  }

  const promiseCall = emitPreparedPromiseReturningCallExpression(statement.init, context, {
    out: statement.name
  })

  if (promiseCall != null) {
    return {
      lines: promiseCall.lines,
      expression: ''
    }
  }

  if (isCollectionConstructorExpression(statement.init)) {
    return {
      lines: emitCollectionVariableDeclaration(statement, context),
      expression: ''
    }
  }

  const arrayMapCall = emitPreparedArrayMapCallExpression(statement.init, context)

  if (arrayMapCall != null) {
    return {
      lines: emitArrayMapVariableDeclaration(statement, arrayMapCall, context),
      expression: ''
    }
  }

  const arrayFilterCall = emitPreparedArrayFilterCallExpression(statement.init, context)

  if (arrayFilterCall != null) {
    return {
      lines: emitArrayFilterVariableDeclaration(statement, arrayFilterCall, context),
      expression: ''
    }
  }

  const arraySortCall = emitPreparedArraySortCallExpression(statement.init, context)

  if (arraySortCall != null) {
    return {
      lines: emitArraySortVariableDeclaration(statement, arraySortCall, context),
      expression: ''
    }
  }

  if (statement.nullable === true && isRuntimeNullableType(statement.valueType)) {
    return {
      lines: emitNullableRuntimeValueVariableDeclaration(statement, context),
      expression: ''
    }
  }

  if (isErrorConstructorExpression(statement.init)) {
    return {
      lines: emitErrorObjectVariableDeclaration(statement, context),
      expression: ''
    }
  }

  if (isClassConstructorExpression(statement.init, context)) {
    return {
      lines: emitClassObjectVariableDeclaration(statement, context),
      expression: ''
    }
  }

  if (statement.init?.type === 'ObjectLiteral') {
    return {
      lines: emitObjectVariableDeclaration(statement, context),
      expression: ''
    }
  }

  if (statement.init?.type === 'ArrayLiteral') {
    return {
      lines: emitArrayVariableDeclaration(statement, context),
      expression: ''
    }
  }

  if (isMemberAccessExpression(statement.init)) {
    const member = resolveKnownObjectMember(statement.init, context)

    if (member != null) {
      return {
        lines: emitKnownObjectMemberVariableDeclaration(statement, member, context),
        expression: ''
      }
    }
  }

  if (isIndexAccessExpression(statement.init)) {
    const element = resolveKnownArrayIndex(statement.init, context)

    if (element != null) {
      return {
        lines: emitKnownArrayIndexVariableDeclaration(statement, element, context),
        expression: ''
      }
    }

    const field = resolveKnownObjectIndex(statement.init, context)

    if (field != null) {
      return {
        lines: emitDynamicObjectMemberVariableDeclaration(statement, field, context),
        expression: ''
      }
    }
  }

  if (isRuntimeProducedStringExpression(statement.init, context)) {
    return {
      lines: emitRuntimeStringVariableDeclaration(statement, statement.init, context),
      expression: ''
    }
  }

  if (isRuntimeValueLocalExpression(statement.init, context)) {
    return {
      lines: emitRuntimeValueVariableDeclaration(statement, statement.init, context),
      expression: ''
    }
  }

  const inferred = inferExpressionType(statement.init, context)
  context.variables.set(statement.name, inferred)

  if (inferred === 'string') {
    if (context.boxedMutableCaptureDeclarations.has(statement)) {
      return emitBoxedRuntimeValueVariableDeclaration(statement, statement.init, context)
    }

    const runtimeString = resolveRuntimeStringReference(statement.init, context)

    if (runtimeString != null) {
      context.runtimeStrings.add(statement.name)
      return {
        lines: [],
        expression: `${statement.kind === 'const' ? 'const ' : ''}ccjs_string* ${statement.name} = ${runtimeString}`
      }
    }

    if (isRuntimeProducedStringExpression(statement.init, context)) {
      return {
        lines: emitRuntimeStringVariableDeclaration(statement, statement.init, context),
        expression: ''
      }
    }

    return {
      lines: [],
      expression: `${statement.kind === 'const' ? 'const ' : ''}char* ${statement.name} = ${emitStringExpression(statement.init, context)}`
    }
  }

  if (inferred === 'function') {
    context.variables.set(statement.name, 'function')
    context.functionTypes.set(statement.name, statement.functionType)

    if (isRuntimeFunctionType(statement.functionType)) {
      return {
        lines: emitRuntimeCallbackVariableDeclaration(statement, context),
        expression: ''
      }
    }

    return {
      lines: [],
      expression: emitFunctionPointerVariable(
        statement.name,
        statement.init,
        context,
        statement.kind === 'const',
        statement.functionType,
        statement.loc
      )
    }
  }

  if (!['number', 'boolean'].includes(inferred)) {
    context.diagnostics.push(
      diagnostic(
        cUnsupportedVariableDeclarationCode(statement, inferred),
        'this expression is not supported by the current C backend slice',
        statement.loc
      )
    )

    return {
      lines: [],
      expression: `double ${statement.name} = 0`
    }
  }

  const value = emitPreparedNumberExpression(statement.init, context)

  return {
    lines: value.lines,
    expression: `${statement.kind === 'const' ? 'const ' : ''}double ${statement.name} = ${value.expression}`
  }
}

function emitPreparedForExpressionClause(expression, context) {
  if (expression == null) {
    return {
      lines: [],
      expression: ''
    }
  }

  return emitPreparedNumberExpression(expression, context)
}

function isRuntimeCallbackReturnContext(context) {
  return (
    context.statusReturn === true &&
    (context.runtimeCallbackReturnType === 'void' ||
      ['number', 'boolean'].includes(context.runtimeCallbackReturnType) ||
      isManagedRuntimeReturnType(context.runtimeCallbackReturnType))
  )
}

function emitRuntimeCallbackReturnStatement(statement, context) {
  if (context.runtimeCallbackReturnType === 'void') {
    return emitReturnJump(context)
  }

  const lines = isManagedRuntimeReturnType(context.runtimeCallbackReturnType)
    ? emitRuntimeCallbackRuntimeValueReturnLines(statement.argument, context)
    : emitRuntimeCallbackScalarReturnLines(statement.argument, context)

  return [...lines, ...emitReturnJump(context)]
}

function emitRuntimeCallbackScalarReturnLines(argument, context) {
  const value =
    argument == null
      ? {
          lines: [],
          expression: '0'
        }
      : emitPreparedNumberExpression(argument, context)
  const expression =
    context.runtimeCallbackReturnType === 'number'
      ? `ccjs_number_value(${value.expression})`
      : `ccjs_bool_value((${value.expression}) != 0)`

  return [...value.lines, `${context.runtimeCallbackReturnOut} = ${expression};`]
}

function emitRuntimeCallbackRuntimeValueReturnLines(argument, context) {
  const expectedTag = cRuntimeValueTag(context.runtimeCallbackReturnType)
  const value =
    argument == null
      ? {
          lines: [],
          expression: 'ccjs_undefined_value()'
        }
      : emitRuntimeReturnValueExpression(
          argument,
          context,
          context.runtimeCallbackReturnType,
          context.runtimeCallbackReturnShape
        )

  return [
    ...value.lines,
    `${context.runtimeCallbackReturnOut} = ${value.expression};`,
    emitRuntimeValueCheck(context.runtimeCallbackReturnOut, expectedTag, context),
    `ccjs_retain(${context.runtimeCallbackReturnOut});`
  ]
}

function emitRuntimeReturnValueExpression(argument, context, returnType, returnShape) {
  if (returnType === 'object' && argument?.type === 'ObjectLiteral') {
    return emitCObjectLiteralValueExpression(argument, context, returnShape)
  }

  return emitCValueExpression(argument, context)
}

function emitRuntimeValueReturnStatement(statement, context) {
  if (statement.argument == null) {
    return emitReturnJump(context)
  }

  const expectedTag = cRuntimeValueTag(context.returnType)
  const value = emitRuntimeReturnValueExpression(statement.argument, context, context.returnType, context.returnShape)

  return [
    ...value.lines,
    `ccjs_return = ${value.expression};`,
    emitRuntimeValueCheck('ccjs_return', expectedTag, context),
    'ccjs_retain(ccjs_return);',
    ...emitReturnJump(context)
  ]
}

function emitNullableScalarReturnStatement(statement, context) {
  const expectedTag = cRuntimeValueTag(context.returnType)
  const value =
    statement.argument == null
      ? {
          lines: [],
          expression: 'ccjs_null_value()'
        }
      : emitNullableScalarValueExpression(statement.argument, context)

  return [
    ...value.lines,
    `ccjs_return = ${value.expression};`,
    ...emitRuntimeNullableValueCheck('ccjs_return', expectedTag, context),
    ...emitReturnJump(context)
  ]
}

function emitDirentArrayIndexVariableDeclaration(statement, context) {
  const expression = statement.init

  if (
    expression?.type !== 'IndexExpression' ||
    expression.object.type !== 'Reference' ||
    expression.index.type !== 'NumberLiteral' ||
    expression.arrayElementDeclaredType !== 'fs.Dirent'
  ) {
    return null
  }

  const index = Number.parseInt(expression.index.value, 10)

  if (!Number.isInteger(index) || index < 0) {
    return null
  }

  const array = emitCValueExpression(expression.object, context)
  registerOwnedValue(context, statement.name)
  context.variables.set(statement.name, 'object')
  registerObjectShape(context, statement.name, expression.shape)

  return [
    ...array.lines,
    ...emitPrepareOwnedValueWrite(statement.name),
    emitStatusCheck(`ccjs_array_get(${array.expression}, ${index}, &${statement.name})`, context),
    emitRuntimeValueCheck(statement.name, 'CCJS_TAG_OBJECT', context),
    `ccjs_retain(${statement.name});`
  ]
}

function emitRuntimeStringVariableDeclaration(statement, expression, context) {
  const value = emitCValueExpression(expression, context)
  const lines = [
    ...value.lines,
    `${statement.kind === 'const' ? 'const ' : ''}ccjs_string* ${statement.name} = (ccjs_string*)${value.expression}.as.ref;`
  ]

  context.variables.set(statement.name, 'string')
  context.runtimeStrings.add(statement.name)

  return lines
}

function emitRuntimeValueVariableDeclaration(statement, expression, context) {
  const valueType = inferExpressionType(expression, context)
  const expectedTag = cRuntimeValueTag(valueType)
  const value =
    valueType === 'object' && expression?.type === 'ObjectLiteral'
      ? emitCObjectLiteralValueExpression(expression, context, statement.shape)
      : emitCValueExpression(expression, context)

  registerOwnedValue(context, statement.name)
  registerRuntimeValueMetadata(statement.name, valueType, statement, expression, context)

  return [
    ...value.lines,
    ...emitPrepareOwnedValueWrite(statement.name),
    `${statement.name} = ${value.expression};`,
    emitRuntimeValueCheck(statement.name, expectedTag, context),
    `ccjs_retain(${statement.name});`
  ]
}

function registerRuntimeValueMetadata(name, valueType, declaration, expression, context) {
  context.variables.set(name, valueType)

  if (valueType === 'object') {
    registerObjectShape(context, name, declaration.shape ?? expression?.shape ?? null)
  } else if (valueType === 'array') {
    const fsDirentArray =
      expression?.fsRuntimeMethod === 'readDirDirents' || expression?.fsRuntimeMethod === 'readDirDirentsSync'
    context.runtimeArrayElementTypes.set(
      name,
      declaration.arrayElementType ??
        resolveRuntimeArrayElementType(expression, context) ??
        expression?.arrayElementType ??
        (fsDirentArray ? 'object' : null) ??
        'unknown'
    )
  } else if (valueType === 'map') {
    const mapType = resolveRuntimeMapType(expression, context)

    context.mapTypes.set(name, {
      key: declaration.mapKeyType ?? mapType?.key ?? expression?.mapKeyType ?? 'unknown',
      value: declaration.mapValueType ?? mapType?.value ?? expression?.mapValueType ?? 'unknown'
    })
  } else if (valueType === 'set') {
    context.setElementTypes.set(
      name,
      declaration.setElementType ??
        resolveRuntimeSetElementType(expression, context) ??
        expression?.setElementType ??
        'unknown'
    )
  }
}

function isRuntimeValueLocalExpression(expression, context) {
  const valueType = inferExpressionType(expression, context)

  return (
    valueType === 'bytes' ||
    valueType === 'object' ||
    valueType === 'array' ||
    valueType === 'map' ||
    valueType === 'set'
  )
}

function reportCCollectionHashability(valueType, subject, loc, context) {
  if (valueType == null || valueType === 'unknown' || isCCollectionHashableType(valueType)) {
    return
  }

  context.diagnostics.push(
    diagnostic('CCJS_C_COLLECTION', `${subject} must be hashable in the current C backend slice`, loc)
  )
}

function isCCollectionHashableType(valueType) {
  return valueType === 'number' || valueType === 'boolean' || valueType === 'string'
}

function emitCollectionVariableDeclaration(statement, context) {
  const constructor = collectionConstructorName(statement.init)

  if (constructor == null) {
    context.diagnostics.push(
      diagnostic(
        'CCJS_C_COLLECTION',
        'this collection constructor is not supported by the current C backend slice',
        statement.loc
      )
    )
    return [`double ${statement.name} = 0;`]
  }

  if (statement.init.args.length > 1) {
    context.diagnostics.push(
      diagnostic(
        'CCJS_C_COLLECTION',
        'C collection constructors currently support at most one array literal iterable',
        statement.init.loc
      )
    )
  }

  registerOwnedValue(context, statement.name)

  if (constructor === 'Map') {
    context.variables.set(statement.name, 'map')
    context.mapTypes.set(statement.name, {
      key: statement.mapKeyType ?? 'unknown',
      value: statement.mapValueType ?? 'unknown'
    })
    reportCCollectionHashability(statement.mapKeyType, 'Map keys', statement.loc, context)

    const lines = [
      ...emitPrepareOwnedValueWrite(statement.name),
      emitStatusCheck(`ccjs_map_new(&ccjs_default_allocator, &${statement.name})`, context)
    ]

    lines.push(...emitMapConstructorEntries(statement.name, statement.init.args[0], context, statement.init.loc))

    return lines
  }

  context.variables.set(statement.name, 'set')
  context.setElementTypes.set(statement.name, statement.setElementType ?? 'unknown')
  reportCCollectionHashability(statement.setElementType, 'Set values', statement.loc, context)

  const lines = [
    ...emitPrepareOwnedValueWrite(statement.name),
    emitStatusCheck(`ccjs_set_new(&ccjs_default_allocator, &${statement.name})`, context)
  ]

  lines.push(...emitSetConstructorValues(statement.name, statement.init.args[0], context, statement.init.loc))

  return lines
}

function emitMapConstructorEntries(name, expression, context, loc) {
  if (expression == null) {
    return []
  }

  if (expression.type !== 'ArrayLiteral') {
    context.diagnostics.push(
      diagnostic(
        'CCJS_C_COLLECTION',
        'C Map constructor currently supports only array literal entries',
        expression.loc ?? loc
      )
    )
    return []
  }

  const lines: string[] = []

  for (const entry of expression.elements) {
    if (entry.type !== 'ArrayLiteral' || entry.elements.length !== 2) {
      context.diagnostics.push(
        diagnostic(
          'CCJS_C_COLLECTION',
          'C Map constructor entries must be [key, value] array literals',
          entry.loc ?? loc
        )
      )
      continue
    }

    const key = emitCValueExpression(entry.elements[0], context)
    const value = emitCValueExpression(entry.elements[1], context)
    reportCCollectionHashability(
      inferExpressionType(entry.elements[0], context),
      'Map keys',
      entry.elements[0].loc ?? entry.loc ?? loc,
      context
    )

    lines.push(...key.lines)
    lines.push(...value.lines)
    lines.push(emitStatusCheck(`ccjs_map_set(${name}, ${key.expression}, ${value.expression})`, context))
  }

  return lines
}

function emitSetConstructorValues(name, expression, context, loc) {
  if (expression == null) {
    return []
  }

  if (expression.type !== 'ArrayLiteral') {
    context.diagnostics.push(
      diagnostic(
        'CCJS_C_COLLECTION',
        'C Set constructor currently supports only array literal values',
        expression.loc ?? loc
      )
    )
    return []
  }

  const lines: string[] = []

  for (const element of expression.elements) {
    const value = emitCValueExpression(element, context)
    reportCCollectionHashability(inferExpressionType(element, context), 'Set values', element.loc ?? loc, context)

    lines.push(...value.lines)
    lines.push(emitStatusCheck(`ccjs_set_add(${name}, ${value.expression})`, context))
  }

  return lines
}

function emitObjectVariableDeclaration(statement, context) {
  const shapeName = nextCName(context, `ccjs_shape_${statement.name}`)
  const fieldsName = `${shapeName}_fields`
  const fields =
    statement.shape?.fields ??
    statement.init.properties.map((property) => ({
      name: property.key,
      readonly: false,
      valueType: inferExpressionType(property.value, context)
    }))
  const properties = new Map<string, AnyNode>(statement.init.properties.map((property) => [property.key, property]))
  const lines = [`static const ccjs_field_info ${fieldsName}[] = {`]

  for (const field of fields) {
    lines.push(`  { ${cStringLiteral(field.name)}, ${field.readonly ? 'CCJS_FIELD_READONLY' : '0'} },`)
  }

  lines.push('};')
  lines.push(`static const ccjs_shape ${shapeName} = {`)
  lines.push(`  ${fields.length},`)
  lines.push(`  ${fieldsName}`)
  lines.push('};')
  registerOwnedValue(context, statement.name)
  lines.push(...emitPrepareOwnedValueWrite(statement.name))
  lines.push(emitStatusCheck(`ccjs_object_new(&ccjs_default_allocator, &${shapeName}, &${statement.name})`, context))

  context.variables.set(statement.name, 'object')
  context.objectShapes.set(
    statement.name,
    fields.map((field) => ({
      name: field.name,
      valueType: field.valueType,
      arrayElementType: field.arrayElementType,
      mapKeyType: field.mapKeyType,
      mapValueType: field.mapValueType,
      setElementType: field.setElementType
    }))
  )

  for (const [index, field] of fields.entries()) {
    const property = properties.get(field.name)

    if (property == null) {
      context.diagnostics.push(diagnostic('CCJS_MISSING_FIELD', `missing field ${field.name}`, statement.loc))
      continue
    }

    const value = emitCValueExpression(property.value, context)
    lines.push(...value.lines)
    lines.push(emitStatusCheck(`ccjs_object_init_known(${statement.name}, ${index}, ${value.expression})`, context))
  }

  return lines
}

function emitJsonParseVariableDeclaration(statement, context) {
  if (statement.init?.type !== 'CallExpression' || cJsonRuntimeCallName(statement.init.callee) !== 'parse') {
    return null
  }

  if (statement.valueType !== 'object' || statement.shape?.fields == null) {
    return null
  }

  const fields = statement.shape.fields
  const shapeName = nextCName(context, `ccjs_shape_${statement.name}`)
  const fieldsName = `${shapeName}_fields`
  const parsed = nextCName(context, 'ccjs_json_object')
  const parseCall = emitPreparedJsonCallExpression(statement.init, context, {
    out: parsed
  })
  const lines = [`static const ccjs_field_info ${fieldsName}[] = {`]

  for (const field of fields) {
    lines.push(`  { ${cStringLiteral(field.name)}, ${field.readonly ? 'CCJS_FIELD_READONLY' : '0'} },`)
  }

  lines.push('};')
  lines.push(`static const ccjs_shape ${shapeName} = {`)
  lines.push(`  ${fields.length},`)
  lines.push(`  ${fieldsName}`)
  lines.push('};')

  registerOwnedValue(context, statement.name)
  context.variables.set(statement.name, 'object')
  registerObjectShape(context, statement.name, statement.shape)

  lines.push(...parseCall.lines)
  lines.push(...emitPrepareOwnedValueWrite(statement.name))
  lines.push(emitStatusCheck(`ccjs_object_new(&ccjs_default_allocator, &${shapeName}, &${statement.name})`, context))

  for (const [index, field] of fields.entries()) {
    const value = nextCName(context, `ccjs_json_${emitCIdentifier(field.name)}`)
    const tag = cRuntimeValueTag(field.valueType)

    registerOwnedValue(context, value)
    lines.push(...emitPrepareOwnedValueWrite(value))
    lines.push(
      emitStatusCheck(
        `ccjs_object_get(${parsed}, ${cStringLiteral(field.name)}, ${utf8ByteLength(field.name)}, &${value})`,
        context
      )
    )
    lines.push(
      ...(field.nullable === true
        ? emitRuntimeNullableValueCheck(value, tag, context)
        : [emitRuntimeValueCheck(value, tag, context)].filter(Boolean))
    )
    lines.push(emitStatusCheck(`ccjs_object_init_known(${statement.name}, ${index}, ${value})`, context))
  }

  return lines
}

function emitClassObjectVariableDeclaration(statement, context) {
  const info = resolveClassConstructorInfo(statement.init, context)

  if (info == null) {
    context.diagnostics.push(
      diagnostic(
        'CCJS_C_CLASS',
        'this class constructor is not supported by the current C backend slice',
        statement.init?.loc ?? statement.loc
      )
    )
    return [`ccjs_value ${statement.name} = ccjs_undefined_value();`]
  }

  registerOwnedValue(context, statement.name)
  context.variables.set(statement.name, 'object')
  context.classInstanceTypes.set(statement.name, info.name)
  registerClassObjectShape(context, statement.name, info)

  return emitCClassObjectInitLines(statement.name, statement.init, info, context)
}

function emitCClassObjectValueExpression(expression, context) {
  const info = resolveClassConstructorInfo(expression, context)
  const temp = nextCName(context, 'ccjs_class_object')
  registerOwnedValue(context, temp)

  if (info == null) {
    context.diagnostics.push(
      diagnostic(
        'CCJS_C_CLASS',
        'this class constructor is not supported by the current C backend slice',
        expression?.loc
      )
    )

    return {
      lines: [...emitPrepareOwnedValueWrite(temp), `${temp} = ccjs_undefined_value();`],
      expression: temp
    }
  }

  return {
    lines: emitCClassObjectInitLines(temp, expression, info, context),
    expression: temp
  }
}

function emitCClassObjectInitLines(target, expression, info, context) {
  const shapeName = nextCName(context, `ccjs_shape_${info.name}`)
  const fieldsName = `${shapeName}_fields`
  const lines = [`static const ccjs_field_info ${fieldsName}[] = {`]

  for (const field of info.fields) {
    lines.push(`  { ${cStringLiteral(field.name)}, ${field.readonly ? 'CCJS_FIELD_READONLY' : '0'} },`)
  }

  lines.push('};')
  lines.push(`static const ccjs_shape ${shapeName} = {`)
  lines.push(`  ${info.fields.length},`)
  lines.push(`  ${fieldsName}`)
  lines.push('};')
  lines.push(...emitPrepareOwnedValueWrite(target))
  lines.push(emitStatusCheck(`ccjs_object_new(&ccjs_default_allocator, &${shapeName}, &${target})`, context))

  const constructorArgs = mapClassConstructorArgs(expression, info)

  for (const assignment of info.assignments) {
    const fieldIndex = info.fields.findIndex((field) => field.name === assignment.field)

    if (fieldIndex === -1) {
      context.diagnostics.push(
        diagnostic('CCJS_UNKNOWN_FIELD', `unknown class field ${assignment.field}`, assignment.loc ?? expression.loc)
      )
      continue
    }

    const value = emitCValueExpression(substituteClassConstructorParams(assignment.value, constructorArgs), context)
    lines.push(...value.lines)
    lines.push(emitStatusCheck(`ccjs_object_init_known(${target}, ${fieldIndex}, ${value.expression})`, context))
  }

  return lines
}

function registerClassObjectShape(context, name, info) {
  context.objectShapes.set(
    name,
    info.fields.map((field) => ({
      name: field.name,
      valueType: field.valueType,
      arrayElementType: field.arrayElementType,
      mapKeyType: field.mapKeyType,
      mapValueType: field.mapValueType,
      setElementType: field.setElementType
    }))
  )
}

function mapClassConstructorArgs(expression, info) {
  const args = new Map<string, AnyNode>()
  const params = info.constructor?.params ?? []

  for (const [index, param] of params.entries()) {
    if (expression.args[index] != null) {
      args.set(param.name, expression.args[index])
    }
  }

  return args
}

function substituteClassConstructorParams(node, args) {
  if (node == null || typeof node !== 'object') {
    return node
  }

  if (Array.isArray(node)) {
    return node.map((item) => substituteClassConstructorParams(item, args))
  }

  if (node.type === 'Reference' && node.path.length === 1 && args.has(node.path[0])) {
    return args.get(node.path[0])
  }

  const copy = {}

  for (const [key, value] of Object.entries(node)) {
    copy[key] = substituteClassConstructorParams(value, args)
  }

  return copy
}

function resolveClassConstructorInfo(expression, context) {
  if (
    expression?.type !== 'NewExpression' ||
    expression.callee.type !== 'Reference' ||
    expression.callee.path.length !== 1
  ) {
    return null
  }

  return context.classInfos.get(expression.callee.path[0]) ?? null
}

function isClassConstructorExpression(expression, context) {
  return resolveClassConstructorInfo(expression, context) != null
}

function emitPreparedClassMethodCallExpression(expression, context) {
  const call = resolveClassMethodCallInfo(expression, context)

  if (call == null) {
    return null
  }

  if (call.method == null) {
    context.diagnostics.push(
      diagnostic(
        'CCJS_UNKNOWN_FIELD',
        `unknown method ${expression.callee.property}`,
        expression.callee.loc ?? expression.loc
      )
    )
    return {
      lines: [],
      expression: ''
    }
  }

  if (call.method.params.length !== expression.args.length) {
    context.diagnostics.push(
      diagnostic(
        'CCJS_ARG_COUNT',
        `method ${expression.callee.property} expects ${call.method.params.length} argument(s), got ${expression.args.length}`,
        expression.loc
      )
    )
  }

  const prepared = emitPreparedCallArgs(expression, call.method.params, context)
  const callExpression = `${emitCClassMethodName(call.info.name, call.method.name)}(${[call.objectExpression, ...prepared.args].join(', ')})`

  if (isManagedRuntimeReturnType(call.method.returnType)) {
    const value = nextCName(context, 'ccjs_method_value')
    const tag = cRuntimeValueTag(call.method.returnType)
    registerOwnedValue(context, value)

    return {
      lines: [
        ...prepared.lines,
        ...emitPrepareOwnedValueWrite(value),
        `${value} = ${callExpression};`,
        emitRuntimeValueCheck(value, tag, context)
      ],
      expression: value
    }
  }

  return {
    lines: prepared.lines,
    expression: call.method.returnType === 'void' ? `${callExpression}` : callExpression
  }
}

function resolveClassMethodCallInfo(expression, context) {
  if (expression?.type !== 'CallExpression' || expression.callee.type !== 'MemberExpression') {
    return null
  }

  const objectName = resolveCObjectExpressionName(expression.callee.object)

  if (objectName == null) {
    return null
  }

  const className = context.classInstanceTypes.get(objectName)

  if (className == null) {
    return null
  }

  const info = context.classInfos.get(className)

  if (info == null) {
    return null
  }

  return {
    info,
    method: info.methods.get(expression.callee.property) ?? null,
    objectExpression: emitObjectValueReference(objectName, context)
  }
}

function emitNullableRuntimeValueVariableDeclaration(statement, context) {
  const valueType = statement.valueType
  const expectedTag = cRuntimeValueTag(valueType)

  registerOwnedValue(context, statement.name)
  context.variables.set(statement.name, valueType)
  context.nullableVariables.add(statement.name)

  if (valueType === 'object') {
    registerObjectShape(context, statement.name, statement.shape)
  } else if (valueType === 'array') {
    context.runtimeArrayElementTypes.set(statement.name, statement.arrayElementType ?? 'unknown')
  } else if (valueType === 'map') {
    context.mapTypes.set(statement.name, {
      key: statement.mapKeyType ?? 'unknown',
      value: statement.mapValueType ?? 'unknown'
    })
  } else if (valueType === 'set') {
    context.setElementTypes.set(statement.name, statement.setElementType ?? 'unknown')
  } else if (valueType === 'function') {
    context.functionTypes.set(statement.name, normalizeFunctionType(statement.functionType))
    context.runtimeCallbacks.add(statement.name)
  }

  if (statement.init == null || statement.init.type === 'NullLiteral') {
    return [...emitPrepareOwnedValueWrite(statement.name), `${statement.name} = ccjs_null_value();`]
  }

  const value = isNullableScalarType(valueType)
    ? emitNullableScalarValueExpression(statement.init, context)
    : valueType === 'function'
      ? emitNullableFunctionValueExpression(statement.init, statement.functionType, context)
      : statement.init.type === 'ObjectLiteral'
        ? emitCObjectLiteralValueExpression(statement.init, context, statement.shape)
        : emitCValueExpression(statement.init, context)

  return [
    ...value.lines,
    ...emitPrepareOwnedValueWrite(statement.name),
    `${statement.name} = ${value.expression};`,
    ...emitRuntimeNullableValueCheck(statement.name, expectedTag, context),
    `ccjs_retain(${statement.name});`
  ]
}

function emitVariableDeclaration(statement, context) {
  if (statement.nullable === true && isRuntimeNullableType(statement.valueType)) {
    return emitNullableRuntimeValueVariableDeclaration(statement, context).join('\n')
  }

  if (isErrorConstructorExpression(statement.init)) {
    return emitErrorObjectVariableDeclaration(statement, context).join('\n')
  }

  if (
    isRuntimeValueLocalExpression(statement.init, context) &&
    statement.init?.type !== 'ObjectLiteral' &&
    statement.init?.type !== 'ArrayLiteral'
  ) {
    return emitRuntimeValueVariableDeclaration(statement, statement.init, context).join('\n')
  }

  const inferred = inferExpressionType(statement.init, context)
  context.variables.set(statement.name, inferred)

  if (inferred === 'string') {
    if (context.boxedMutableCaptureDeclarations.has(statement)) {
      return emitBoxedRuntimeValueVariableDeclaration(statement, statement.init, context)
    }

    const runtimeString = resolveRuntimeStringReference(statement.init, context)

    if (runtimeString != null) {
      context.runtimeStrings.add(statement.name)
      return `${statement.kind === 'const' ? 'const ' : ''}ccjs_string* ${statement.name} = ${runtimeString}`
    }

    if (isRuntimeProducedStringExpression(statement.init, context)) {
      context.diagnostics.push(
        diagnostic(
          'CCJS_C_STRING_EXPR',
          'runtime string declarations need prepared statement lowering in the current C backend slice',
          statement.loc
        )
      )
      return `char* ${statement.name} = ""`
    }

    return `${statement.kind === 'const' ? 'const ' : ''}char* ${statement.name} = ${emitStringExpression(statement.init, context)}`
  }

  if (inferred === 'function') {
    context.variables.set(statement.name, 'function')
    context.functionTypes.set(statement.name, statement.functionType)

    if (isRuntimeFunctionType(statement.functionType) || isRuntimeArrowCallbackExpression(statement.init, context)) {
      context.diagnostics.push(
        diagnostic(
          'CCJS_C_FUNCTION_VALUE',
          'runtime callback declarations need prepared statement lowering in the current C backend slice',
          statement.loc
        )
      )
      return `ccjs_value ${statement.name} = ccjs_undefined_value()`
    }

    return emitFunctionPointerVariable(
      statement.name,
      statement.init,
      context,
      statement.kind === 'const',
      statement.functionType,
      statement.loc
    )
  }

  if (!['number', 'boolean'].includes(inferred)) {
    context.diagnostics.push(
      diagnostic(
        cUnsupportedExpressionCode(inferred),
        'this expression is not supported by the current C backend slice',
        statement.loc
      )
    )
    return `double ${statement.name} = 0`
  }

  return `${statement.kind === 'const' ? 'const ' : ''}double ${statement.name} = ${emitNumberExpression(statement.init, context)}`
}

function emitScalarVariableDeclaration(statement, context) {
  if (statement.nullable === true && isRuntimeNullableType(statement.valueType)) {
    return emitNullableRuntimeValueVariableDeclaration(statement, context)
  }

  if (isErrorConstructorExpression(statement.init)) {
    return emitErrorObjectVariableDeclaration(statement, context)
  }

  if (statement.init?.type === 'CallExpression' && cTimerStartCallName(statement.init.callee) != null) {
    const timerCall = emitPreparedTimerCallExpression(statement.init, context, {
      out: statement.name
    })

    if (timerCall != null) {
      context.variables.set(statement.name, 'timer')

      return [`ccjs_timer_handle* ${statement.name} = 0;`, ...timerCall.lines]
    }
  }

  if (statement.init?.type === 'CallExpression' && cTimerClearCallName(statement.init.callee) != null) {
    context.diagnostics.push(
      diagnostic('CCJS_C_TIMER_HANDLE', 'timer clear calls return void and cannot initialize a value', statement.loc)
    )
    context.variables.set(statement.name, 'timer')

    return [`ccjs_timer_handle* ${statement.name} = 0;`]
  }

  const fetchHeadersCall = emitPreparedFetchHeadersCallExpression(statement.init, context, {
    out: statement.name
  })

  if (fetchHeadersCall != null && statement.valueType === 'boolean') {
    context.variables.set(statement.name, 'boolean')
    return fetchHeadersCall.lines
  }

  const inferred = inferExpressionType(statement.init, context)
  context.variables.set(statement.name, inferred)

  if (inferred === 'string') {
    if (context.boxedMutableCaptureDeclarations.has(statement)) {
      return emitBoxedRuntimeValueVariableDeclaration(statement, statement.init, context)
    }

    const runtimeString = resolveRuntimeStringReference(statement.init, context)

    if (runtimeString != null) {
      context.runtimeStrings.add(statement.name)
      return [`${statement.kind === 'const' ? 'const ' : ''}ccjs_string* ${statement.name} = ${runtimeString};`]
    }

    const runtimeElement = resolveRuntimeArrayIndex(statement.init, context)

    if (context.forceRuntimeStringDeclarations?.has(statement.name) && isRawStringLiteralExpression(statement.init)) {
      return emitRuntimeStringVariableDeclaration(statement, statement.init, context)
    }

    if (isRuntimeProducedStringExpression(statement.init, context) || runtimeElement?.valueType === 'string') {
      return emitRuntimeStringVariableDeclaration(statement, statement.init, context)
    }

    return [
      `${statement.kind === 'const' ? 'const ' : ''}char* ${statement.name} = ${emitStringExpression(statement.init, context)};`
    ]
  }

  if (inferred === 'function') {
    const runtimeFunctionType = isRuntimeArrowCallbackExpression(statement.init, context)
      ? normalizeFunctionType(statement.functionType)
      : null

    context.variables.set(statement.name, 'function')
    context.functionTypes.set(statement.name, runtimeFunctionType ?? statement.functionType)

    if (isRuntimeFunctionType(statement.functionType) || runtimeFunctionType != null) {
      return emitRuntimeCallbackVariableDeclaration(statement, context)
    }

    return [
      `${emitFunctionPointerVariable(statement.name, statement.init, context, statement.kind === 'const', statement.functionType, statement.loc)};`
    ]
  }

  if (isArrayMethodCall(statement.init)) {
    context.diagnostics.push(
      diagnostic('CCJS_C_ARRAY_METHOD', 'array methods are not supported by the current C backend slice', statement.loc)
    )
    return [`double ${statement.name} = 0;`]
  }

  if (inferred === 'timer') {
    const handle = emitPreparedTimerHandleExpression(statement.init, context)

    context.variables.set(statement.name, 'timer')

    return [...handle.lines, `ccjs_timer_handle* ${statement.name} = ${handle.expression};`]
  }

  if ((inferred === 'number' || inferred === 'boolean') && context.boxedMutableCaptureDeclarations.has(statement)) {
    return emitBoxedScalarVariableDeclaration(statement, context)
  }

  if (!['number', 'boolean'].includes(inferred)) {
    context.diagnostics.push(
      diagnostic(
        cUnsupportedExpressionCode(inferred),
        'this expression is not supported by the current C backend slice',
        statement.loc
      )
    )
    return [`double ${statement.name} = 0;`]
  }

  const value = emitPreparedNumberExpression(statement.init, context)

  return [
    ...value.lines,
    `${statement.kind === 'const' ? 'const ' : ''}double ${statement.name} = ${value.expression};`
  ]
}

function emitBoxedScalarVariableDeclaration(statement, context) {
  const value = emitPreparedNumberExpression(statement.init, context)
  const inferred = inferExpressionType(statement.init, context)

  registerBoxedValue(context, statement.name, inferred)
  context.boxedVariables.add(statement.name)

  return [
    ...value.lines,
    `${statement.name} = ccjs_default_alloc(0, sizeof(double), _Alignof(double));`,
    `if (${statement.name} == 0) ${emitFailureStatement(context)}`,
    `*${statement.name} = ${value.expression};`
  ]
}

function emitBoxedRuntimeValueVariableDeclaration(statement, expression, context) {
  const valueType = inferExpressionType(expression, context)
  const value = emitCValueExpression(expression, context)
  const tag = valueType === 'string' ? 'CCJS_TAG_STRING' : 'CCJS_TAG_OBJECT'

  registerBoxedValue(context, statement.name, valueType)
  context.boxedVariables.add(statement.name)
  context.variables.set(statement.name, valueType)

  return [
    ...value.lines,
    `${statement.name} = ccjs_default_alloc(0, sizeof(ccjs_value), _Alignof(ccjs_value));`,
    `if (${statement.name} == 0) ${emitFailureStatement(context)}`,
    `*${statement.name} = ${value.expression};`,
    emitRuntimeTypeCheck(`(*${statement.name}).tag != ${tag} || (*${statement.name}).as.ref == 0`, context),
    `ccjs_retain(*${statement.name});`
  ]
}

function isBoxedRuntimeValueAssignment(expression, context) {
  return (
    expression.target?.type === 'Reference' &&
    expression.target.path.length === 1 &&
    isBoxedRuntimeValueName(expression.target.path[0], context)
  )
}

function isNullableRuntimeValueAssignment(expression, context) {
  return (
    expression.target?.type === 'Reference' &&
    expression.target.path.length === 1 &&
    context.nullableVariables.has(expression.target.path[0])
  )
}

function emitNullableRuntimeValueAssignment(expression, context) {
  const name = expression.target.path[0]
  const expectedTag = cRuntimeValueTag(context.variables.get(name))
  const targetType = context.variables.get(name)
  const value = isNullableScalarType(targetType)
    ? emitNullableScalarValueExpression(expression.value, context)
    : targetType === 'function'
      ? emitNullableFunctionValueExpression(expression.value, context.functionTypes.get(name), context)
      : expression.value.type === 'ObjectLiteral'
        ? emitCObjectLiteralValueExpression(
            expression.value,
            context,
            context.objectShapes.get(name) == null
              ? null
              : {
                  fields: context.objectShapes.get(name)
                }
          )
        : emitCValueExpression(expression.value, context)
  const temp = nextCName(context, 'ccjs_nullable_value')

  return [
    ...value.lines,
    `ccjs_value ${temp} = ${value.expression};`,
    ...emitRuntimeNullableValueCheck(temp, expectedTag, context),
    `ccjs_retain(${temp});`,
    `ccjs_release(${name});`,
    `${name} = ${temp};`,
    ...clearNullableScalarNarrowing(name, context)
  ]
}

function emitBoxedRuntimeValueAssignment(expression, context) {
  const name = expression.target.path[0]
  const expected = context.variables.get(name)
  const value = emitCValueExpression(expression.value, context)
  const temp = nextCName(context, 'ccjs_box_value')
  const tag = expected === 'string' ? 'CCJS_TAG_STRING' : 'CCJS_TAG_OBJECT'

  return [
    ...value.lines,
    `ccjs_value ${temp} = ${value.expression};`,
    emitRuntimeTypeCheck(`${temp}.tag != ${tag} || ${temp}.as.ref == 0`, context),
    `ccjs_retain(${temp});`,
    `ccjs_release(*${name});`,
    `*${name} = ${temp};`
  ]
}

function isNullableScalarRuntimeExpression(expression, context) {
  return (
    isNullableScalarType(inferExpressionType(expression, context)) && isNullableRuntimeExpression(expression, context)
  )
}

function isBoxedRuntimeValueName(name, context) {
  return context.boxedVariables.has(name) && isRuntimeBoxedValueType(context.variables.get(name))
}

function isBoxedRuntimeStringName(name, context) {
  return context.boxedVariables.has(name) && context.variables.get(name) === 'string'
}

function isBoxedRuntimeStringReference(expression, context) {
  return (
    expression?.type === 'Reference' &&
    expression.path.length === 1 &&
    isBoxedRuntimeStringName(expression.path[0], context)
  )
}

function emitBoxedObjectVariableDeclaration(statement, context) {
  const shapeName = nextCName(context, `ccjs_shape_${statement.name}`)
  const fieldsName = `${shapeName}_fields`
  const fields =
    statement.shape?.fields ??
    statement.init.properties.map((property) => ({
      name: property.key,
      readonly: false,
      valueType: inferExpressionType(property.value, context)
    }))
  const properties = new Map<string, AnyNode>(statement.init.properties.map((property) => [property.key, property]))
  const lines = [`static const ccjs_field_info ${fieldsName}[] = {`]

  for (const field of fields) {
    lines.push(`  { ${cStringLiteral(field.name)}, ${field.readonly ? 'CCJS_FIELD_READONLY' : '0'} },`)
  }

  lines.push('};')
  lines.push(`static const ccjs_shape ${shapeName} = {`)
  lines.push(`  ${fields.length},`)
  lines.push(`  ${fieldsName}`)
  lines.push('};')
  registerBoxedValue(context, statement.name, 'object')
  context.boxedVariables.add(statement.name)
  context.variables.set(statement.name, 'object')
  context.objectShapes.set(
    statement.name,
    fields.map((field) => ({
      name: field.name,
      valueType: field.valueType,
      arrayElementType: field.arrayElementType,
      mapKeyType: field.mapKeyType,
      mapValueType: field.mapValueType,
      setElementType: field.setElementType
    }))
  )
  lines.push(`${statement.name} = ccjs_default_alloc(0, sizeof(ccjs_value), _Alignof(ccjs_value));`)
  lines.push(`if (${statement.name} == 0) ${emitFailureStatement(context)}`)
  lines.push(`*${statement.name} = ccjs_undefined_value();`)
  lines.push(emitStatusCheck(`ccjs_object_new(&ccjs_default_allocator, &${shapeName}, ${statement.name})`, context))

  for (const [index, field] of fields.entries()) {
    const property = properties.get(field.name)

    if (property == null) {
      context.diagnostics.push(diagnostic('CCJS_MISSING_FIELD', `missing field ${field.name}`, statement.loc))
      continue
    }

    const value = emitCValueExpression(property.value, context)
    lines.push(...value.lines)
    lines.push(emitStatusCheck(`ccjs_object_init_known(*${statement.name}, ${index}, ${value.expression})`, context))
  }

  return lines
}

function emitKnownObjectMemberVariableDeclaration(statement, member, context) {
  return emitObjectMemberVariableDeclaration(
    statement,
    member,
    context,
    (temp) =>
      `ccjs_object_get_known(${emitObjectValueReference(member.objectName, context)}, ${member.index}, &${temp})`
  )
}

function emitDynamicObjectMemberVariableDeclaration(statement, member, context) {
  return emitObjectMemberVariableDeclaration(
    statement,
    member,
    context,
    (temp) =>
      `ccjs_object_get(${emitObjectValueReference(member.objectName, context)}, ${cStringLiteral(member.key)}, ${utf8ByteLength(member.key)}, &${temp})`
  )
}

function emitObjectMemberVariableDeclaration(statement, member, context, emitGetCall) {
  if (member.valueType === 'array') {
    return emitObjectArrayMemberVariableDeclaration(statement, member, context, emitGetCall)
  }

  if (member.valueType === 'map' || member.valueType === 'set') {
    return emitObjectCollectionMemberVariableDeclaration(statement, member, context, emitGetCall)
  }

  if (member.valueType === 'bytes') {
    return emitObjectBytesMemberVariableDeclaration(statement, member, context, emitGetCall)
  }

  if (member.valueType === 'object') {
    return emitObjectObjectMemberVariableDeclaration(statement, member, context, emitGetCall)
  }

  if (member.valueType === 'string') {
    return emitObjectStringMemberVariableDeclaration(statement, member, context, emitGetCall)
  }

  if (!['number', 'boolean'].includes(member.valueType)) {
    context.diagnostics.push(
      diagnostic(
        cUnsupportedExpressionCode(member.valueType),
        member.valueType === 'function'
          ? 'stored callback object fields need delayed closure lifetime support and are not supported by the current C backend slice'
          : 'this object field type is not supported by the current C backend slice',
        statement.loc
      )
    )
    return [`double ${statement.name} = 0;`]
  }

  const temp = nextCName(context, 'ccjs_field')
  registerOwnedValue(context, temp)
  const lines = [
    ...emitPrepareOwnedValueWrite(temp),
    emitStatusCheck(emitGetCall(temp), context),
    `${statement.kind === 'const' ? 'const ' : ''}double ${statement.name} = ${member.valueType === 'boolean' ? `${temp}.as.boolean ? 1 : 0` : `${temp}.as.number`};`
  ]

  context.variables.set(statement.name, member.valueType)

  return lines
}

function emitObjectArrayMemberVariableDeclaration(statement, member, context, emitGetCall) {
  registerOwnedValue(context, statement.name)

  const lines = [
    ...emitPrepareOwnedValueWrite(statement.name),
    emitStatusCheck(emitGetCall(statement.name), context),
    emitRuntimeTypeCheck(`${statement.name}.tag != CCJS_TAG_ARRAY || ${statement.name}.as.ref == 0`, context)
  ]

  context.variables.set(statement.name, 'array')
  context.runtimeArrayElementTypes.set(statement.name, member.arrayElementType ?? 'unknown')

  return lines
}

function emitObjectCollectionMemberVariableDeclaration(statement, member, context, emitGetCall) {
  registerOwnedValue(context, statement.name)

  const tag = member.valueType === 'map' ? 'CCJS_TAG_MAP' : 'CCJS_TAG_SET'
  const lines = [
    ...emitPrepareOwnedValueWrite(statement.name),
    emitStatusCheck(emitGetCall(statement.name), context),
    emitRuntimeTypeCheck(`${statement.name}.tag != ${tag} || ${statement.name}.as.ref == 0`, context)
  ]

  context.variables.set(statement.name, member.valueType)

  if (member.valueType === 'map') {
    context.mapTypes.set(statement.name, {
      key: member.mapKeyType ?? 'unknown',
      value: member.mapValueType ?? 'unknown'
    })
  } else {
    context.setElementTypes.set(statement.name, member.setElementType ?? 'unknown')
  }

  return lines
}

function emitObjectBytesMemberVariableDeclaration(statement, member, context, emitGetCall) {
  registerOwnedValue(context, statement.name)
  const lines = [
    ...emitPrepareOwnedValueWrite(statement.name),
    emitStatusCheck(emitGetCall(statement.name), context),
    emitRuntimeTypeCheck(`${statement.name}.tag != CCJS_TAG_BYTES || ${statement.name}.as.ref == 0`, context)
  ]

  context.variables.set(statement.name, member.valueType)

  return lines
}

function emitObjectObjectMemberVariableDeclaration(statement, member, context, emitGetCall) {
  registerOwnedValue(context, statement.name)
  const lines = [
    ...emitPrepareOwnedValueWrite(statement.name),
    emitStatusCheck(emitGetCall(statement.name), context),
    emitRuntimeTypeCheck(`${statement.name}.tag != CCJS_TAG_OBJECT || ${statement.name}.as.ref == 0`, context)
  ]

  context.variables.set(statement.name, 'object')

  if (statement.shape != null) {
    registerObjectShape(context, statement.name, statement.shape)
  }

  return lines
}

function emitObjectStringMemberVariableDeclaration(statement, member, context, emitGetCall) {
  const temp = nextCName(context, 'ccjs_field')
  registerOwnedValue(context, temp)
  const lines = [
    ...emitPrepareOwnedValueWrite(temp),
    emitStatusCheck(emitGetCall(temp), context),
    emitRuntimeTypeCheck(`${temp}.tag != CCJS_TAG_STRING || ${temp}.as.ref == 0`, context),
    `${statement.kind === 'const' ? 'const ' : ''}ccjs_string* ${statement.name} = (ccjs_string*)${temp}.as.ref;`
  ]

  context.variables.set(statement.name, 'string')
  context.runtimeStrings.add(statement.name)

  return lines
}

function emitKnownObjectMemberAssignment(expression, member, context) {
  const value = emitCValueExpression(expression.value, context)
  const valueType = inferExpressionType(expression.value, context)

  updateKnownObjectMemberValueType(member, valueType, context)

  return [
    ...value.lines,
    emitStatusCheck(
      `ccjs_object_set_known(${emitObjectValueReference(member.objectName, context)}, ${member.index}, ${value.expression})`,
      context
    )
  ]
}

function emitDynamicObjectMemberAssignment(expression, member, context) {
  const value = emitCValueExpression(expression.value, context)
  const valueType = inferExpressionType(expression.value, context)

  updateKnownObjectMemberValueType(member, valueType, context)

  return [
    ...value.lines,
    emitStatusCheck(
      `ccjs_object_set(${emitObjectValueReference(member.objectName, context)}, ${cStringLiteral(member.key)}, ${utf8ByteLength(member.key)}, ${value.expression})`,
      context
    )
  ]
}

function emitKnownArrayIndexVariableDeclaration(statement, element, context) {
  if (element.valueType === 'string') {
    return emitKnownArrayStringIndexVariableDeclaration(statement, element, context)
  }

  if (!['number', 'boolean'].includes(element.valueType)) {
    context.diagnostics.push(
      diagnostic(
        cUnsupportedExpressionCode(element.valueType),
        element.valueType === 'function'
          ? 'stored callback array elements need delayed closure lifetime support and are not supported by the current C backend slice'
          : 'this array element type is not supported by the current C backend slice',
        statement.loc
      )
    )
    return [`double ${statement.name} = 0;`]
  }

  const temp = nextCName(context, 'ccjs_item')
  registerOwnedValue(context, temp)
  const lines = [
    ...emitPrepareOwnedValueWrite(temp),
    emitStatusCheck(`ccjs_array_get(${element.arrayName}, ${element.index}, &${temp})`, context),
    `${statement.kind === 'const' ? 'const ' : ''}double ${statement.name} = ${element.valueType === 'boolean' ? `${temp}.as.boolean ? 1 : 0` : `${temp}.as.number`};`
  ]

  context.variables.set(statement.name, element.valueType)

  return lines
}

function emitKnownArrayStringIndexVariableDeclaration(statement, element, context) {
  const temp = nextCName(context, 'ccjs_item')
  registerOwnedValue(context, temp)
  const lines = [
    ...emitPrepareOwnedValueWrite(temp),
    emitStatusCheck(`ccjs_array_get(${element.arrayName}, ${element.index}, &${temp})`, context),
    emitRuntimeTypeCheck(`${temp}.tag != CCJS_TAG_STRING || ${temp}.as.ref == 0`, context),
    `${statement.kind === 'const' ? 'const ' : ''}ccjs_string* ${statement.name} = (ccjs_string*)${temp}.as.ref;`
  ]

  context.variables.set(statement.name, 'string')
  context.runtimeStrings.add(statement.name)

  return lines
}

function emitKnownArrayIndexAssignment(expression, element, context) {
  const value = emitCValueExpression(expression.value, context)
  const valueType = inferExpressionType(expression.value, context)

  updateKnownArrayElementValueType(element, valueType, context)

  return [
    ...value.lines,
    emitStatusCheck(`ccjs_array_set(${element.arrayName}, ${element.index}, ${value.expression})`, context)
  ]
}

function emitArrayVariableDeclaration(statement, context) {
  const lines = [
    ...emitPrepareOwnedValueWrite(statement.name),
    emitStatusCheck(
      `ccjs_array_new(&ccjs_default_allocator, ${statement.init.elements.length}, &${statement.name})`,
      context
    )
  ]

  registerOwnedValue(context, statement.name)
  context.variables.set(statement.name, 'array')
  context.arrayShapes.set(
    statement.name,
    statement.init.elements.map((element) => ({
      valueType: inferExpressionType(element, context)
    }))
  )

  for (const [index, element] of statement.init.elements.entries()) {
    const value = emitCValueExpression(element, context)
    lines.push(...value.lines)
    lines.push(emitStatusCheck(`ccjs_array_set(${statement.name}, ${index}, ${value.expression})`, context))
  }

  return lines
}

function emitCValueExpression(expression, context) {
  if (isNullishCoalescingExpression(expression)) {
    return emitCNullishCoalescingValueExpression(expression, context)
  }

  if (expression?.type === 'AwaitExpression') {
    return emitCAwaitValueExpression(expression, context)
  }

  const fsSyncValue = emitPreparedFsSyncValueExpression(expression, context)

  if (fsSyncValue != null) {
    return fsSyncValue
  }

  const fetchHeadersCall = emitPreparedFetchHeadersCallExpression(expression, context)

  if (fetchHeadersCall != null) {
    return fetchHeadersCall
  }

  const jsonCall = emitPreparedJsonCallExpression(expression, context)

  if (jsonCall != null) {
    return jsonCall
  }

  const cryptoCall = emitPreparedCryptoCallExpression(expression, context)

  if (cryptoCall != null) {
    return cryptoCall
  }

  const binaryValue = emitPreparedBinaryValueExpression(expression, context)

  if (binaryValue != null) {
    return binaryValue
  }

  const arrayPopCall = emitPreparedArrayPopCallExpression(expression, context)

  if (arrayPopCall != null) {
    return arrayPopCall
  }

  const mapIndexGet = emitPreparedMapIndexGetExpression(expression, context)

  if (mapIndexGet != null) {
    return mapIndexGet
  }

  if (isErrorConstructorExpression(expression)) {
    return emitCErrorObjectValueExpression(expression, context)
  }

  if (isClassConstructorExpression(expression, context)) {
    return emitCClassObjectValueExpression(expression, context)
  }

  if (expression?.type === 'OptionalCallExpression' && isNullableRuntimeExpression(expression, context)) {
    return emitOptionalRuntimeCallbackCallValueExpression(expression, context)
  }

  const numberConversion = emitCNumberConversionValueExpression(expression, context)

  if (numberConversion != null) {
    return numberConversion
  }

  if (isNullableScalarRuntimeExpression(expression, context)) {
    return emitPreparedNullableScalarRuntimeValueExpression(expression, context)
  }

  if (isStringConversionCall(expression, context)) {
    return emitCStringConversionValueExpression(expression, context)
  }

  if (isStringTrimCall(expression, context)) {
    return emitCStringTrimValueExpression(expression, context)
  }

  if (isStringSliceCall(expression, context)) {
    return emitCStringSliceValueExpression(expression, context)
  }

  if (isStringSplitCall(expression, context)) {
    return emitCStringSplitValueExpression(expression, context)
  }

  if (isStringConcatExpression(expression, context)) {
    return emitCStringConcatValueExpression(expression, context)
  }

  if (expression?.type === 'TemplateLiteral') {
    return emitCTemplateLiteralValueExpression(expression, context)
  }

  if (expression?.type === 'ArrayLiteral') {
    return emitCArrayLiteralValueExpression(expression, context)
  }

  if (expression?.type === 'ObjectLiteral') {
    return emitCObjectLiteralValueExpression(expression, context)
  }

  if (expression?.type === 'StringLiteral') {
    const temp = nextCName(context, 'ccjs_value')
    registerOwnedValue(context, temp)

    return {
      lines: [
        ...emitPrepareOwnedValueWrite(temp),
        emitStatusCheck(
          `ccjs_string_from_literal(&ccjs_default_allocator, ${cStringLiteral(expression.value)}, ${utf8ByteLength(expression.value)}, &${temp})`,
          context
        )
      ],
      expression: temp
    }
  }

  if (expression?.type === 'NumberLiteral') {
    return {
      lines: [],
      expression: `ccjs_number_value(${expression.value})`
    }
  }

  if (expression?.type === 'BooleanLiteral') {
    return {
      lines: [],
      expression: `ccjs_bool_value(${expression.value ? 'true' : 'false'})`
    }
  }

  if (expression?.type === 'NullLiteral') {
    return {
      lines: [],
      expression: 'ccjs_null_value()'
    }
  }

  if (expression?.type === 'Reference') {
    const name = expression.path.join('_')
    const type = context.variables.get(name)

    if (context.nullableVariables.has(name)) {
      return {
        lines: [],
        expression: name
      }
    }

    if (isBoxedRuntimeValueName(name, context)) {
      const tag = type === 'string' ? 'CCJS_TAG_STRING' : 'CCJS_TAG_OBJECT'

      return {
        lines: [emitRuntimeTypeCheck(`(*${name}).tag != ${tag} || (*${name}).as.ref == 0`, context)],
        expression: `(*${name})`
      }
    }

    if (type === 'string' && context.runtimeStrings.has(name)) {
      const temp = nextCName(context, 'ccjs_value')

      return {
        lines: [
          `ccjs_value ${temp};`,
          `${temp}.tag = CCJS_TAG_STRING;`,
          `${temp}.as.ref = (ccjs_ref*)&${name}->header;`
        ],
        expression: temp
      }
    }

    if (type === 'bytes' || type === 'object' || type === 'array') {
      return {
        lines: [],
        expression: name
      }
    }

    if (type === 'map' || type === 'set') {
      return {
        lines: [],
        expression: name
      }
    }

    if (type === 'number') {
      return {
        lines: [],
        expression: `ccjs_number_value(${name})`
      }
    }

    if (type === 'boolean') {
      return {
        lines: [],
        expression: `ccjs_bool_value(${name})`
      }
    }
  }

  if (expression?.type === 'OptionalMemberExpression') {
    return emitCOptionalMemberValueExpression(expression, context)
  }

  if (expression?.type === 'OptionalIndexExpression') {
    return emitCOptionalIndexValueExpression(expression, context)
  }

  if (isMemberAccessExpression(expression)) {
    const member = resolveKnownObjectMember(expression, context)

    if (
      member?.valueType === 'bytes' ||
      member?.valueType === 'array' ||
      member?.valueType === 'map' ||
      member?.valueType === 'set'
    ) {
      const temp = nextCName(context, 'ccjs_value')
      const tag = cRuntimeValueTag(member.valueType)
      registerOwnedValue(context, temp)

      return {
        lines: [
          ...emitPrepareOwnedValueWrite(temp),
          emitStatusCheck(
            `ccjs_object_get_known(${emitObjectValueReference(member.objectName, context)}, ${member.index}, &${temp})`,
            context
          ),
          emitRuntimeTypeCheck(`${temp}.tag != ${tag} || ${temp}.as.ref == 0`, context)
        ],
        expression: temp
      }
    }

    if (member?.valueType === 'object') {
      const temp = nextCName(context, 'ccjs_value')
      registerOwnedValue(context, temp)

      return {
        lines: [
          ...emitPrepareOwnedValueWrite(temp),
          emitStatusCheck(
            `ccjs_object_get_known(${emitObjectValueReference(member.objectName, context)}, ${member.index}, &${temp})`,
            context
          ),
          emitRuntimeTypeCheck(`${temp}.tag != CCJS_TAG_OBJECT || ${temp}.as.ref == 0`, context)
        ],
        expression: temp
      }
    }

    if (member?.valueType === 'string') {
      const temp = nextCName(context, 'ccjs_value')
      registerOwnedValue(context, temp)

      return {
        lines: [
          ...emitPrepareOwnedValueWrite(temp),
          emitStatusCheck(
            `ccjs_object_get_known(${emitObjectValueReference(member.objectName, context)}, ${member.index}, &${temp})`,
            context
          ),
          emitRuntimeTypeCheck(`${temp}.tag != CCJS_TAG_STRING || ${temp}.as.ref == 0`, context)
        ],
        expression: temp
      }
    }
  }

  if (isIndexAccessExpression(expression)) {
    const element = resolveKnownArrayIndex(expression, context)

    if (element?.valueType === 'array') {
      const temp = nextCName(context, 'ccjs_value')
      registerOwnedValue(context, temp)

      return {
        lines: [
          ...emitPrepareOwnedValueWrite(temp),
          emitStatusCheck(`ccjs_array_get(${element.arrayName}, ${element.index}, &${temp})`, context),
          emitRuntimeTypeCheck(`${temp}.tag != CCJS_TAG_ARRAY || ${temp}.as.ref == 0`, context)
        ],
        expression: temp
      }
    }

    const runtimeElement = resolveRuntimeArrayIndex(expression, context)

    if (runtimeElement != null && ['boolean', 'number', 'string'].includes(runtimeElement.valueType)) {
      const value = emitPreparedRuntimeArrayIndexValue(expression, runtimeElement, context, 'ccjs_value')

      return runtimeElement.valueType === 'string'
        ? {
            lines: [
              ...value.lines,
              emitRuntimeTypeCheck(
                `${value.expression}.tag != CCJS_TAG_STRING || ${value.expression}.as.ref == 0`,
                context
              )
            ],
            expression: value.expression
          }
        : value
    }

    if (element?.valueType === 'string') {
      const temp = nextCName(context, 'ccjs_value')
      registerOwnedValue(context, temp)

      return {
        lines: [
          ...emitPrepareOwnedValueWrite(temp),
          emitStatusCheck(`ccjs_array_get(${element.arrayName}, ${element.index}, &${temp})`, context),
          emitRuntimeTypeCheck(`${temp}.tag != CCJS_TAG_STRING || ${temp}.as.ref == 0`, context)
        ],
        expression: temp
      }
    }

    const field = resolveKnownObjectIndex(expression, context)

    if (
      field?.valueType === 'bytes' ||
      field?.valueType === 'array' ||
      field?.valueType === 'map' ||
      field?.valueType === 'set'
    ) {
      const temp = nextCName(context, 'ccjs_value')
      const tag = cRuntimeValueTag(field.valueType)
      registerOwnedValue(context, temp)

      return {
        lines: [
          ...emitPrepareOwnedValueWrite(temp),
          emitStatusCheck(
            `ccjs_object_get(${emitObjectValueReference(field.objectName, context)}, ${cStringLiteral(field.key)}, ${utf8ByteLength(field.key)}, &${temp})`,
            context
          ),
          emitRuntimeTypeCheck(`${temp}.tag != ${tag} || ${temp}.as.ref == 0`, context)
        ],
        expression: temp
      }
    }

    if (field?.valueType === 'object') {
      const temp = nextCName(context, 'ccjs_value')
      registerOwnedValue(context, temp)

      return {
        lines: [
          ...emitPrepareOwnedValueWrite(temp),
          emitStatusCheck(
            `ccjs_object_get(${emitObjectValueReference(field.objectName, context)}, ${cStringLiteral(field.key)}, ${utf8ByteLength(field.key)}, &${temp})`,
            context
          ),
          emitRuntimeTypeCheck(`${temp}.tag != CCJS_TAG_OBJECT || ${temp}.as.ref == 0`, context)
        ],
        expression: temp
      }
    }

    if (field?.valueType === 'string') {
      const temp = nextCName(context, 'ccjs_value')
      registerOwnedValue(context, temp)

      return {
        lines: [
          ...emitPrepareOwnedValueWrite(temp),
          emitStatusCheck(
            `ccjs_object_get(${emitObjectValueReference(field.objectName, context)}, ${cStringLiteral(field.key)}, ${utf8ByteLength(field.key)}, &${temp})`,
            context
          ),
          emitRuntimeTypeCheck(`${temp}.tag != CCJS_TAG_STRING || ${temp}.as.ref == 0`, context)
        ],
        expression: temp
      }
    }
  }

  if (expression?.type === 'CallExpression' && isManagedRuntimeReturnType(inferExpressionType(expression, context))) {
    const valueType = inferExpressionType(expression, context)
    const collectionCall = emitPreparedCollectionCallExpression(expression, context)

    if (collectionCall != null) {
      return collectionCall
    }

    const classMethodCall = emitPreparedClassMethodCallExpression(expression, context)

    if (classMethodCall != null) {
      return classMethodCall
    }

    const temp = nextCName(context, 'ccjs_value')
    const tag = cRuntimeValueTag(valueType)
    registerOwnedValue(context, temp)
    const call = emitPreparedCallExpression(expression, context)

    return {
      lines: [
        ...call.lines,
        ...emitPrepareOwnedValueWrite(temp),
        `${temp} = ${call.expression};`,
        emitRuntimeValueCheck(temp, tag, context)
      ],
      expression: temp
    }
  }

  const unsupportedType = inferExpressionType(expression, context)
  context.diagnostics.push(
    diagnostic(
      cUnsupportedExpressionCode(unsupportedType),
      unsupportedType === 'function'
        ? 'stored callback values need delayed closure lifetime support and are not supported by the current C backend slice'
        : 'this object field expression is not supported by the current C backend slice',
      expression?.loc
    )
  )

  return {
    lines: [],
    expression: 'ccjs_undefined_value()'
  }
}

function emitNullableScalarValueExpression(expression, context) {
  if (expression?.type === 'NullLiteral') {
    return {
      lines: [],
      expression: 'ccjs_null_value()'
    }
  }

  if (isNullableScalarRuntimeExpression(expression, context)) {
    return emitPreparedNullableScalarRuntimeValueExpression(expression, context)
  }

  const valueType = inferExpressionType(expression, context)

  if (!isNullableScalarType(valueType)) {
    context.diagnostics.push(
      diagnostic(
        'CCJS_C_NULLISH',
        'nullable scalar values currently support only number, boolean and null values in C',
        expression?.loc
      )
    )

    return {
      lines: [],
      expression: 'ccjs_null_value()'
    }
  }

  const value = emitPreparedNumberExpression(expression, context)

  return {
    lines: value.lines,
    expression:
      valueType === 'boolean' ? `ccjs_bool_value((${value.expression}) != 0)` : `ccjs_number_value(${value.expression})`
  }
}

function emitPreparedNullableScalarRuntimeValueExpression(expression, context) {
  if (
    expression?.type === 'Reference' &&
    expression.path.length === 1 &&
    context.nullableVariables.has(expression.path[0]) &&
    isNullableScalarType(context.variables.get(expression.path[0]))
  ) {
    return {
      lines: [],
      expression: expression.path[0]
    }
  }

  if (expression?.type === 'OptionalMemberExpression') {
    return emitCOptionalMemberValueExpression(expression, context)
  }

  if (expression?.type === 'OptionalIndexExpression') {
    return emitCOptionalIndexValueExpression(expression, context)
  }

  if (expression?.type === 'OptionalCallExpression') {
    return emitOptionalRuntimeCallbackCallValueExpression(expression, context)
  }

  const numberConversion = emitCNumberConversionValueExpression(expression, context)

  if (numberConversion != null) {
    return numberConversion
  }

  const mapIndexGet = emitPreparedMapIndexGetExpression(expression, context)

  if (mapIndexGet != null) {
    return mapIndexGet
  }

  if (expression?.type === 'CallExpression' && isNullableScalarRuntimeExpression(expression, context)) {
    const valueType = inferExpressionType(expression, context)
    const expectedTag = cRuntimeValueTag(valueType)
    const call = emitPreparedCallExpression(expression, context)
    const temp = nextCName(context, 'ccjs_nullable_value')
    registerOwnedValue(context, temp)

    return {
      lines: [
        ...call.lines,
        ...emitPrepareOwnedValueWrite(temp),
        `${temp} = ${call.expression};`,
        ...emitRuntimeNullableValueCheck(temp, expectedTag, context)
      ],
      expression: temp
    }
  }

  context.diagnostics.push(
    diagnostic(
      'CCJS_C_NULLISH',
      'this nullable scalar expression is not supported by the current C backend slice',
      expression?.loc
    )
  )

  return {
    lines: [],
    expression: 'ccjs_null_value()'
  }
}

function emitNullableFunctionValueExpression(expression, functionType, context) {
  if (expression?.type === 'NullLiteral') {
    return {
      lines: [],
      expression: 'ccjs_null_value()'
    }
  }

  if (
    expression?.type === 'Reference' &&
    expression.path.length === 1 &&
    context.nullableVariables.has(expression.path[0]) &&
    context.variables.get(expression.path[0]) === 'function'
  ) {
    return {
      lines: [],
      expression: expression.path[0]
    }
  }

  return emitRuntimeCallbackValue(expression, normalizeFunctionType(functionType), context)
}

function emitCArrayLiteralValueExpression(expression, context) {
  const temp = nextCName(context, 'ccjs_array')
  registerOwnedValue(context, temp)
  const lines = [
    ...emitPrepareOwnedValueWrite(temp),
    emitStatusCheck(`ccjs_array_new(&ccjs_default_allocator, ${expression.elements.length}, &${temp})`, context)
  ]

  for (const [index, element] of expression.elements.entries()) {
    const value = emitCValueExpression(element, context)
    lines.push(...value.lines)
    lines.push(emitStatusCheck(`ccjs_array_set(${temp}, ${index}, ${value.expression})`, context))
  }

  return {
    lines,
    expression: temp
  }
}

function emitCObjectLiteralValueExpression(expression, context, shape: AnyNode | null = null) {
  const temp = nextCName(context, 'ccjs_object')
  const shapeName = nextCName(context, 'ccjs_shape_value')
  const fieldsName = `${shapeName}_fields`
  const fields =
    shape?.fields ??
    expression.properties.map((property) => ({
      name: property.key,
      readonly: false,
      valueType: inferExpressionType(property.value, context)
    }))
  const properties = new Map<string, AnyNode>(expression.properties.map((property) => [property.key, property]))
  const lines = [`static const ccjs_field_info ${fieldsName}[] = {`]

  for (const field of fields) {
    lines.push(`  { ${cStringLiteral(field.name)}, ${field.readonly ? 'CCJS_FIELD_READONLY' : '0'} },`)
  }

  lines.push('};')
  lines.push(`static const ccjs_shape ${shapeName} = {`)
  lines.push(`  ${fields.length},`)
  lines.push(`  ${fieldsName}`)
  lines.push('};')
  registerOwnedValue(context, temp)
  lines.push(...emitPrepareOwnedValueWrite(temp))
  lines.push(emitStatusCheck(`ccjs_object_new(&ccjs_default_allocator, &${shapeName}, &${temp})`, context))

  for (const [index, field] of fields.entries()) {
    const property = properties.get(field.name)

    if (property == null) {
      context.diagnostics.push(diagnostic('CCJS_MISSING_FIELD', `missing field ${field.name}`, expression.loc))
      continue
    }

    const value = emitCValueExpression(property.value, context)
    lines.push(...value.lines)
    lines.push(emitStatusCheck(`ccjs_object_init_known(${temp}, ${index}, ${value.expression})`, context))
  }

  return {
    lines,
    expression: temp
  }
}

function emitErrorObjectVariableDeclaration(statement, context) {
  registerOwnedValue(context, statement.name)
  context.variables.set(statement.name, 'object')
  registerErrorObjectShape(context, statement.name)

  return emitCErrorObjectInitLines(statement.name, statement.init, context)
}

function emitCErrorObjectValueExpression(expression, context) {
  const temp = nextCName(context, 'ccjs_error_object')
  registerOwnedValue(context, temp)

  return {
    lines: emitCErrorObjectInitLines(temp, expression, context),
    expression: temp
  }
}

function emitCErrorObjectInitLines(target, expression, context) {
  const shapeName = nextCName(context, 'ccjs_shape_error')
  const fieldsName = `${shapeName}_fields`
  const parts = errorConstructorExpressions(expression, context)
  const name = emitCValueExpression(cStringLiteralNode('Error', expression.loc), context)
  const message = emitCValueExpression(parts.message, context)
  const code = emitCValueExpression(parts.code, context)
  const cause = emitCValueExpression(parts.cause, context)

  return [
    `static const ccjs_field_info ${fieldsName}[] = {`,
    `  { ${cStringLiteral('name')}, CCJS_FIELD_READONLY },`,
    `  { ${cStringLiteral('message')}, CCJS_FIELD_READONLY },`,
    `  { ${cStringLiteral('code')}, CCJS_FIELD_READONLY },`,
    `  { ${cStringLiteral('cause')}, CCJS_FIELD_READONLY },`,
    '};',
    `static const ccjs_shape ${shapeName} = {`,
    '  4,',
    `  ${fieldsName}`,
    '};',
    ...emitPrepareOwnedValueWrite(target),
    emitStatusCheck(`ccjs_object_new(&ccjs_default_allocator, &${shapeName}, &${target})`, context),
    ...name.lines,
    emitStatusCheck(`ccjs_object_init_known(${target}, 0, ${name.expression})`, context),
    ...message.lines,
    emitStatusCheck(`ccjs_object_init_known(${target}, 1, ${message.expression})`, context),
    ...code.lines,
    emitStatusCheck(`ccjs_object_init_known(${target}, 2, ${code.expression})`, context),
    ...cause.lines,
    emitStatusCheck(`ccjs_object_init_known(${target}, 3, ${cause.expression})`, context)
  ]
}

function errorConstructorExpressions(expression, context) {
  if (expression.args.length > 2) {
    context.diagnostics.push(
      diagnostic(
        'CCJS_ARG_COUNT',
        `Error constructor expects at most 2 argument(s), got ${expression.args.length}`,
        expression.loc
      )
    )
  }

  const message = expression.args[0] ?? cStringLiteralNode('', expression.loc)
  const options = expression.args[1]
  let code = cStringLiteralNode('', expression.loc)
  let cause = cNullLiteralNode(expression.loc)

  if (inferExpressionType(message, context) !== 'string') {
    context.diagnostics.push(
      diagnostic(
        'CCJS_TYPE_MISMATCH',
        'Error message must be a string in the current C backend slice',
        message.loc ?? expression.loc
      )
    )

    return {
      message: cStringLiteralNode('', expression.loc),
      code,
      cause
    }
  }

  if (options == null) {
    return {
      message,
      code,
      cause
    }
  }

  if (options.type !== 'ObjectLiteral') {
    context.diagnostics.push(
      diagnostic(
        'CCJS_TYPE_MISMATCH',
        'Error options must be an object literal in the current C backend slice',
        options.loc ?? expression.loc
      )
    )

    return {
      message,
      code,
      cause
    }
  }

  for (const property of options.properties) {
    if (property.key === 'code') {
      if (inferExpressionType(property.value, context) !== 'string') {
        context.diagnostics.push(
          diagnostic(
            'CCJS_TYPE_MISMATCH',
            'Error code must be a string in the current C backend slice',
            property.value.loc ?? property.loc
          )
        )
      } else {
        code = property.value
      }
    } else if (property.key === 'cause') {
      if (property.value.type === 'NullLiteral' || isErrorValueExpression(property.value, context)) {
        cause = property.value
      } else {
        context.diagnostics.push(
          diagnostic(
            'CCJS_TYPE_MISMATCH',
            'Error cause must be an Error object or null in the current C backend slice',
            property.value.loc ?? property.loc
          )
        )
      }
    } else {
      context.diagnostics.push(
        diagnostic('CCJS_UNKNOWN_FIELD', `unknown Error option ${property.key}`, property.loc ?? options.loc)
      )
    }
  }

  return {
    message,
    code,
    cause
  }
}

function cStringLiteralNode(value, loc = null) {
  return {
    type: 'StringLiteral',
    value,
    loc
  }
}

function cNullLiteralNode(loc = null) {
  return {
    type: 'NullLiteral',
    loc
  }
}

function emitCOptionalMemberValueExpression(expression, context) {
  const member = resolveKnownObjectMember(expression, context)

  if (member == null || !isRuntimeNullableType(member.valueType)) {
    context.diagnostics.push(
      diagnostic(
        'CCJS_C_OPTIONAL_CHAINING',
        'optional member access for this field is not supported by the current C backend slice',
        expression.loc
      )
    )

    return {
      lines: [],
      expression: 'ccjs_undefined_value()'
    }
  }

  return emitCOptionalObjectReadValueExpression(
    expression.object,
    member.valueType,
    context,
    (temp) => `ccjs_object_get_known(${temp}, ${member.index}, &`
  )
}

function emitCOptionalIndexValueExpression(expression, context) {
  const field = resolveKnownObjectIndex(expression, context)

  if (field != null) {
    if (!isRuntimeNullableType(field.valueType)) {
      context.diagnostics.push(
        diagnostic(
          'CCJS_C_OPTIONAL_CHAINING',
          'optional object index access for this field is not supported by the current C backend slice',
          expression.loc
        )
      )

      return {
        lines: [],
        expression: 'ccjs_undefined_value()'
      }
    }

    return emitCOptionalObjectReadValueExpression(
      expression.object,
      field.valueType,
      context,
      (temp) => `ccjs_object_get(${temp}, ${cStringLiteral(field.key)}, ${utf8ByteLength(field.key)}, &`
    )
  }

  const element = resolveOptionalRuntimeArrayIndex(expression, context)

  if (element != null) {
    if (!isRuntimeNullableType(element.valueType)) {
      context.diagnostics.push(
        diagnostic(
          'CCJS_C_OPTIONAL_CHAINING',
          'optional array index access for this element type is not supported by the current C backend slice',
          expression.loc
        )
      )

      return {
        lines: [],
        expression: 'ccjs_undefined_value()'
      }
    }

    return emitCOptionalArrayIndexValueExpression(expression.object, element, context)
  }

  context.diagnostics.push(
    diagnostic(
      'CCJS_C_OPTIONAL_CHAINING',
      'optional index access is not supported by the current C backend slice',
      expression.loc
    )
  )

  return {
    lines: [],
    expression: 'ccjs_undefined_value()'
  }
}

function emitCOptionalObjectReadValueExpression(objectExpression, valueType, context, emitGetPrefix) {
  const object = emitCValueExpression(objectExpression, context)
  const temp = nextCName(context, 'ccjs_optional_value')
  const expectedTag = cRuntimeValueTag(valueType)
  registerOwnedValue(context, temp)

  return {
    lines: [
      ...object.lines,
      ...emitPrepareOwnedValueWrite(temp),
      `if (${object.expression}.tag == CCJS_TAG_NULL) {`,
      `  ${temp} = ccjs_null_value();`,
      '} else {',
      `  ${emitRuntimeTypeCheck(`${object.expression}.tag != CCJS_TAG_OBJECT || ${object.expression}.as.ref == 0`, context)}`,
      `  ${emitStatusCheck(`${emitGetPrefix(object.expression)}${temp})`, context)}`,
      ...emitRuntimeNullableValueCheck(temp, expectedTag, context).map((line) => `  ${line}`),
      '}'
    ],
    expression: temp
  }
}

function emitCOptionalArrayIndexValueExpression(arrayExpression, element, context) {
  const array = emitCValueExpression(arrayExpression, context)
  const temp = nextCName(context, 'ccjs_optional_value')
  const expectedTag = cRuntimeValueTag(element.valueType)
  registerOwnedValue(context, temp)

  return {
    lines: [
      ...array.lines,
      ...emitPrepareOwnedValueWrite(temp),
      `if (${array.expression}.tag == CCJS_TAG_NULL) {`,
      `  ${temp} = ccjs_null_value();`,
      '} else {',
      `  ${emitRuntimeTypeCheck(`${array.expression}.tag != CCJS_TAG_ARRAY || ${array.expression}.as.ref == 0`, context)}`,
      `  ${emitStatusCheck(`ccjs_array_get(${array.expression}, ${element.index}, &${temp})`, context)}`,
      ...emitRuntimeNullableValueCheck(temp, expectedTag, context).map((line) => `  ${line}`),
      '}'
    ],
    expression: temp
  }
}

function emitCNullishCoalescingValueExpression(expression, context) {
  if (!canLowerCNullishCoalescingExpression(expression, context)) {
    context.diagnostics.push(
      diagnostic('CCJS_C_NULLISH', 'nullish coalescing is not supported by the current C backend slice', expression.loc)
    )

    return {
      lines: [],
      expression: 'ccjs_undefined_value()'
    }
  }

  const left = emitCValueExpression(expression.left, context)
  const right = emitCValueExpression(expression.right, context)
  const temp = nextCName(context, 'ccjs_value')
  const expectedTag = cRuntimeValueTag(inferExpressionType(expression, context))
  registerOwnedValue(context, temp)

  return {
    lines: [
      ...left.lines,
      ...emitPrepareOwnedValueWrite(temp),
      `if (${left.expression}.tag == CCJS_TAG_NULL) {`,
      ...right.lines.map((line) => `  ${line}`),
      `  ${temp} = ${right.expression};`,
      ...emitRuntimeNullableValueCheck(temp, expectedTag, context).map((line) => `  ${line}`),
      `  ccjs_retain(${temp});`,
      '} else {',
      `  ${temp} = ${left.expression};`,
      ...emitRuntimeNullableValueCheck(temp, expectedTag, context).map((line) => `  ${line}`),
      `  ccjs_retain(${temp});`,
      '}'
    ],
    expression: temp
  }
}

function emitCStringConcatValueExpression(expression, context) {
  const left = emitPreparedStringBytesOperand(expression.left, context)
  const right = emitPreparedStringBytesOperand(expression.right, context)
  const temp = nextCName(context, 'ccjs_value')
  registerOwnedValue(context, temp)

  return {
    lines: [
      ...left.lines,
      ...right.lines,
      ...emitPrepareOwnedValueWrite(temp),
      emitStatusCheck(
        `ccjs_string_concat_parts(&ccjs_default_allocator, ${left.bytes}, ${left.length}, ${right.bytes}, ${right.length}, &${temp})`,
        context
      )
    ],
    expression: temp
  }
}

function emitCTemplateLiteralValueExpression(expression, context) {
  const parts = parseTemplateLiteralParts(expression.raw, context, expression.loc)
  const operands = parts
    .map((part) => {
      if (part.type === 'text') {
        return {
          lines: [],
          bytes: cStringLiteral(part.value),
          length: `${utf8ByteLength(part.value)}`
        }
      }

      const placeholder = parseTemplatePlaceholderExpression(part.value, part.loc, context)

      return placeholder == null ? null : emitPreparedTemplatePlaceholderBytesOperand(placeholder, context)
    })
    .filter((operand) => operand != null)

  if (operands.length === 0) {
    const temp = nextCName(context, 'ccjs_value')
    registerOwnedValue(context, temp)

    return {
      lines: [
        ...emitPrepareOwnedValueWrite(temp),
        emitStatusCheck(`ccjs_string_from_literal(&ccjs_default_allocator, "", 0, &${temp})`, context)
      ],
      expression: temp
    }
  }

  const lines = operands.flatMap((operand) => operand.lines)

  if (operands.length === 1) {
    const [operand] = operands
    const temp = nextCName(context, 'ccjs_value')
    registerOwnedValue(context, temp)

    return {
      lines: [
        ...lines,
        ...emitPrepareOwnedValueWrite(temp),
        emitStatusCheck(
          `ccjs_string_from_literal(&ccjs_default_allocator, ${operand.bytes}, ${operand.length}, &${temp})`,
          context
        )
      ],
      expression: temp
    }
  }

  let current = operands[0]
  let currentValue = ''

  for (const operand of operands.slice(1)) {
    const temp = nextCName(context, 'ccjs_value')
    registerOwnedValue(context, temp)

    if (currentValue !== '') {
      const string = nextCName(context, 'ccjs_template_string')

      lines.push(`ccjs_string* ${string} = (ccjs_string*)${currentValue}.as.ref;`)
      current = {
        lines: [],
        bytes: `${string}->bytes`,
        length: `${string}->len`
      }
    }

    lines.push(
      ...emitPrepareOwnedValueWrite(temp),
      emitStatusCheck(
        `ccjs_string_concat_parts(&ccjs_default_allocator, ${current.bytes}, ${current.length}, ${operand.bytes}, ${operand.length}, &${temp})`,
        context
      )
    )

    currentValue = temp
  }

  return {
    lines,
    expression: currentValue
  }
}

function emitPreparedTemplatePlaceholderBytesOperand(expression, context) {
  const type = inferExpressionType(expression, context)

  if (type === 'string') {
    return emitPreparedStringBytesOperand(expression, context, 'ccjs_template_string')
  }

  if (type === 'number' || type === 'boolean' || type === 'null') {
    const value = emitCStringConversionValueExpression(
      {
        type: 'CallExpression',
        callee: {
          type: 'Reference',
          path: ['String'],
          loc: expression.loc
        },
        args: [expression],
        loc: expression.loc
      },
      context
    )
    const string = nextCName(context, 'ccjs_template_string')

    return {
      lines: [...value.lines, `ccjs_string* ${string} = (ccjs_string*)${value.expression}.as.ref;`],
      bytes: `${string}->bytes`,
      length: `${string}->len`
    }
  }

  context.diagnostics.push(
    diagnostic(
      cUnsupportedExpressionCode(type),
      'template placeholders currently support string, number, boolean and null expressions in C',
      expression?.loc
    )
  )

  return {
    lines: [],
    bytes: '""',
    length: '0'
  }
}

function emitCStringConversionValueExpression(expression, context) {
  const [arg] = expression.args
  const type = inferExpressionType(arg, context)
  const temp = nextCName(context, 'ccjs_value')
  registerOwnedValue(context, temp)

  if (type === 'string') {
    const value = emitPreparedStringBytesOperand(arg, context, 'ccjs_string_conversion')

    return {
      lines: [
        ...value.lines,
        ...emitPrepareOwnedValueWrite(temp),
        emitStatusCheck(
          `ccjs_string_from_literal(&ccjs_default_allocator, ${value.bytes}, ${value.length}, &${temp})`,
          context
        )
      ],
      expression: temp
    }
  }

  if (type === 'null') {
    return {
      lines: [
        ...emitPrepareOwnedValueWrite(temp),
        emitStatusCheck(`ccjs_string_from_literal(&ccjs_default_allocator, "null", 4, &${temp})`, context)
      ],
      expression: temp
    }
  }

  const value = emitPreparedNumberExpression(arg, context)
  const helper =
    type === 'boolean'
      ? `ccjs_string_from_bool(&ccjs_default_allocator, (${value.expression}) != 0, &${temp})`
      : `ccjs_string_from_number(&ccjs_default_allocator, ${value.expression}, &${temp})`

  return {
    lines: [...value.lines, ...emitPrepareOwnedValueWrite(temp), emitStatusCheck(helper, context)],
    expression: temp
  }
}

function emitCNumberConversionValueExpression(expression, context) {
  if (!isNumberConversionCall(expression, context)) {
    return null
  }

  const value = emitPreparedStringBytesOperand(expression.args[0], context, 'ccjs_number_conversion')
  const temp = nextCName(context, 'ccjs_value')
  registerOwnedValue(context, temp)

  return {
    lines: [
      ...value.lines,
      ...emitPrepareOwnedValueWrite(temp),
      emitStatusCheck(`ccjs_string_to_number(${value.bytes}, ${value.length}, &${temp})`, context)
    ],
    expression: temp
  }
}

function emitCStringTrimValueExpression(expression, context) {
  const value = emitPreparedStringBytesOperand(expression.callee.object, context, 'ccjs_trim_string')
  const temp = nextCName(context, 'ccjs_value')
  registerOwnedValue(context, temp)

  return {
    lines: [
      ...value.lines,
      ...emitPrepareOwnedValueWrite(temp),
      emitStatusCheck(
        `ccjs_string_trim_parts(&ccjs_default_allocator, ${value.bytes}, ${value.length}, &${temp})`,
        context
      )
    ],
    expression: temp
  }
}

function emitCStringSliceValueExpression(expression, context) {
  const value = emitPreparedStringBytesOperand(expression.callee.object, context, 'ccjs_slice_string')
  const start = emitPreparedNumberExpression(expression.args[0], context)
  const lengthName = nextCName(context, 'ccjs_slice_length')
  const startRaw = nextCName(context, 'ccjs_slice_start_raw')
  const startIndex = nextCName(context, 'ccjs_slice_start')
  const endRaw = nextCName(context, 'ccjs_slice_end_raw')
  const endIndex = nextCName(context, 'ccjs_slice_end')
  const end =
    expression.args[1] == null
      ? {
          lines: [],
          expression: `((double)${lengthName})`
        }
      : emitPreparedNumberExpression(expression.args[1], context)
  const temp = nextCName(context, 'ccjs_value')
  registerOwnedValue(context, temp)

  return {
    lines: [
      ...value.lines,
      ...start.lines,
      `size_t ${lengthName} = ccjs_string_code_point_length_parts(${value.bytes}, ${value.length});`,
      ...end.lines,
      `double ${startRaw} = ${start.expression};`,
      `double ${endRaw} = ${end.expression};`,
      ...emitSliceIndexNormalizationLines(startRaw, lengthName, startIndex, context, 'ccjs_slice_start'),
      ...emitSliceIndexNormalizationLines(endRaw, lengthName, endIndex, context, 'ccjs_slice_end'),
      `if (${endIndex} < ${startIndex}) ${endIndex} = ${startIndex};`,
      ...emitPrepareOwnedValueWrite(temp),
      emitStatusCheck(
        `ccjs_string_slice_parts(&ccjs_default_allocator, ${value.bytes}, ${value.length}, ${startIndex}, ${endIndex}, &${temp})`,
        context
      )
    ],
    expression: temp
  }
}

function emitSliceIndexNormalizationLines(rawName, lengthName, outName, context, prefix) {
  const integerName = nextCName(context, `${prefix}_integer`)
  const fromEndName = nextCName(context, `${prefix}_from_end`)

  return [
    `size_t ${outName} = 0;`,
    `if (${rawName} != ${rawName}) {`,
    `  ${outName} = 0;`,
    `} else if (${rawName} <= -((double)${lengthName})) {`,
    `  ${outName} = 0;`,
    `} else if (${rawName} >= ((double)${lengthName})) {`,
    `  ${outName} = ${lengthName};`,
    '} else {',
    `  long long ${integerName} = (long long)${rawName};`,
    `  if (${integerName} < 0) {`,
    `    long long ${fromEndName} = (long long)${lengthName} + ${integerName};`,
    `    ${outName} = ${fromEndName} < 0 ? 0 : (size_t)${fromEndName};`,
    '  } else {',
    `    ${outName} = (size_t)${integerName};`,
    '  }',
    '}'
  ]
}

function emitCStringSplitValueExpression(expression, context) {
  const value = emitPreparedStringBytesOperand(expression.callee.object, context, 'ccjs_split_string')
  const separator = emitPreparedStringBytesOperand(expression.args[0], context, 'ccjs_split_separator')
  const temp = nextCName(context, 'ccjs_split_array')
  registerOwnedValue(context, temp)

  return {
    lines: [
      ...value.lines,
      ...separator.lines,
      ...emitPrepareOwnedValueWrite(temp),
      emitStatusCheck(
        `ccjs_string_split_parts(&ccjs_default_allocator, ${value.bytes}, ${value.length}, ${separator.bytes}, ${separator.length}, &${temp})`,
        context
      ),
      emitRuntimeValueCheck(temp, 'CCJS_TAG_ARRAY', context)
    ],
    expression: temp,
    elementType: 'string'
  }
}

function emitPreparedBinaryValueExpression(expression, context) {
  if (isBufferFromCall(expression)) {
    return emitCBufferFromValueExpression(expression, context)
  }

  if (isBufferAllocCall(expression) || isBinaryConstructorExpression(expression)) {
    return emitCBytesAllocValueExpression(expression, context)
  }

  if (isBytesSliceCall(expression, context)) {
    return emitCBytesSliceValueExpression(expression, context)
  }

  if (isBytesToStringCall(expression, context)) {
    return emitCBytesToStringValueExpression(expression, context)
  }

  return null
}

function emitCBufferFromValueExpression(expression, context) {
  const value = emitPreparedStringBytesOperand(expression.args[0], context, 'ccjs_buffer_from')
  const temp = nextCName(context, 'ccjs_bytes')
  registerOwnedValue(context, temp)

  return {
    lines: [
      ...value.lines,
      ...emitPrepareOwnedValueWrite(temp),
      emitStatusCheck(
        `ccjs_bytes_from_data(&ccjs_default_allocator, (const uint8_t*)${value.bytes}, ${value.length}, &${temp})`,
        context
      ),
      emitRuntimeValueCheck(temp, 'CCJS_TAG_BYTES', context)
    ],
    expression: temp
  }
}

function emitCBytesAllocValueExpression(expression, context) {
  const temp = nextCName(context, 'ccjs_bytes')
  registerOwnedValue(context, temp)

  if (isBinaryConstructorExpression(expression) && expression.args[0]?.type === 'ArrayLiteral') {
    const elements = expression.args[0].elements
    const lines = [
      ...emitPrepareOwnedValueWrite(temp),
      emitStatusCheck(`ccjs_bytes_new(&ccjs_default_allocator, ${elements.length}, &${temp})`, context)
    ]

    for (const [index, element] of elements.entries()) {
      const value = emitPreparedNumberExpression(element, context)

      lines.push(...value.lines)
      lines.push(emitStatusCheck(`ccjs_bytes_set(${temp}, ${index}, (uint8_t)(${value.expression}))`, context))
    }

    return {
      lines,
      expression: temp
    }
  }

  if (isBinaryConstructorExpression(expression) && inferExpressionType(expression.args[0], context) !== 'number') {
    context.diagnostics.push(
      diagnostic(
        'CCJS_C_JS_GLOBAL',
        'Uint8Array constructor currently supports only length or array literals in C',
        expression.loc
      )
    )

    return {
      lines: [],
      expression: 'ccjs_undefined_value()'
    }
  }

  const size = emitPreparedNumberExpression(expression.args[0], context)

  return {
    lines: [
      ...size.lines,
      ...emitPrepareOwnedValueWrite(temp),
      emitStatusCheck(`ccjs_bytes_new(&ccjs_default_allocator, (size_t)(${size.expression}), &${temp})`, context)
    ],
    expression: temp
  }
}

function emitCBytesSliceValueExpression(expression, context) {
  const receiver = emitCValueExpression(expression.callee.object, context)
  const start = emitPreparedNumberExpression(expression.args[0], context)
  const end = expression.args[1] == null ? null : emitPreparedNumberExpression(expression.args[1], context)
  const lengthName = nextCName(context, 'ccjs_bytes_len')
  const startRaw = nextCName(context, 'ccjs_bytes_start_raw')
  const startIndex = nextCName(context, 'ccjs_bytes_start')
  const endRaw = nextCName(context, 'ccjs_bytes_end_raw')
  const endIndex = nextCName(context, 'ccjs_bytes_end')
  const temp = nextCName(context, 'ccjs_bytes_slice')
  registerOwnedValue(context, temp)

  return {
    lines: [
      ...receiver.lines,
      ...start.lines,
      ...(end == null ? [] : end.lines),
      `size_t ${lengthName} = 0;`,
      emitStatusCheck(`ccjs_bytes_len(${receiver.expression}, &${lengthName})`, context),
      `double ${startRaw} = ${start.expression};`,
      `double ${endRaw} = ${end == null ? `((double)${lengthName})` : end.expression};`,
      ...emitSliceIndexNormalizationLines(startRaw, lengthName, startIndex, context, 'ccjs_bytes_start'),
      ...emitSliceIndexNormalizationLines(endRaw, lengthName, endIndex, context, 'ccjs_bytes_end'),
      `if (${endIndex} < ${startIndex}) ${endIndex} = ${startIndex};`,
      ...emitPrepareOwnedValueWrite(temp),
      emitStatusCheck(`ccjs_bytes_slice(${receiver.expression}, ${startIndex}, ${endIndex}, &${temp})`, context),
      emitRuntimeValueCheck(temp, 'CCJS_TAG_BYTES', context)
    ],
    expression: temp
  }
}

function emitCBytesToStringValueExpression(expression, context) {
  const receiver = emitCValueExpression(expression.callee.object, context)
  const temp = nextCName(context, 'ccjs_bytes_string')
  registerOwnedValue(context, temp)

  return {
    lines: [
      ...receiver.lines,
      ...emitPrepareOwnedValueWrite(temp),
      emitStatusCheck(`ccjs_bytes_to_string(&ccjs_default_allocator, ${receiver.expression}, &${temp})`, context),
      emitRuntimeValueCheck(temp, 'CCJS_TAG_STRING', context)
    ],
    expression: temp
  }
}

function emitPreparedBinaryNumberCallExpression(expression, context) {
  return null
}

function emitPreparedBytesLengthExpression(expression, context) {
  if (
    expression?.type !== 'MemberExpression' ||
    expression.property !== 'length' ||
    inferExpressionType(expression.object, context) !== 'bytes'
  ) {
    return null
  }

  const value = emitCValueExpression(expression.object, context)
  const temp = nextCName(context, 'ccjs_bytes_len')

  return {
    lines: [
      ...value.lines,
      `size_t ${temp} = 0;`,
      emitStatusCheck(`ccjs_bytes_len(${value.expression}, &${temp})`, context)
    ],
    expression: `((double)${temp})`
  }
}

function emitPreparedBytesIndexExpression(expression, context) {
  if (expression?.type !== 'IndexExpression' || inferExpressionType(expression.object, context) !== 'bytes') {
    return null
  }

  const value = emitCValueExpression(expression.object, context)
  const index = emitPreparedNumberExpression(expression.index, context)
  const byte = nextCName(context, 'ccjs_byte')

  return {
    lines: [
      ...value.lines,
      ...index.lines,
      `uint8_t ${byte} = 0;`,
      emitStatusCheck(`ccjs_bytes_get(${value.expression}, (size_t)(${index.expression}), &${byte})`, context)
    ],
    expression: `((double)${byte})`
  }
}

function emitPreparedBytesIndexAssignment(expression, context) {
  if (
    expression?.target?.type !== 'IndexExpression' ||
    inferExpressionType(expression.target.object, context) !== 'bytes'
  ) {
    return null
  }

  const value = emitCValueExpression(expression.target.object, context)
  const index = emitPreparedNumberExpression(expression.target.index, context)
  const byte = emitPreparedNumberExpression(expression.value, context)

  return {
    lines: [
      ...value.lines,
      ...index.lines,
      ...byte.lines,
      emitStatusCheck(
        `ccjs_bytes_set(${value.expression}, (size_t)(${index.expression}), (uint8_t)(${byte.expression}))`,
        context
      )
    ]
  }
}

function emitConsoleLogStatement(method, args, context) {
  const stream = method === 'warn' || method === 'error' ? 'CCJS_CONSOLE_STDERR' : 'CCJS_CONSOLE_STDOUT'
  const isStdout = stream === 'CCJS_CONSOLE_STDOUT'

  if (args.length === 0) {
    return isStdout
      ? ['printf("\\n");']
      : [`if (ccjs_console_printf(${stream}, "\\n") < 0) ${emitFailureStatement(context)}`]
  }

  const lines: string[] = []
  const parts: string[] = []
  const values: string[] = []

  for (const arg of args) {
    const value = emitConsoleLogValue(arg, context)

    lines.push(...value.lines)
    parts.push(value.format)
    values.push(...value.values)
  }

  const format = escapeCString(parts.join(' '))

  if (values.length === 0) {
    lines.push(
      isStdout
        ? `printf("${format}\\n");`
        : `if (ccjs_console_printf(${stream}, "${format}\\n") < 0) ${emitFailureStatement(context)}`
    )
  } else {
    lines.push(
      isStdout
        ? `printf("${format}\\n", ${values.join(', ')});`
        : `if (ccjs_console_printf(${stream}, "${format}\\n", ${values.join(', ')}) < 0) ${emitFailureStatement(context)}`
    )
  }

  return lines
}

function emitConsoleLogValue(expression, context) {
  const type = inferExpressionType(expression, context)

  if (type === 'string') {
    return emitStringLogValue(expression, context)
  }

  if (type === 'number' || type === 'boolean') {
    return emitNumberLogValue(expression, type, context)
  }

  if (type === 'object' && isErrorValueExpression(expression, context)) {
    return emitRuntimeErrorLogValue(expression, context)
  }

  context.diagnostics.push(
    diagnostic(
      cUnsupportedExpressionCode(type),
      'this console.log argument is not supported by the current C backend slice',
      expression.loc
    )
  )

  return {
    lines: [],
    format: '%g',
    values: ['0']
  }
}

function parseTemplateLiteralParts(raw, context, loc) {
  const parts: { type: string; value: string; loc?: SourceLocation }[] = []
  let text = ''
  let index = 1
  const end = raw.endsWith('`') ? raw.length - 1 : raw.length
  let line = loc?.line ?? 1
  let column = (loc?.column ?? 1) + 1

  while (index < end) {
    const char = raw[index]

    if (char === '\\') {
      text += raw.slice(index, Math.min(index + 2, end))
      advanceTemplateLocation(char)

      if (index + 1 < end) {
        advanceTemplateLocation(raw[index + 1])
      }

      index += 2
      continue
    }

    if (char === '$' && raw[index + 1] === '{') {
      if (text !== '') {
        parts.push({
          type: 'text',
          value: text
        })
        text = ''
      }

      advanceTemplateLocation('$')
      advanceTemplateLocation('{')
      index += 2

      const placeholderStart = index
      const placeholderLoc = currentTemplateLocation()
      let depth = 0
      let quote: string | null = null

      while (index < end) {
        const current = raw[index]

        if (quote != null) {
          advanceTemplateLocation(current)

          if (current === '\\' && index + 1 < end) {
            index += 1
            advanceTemplateLocation(raw[index])
          } else if (current === quote) {
            quote = null
          }

          index += 1
          continue
        }

        if (current === '"' || current === "'" || current === '`') {
          quote = current
          advanceTemplateLocation(current)
          index += 1
          continue
        }

        if (current === '{') {
          depth += 1
          advanceTemplateLocation(current)
          index += 1
          continue
        }

        if (current === '}') {
          if (depth === 0) {
            break
          }

          depth -= 1
          advanceTemplateLocation(current)
          index += 1
          continue
        }

        advanceTemplateLocation(current)
        index += 1
      }

      if (index >= end) {
        context.diagnostics.push(
          diagnostic('CCJS_C_STRING_EXPR', 'unterminated template placeholder in C template literal', loc)
        )
        return parts
      }

      const placeholder = trimTemplatePlaceholder(raw.slice(placeholderStart, index), placeholderLoc)

      parts.push({
        type: 'placeholder',
        value: placeholder.value,
        loc: placeholder.loc
      })
      advanceTemplateLocation('}')
      index += 1
      continue
    }

    text += char
    advanceTemplateLocation(char)
    index += 1
  }

  if (text !== '') {
    parts.push({
      type: 'text',
      value: text
    })
  }

  return parts

  function currentTemplateLocation(): SourceLocation {
    return {
      ...(loc?.file == null ? {} : { file: loc.file }),
      line,
      column
    }
  }

  function advanceTemplateLocation(char: string): void {
    if (char === '\n') {
      line += 1
      column = 1
      return
    }

    column += 1
  }
}

function trimTemplatePlaceholder(value, loc) {
  let index = 0
  let line = loc.line
  let column = loc.column

  while (index < value.length && /\s/.test(value[index])) {
    if (value[index] === '\n') {
      line += 1
      column = 1
    } else {
      column += 1
    }

    index += 1
  }

  return {
    value: value.slice(index).trimEnd(),
    loc: {
      ...(loc.file == null ? {} : { file: loc.file }),
      line,
      column
    }
  }
}

function collectTemplatePlaceholderExpressions(expression) {
  if (expression?.type !== 'TemplateLiteral' || !expression.raw.includes('${')) {
    return []
  }

  const diagnostics: Diagnostic[] = []
  const parts = parseTemplateLiteralParts(expression.raw, { diagnostics }, expression.loc)
  const result: any[] = []

  for (const part of parts) {
    if (part.type !== 'placeholder' || part.value === '') {
      continue
    }

    const parsed = parseTemplatePlaceholderCaptureExpression(part.value, part.loc)

    if (parsed != null) {
      result.push(parsed)
    }
  }

  return result
}

function parseTemplatePlaceholderCaptureExpression(value, loc) {
  const prefix = 'const __ccjs_template = '

  try {
    const program = parse(tokenize(`${prefix}${value}`, loc?.file == null ? {} : { file: loc.file }))
    const statement = program.body[0]
    const expression = statement?.type === 'VariableDeclaration' ? statement.init : null

    if (program.body.length !== 1 || expression == null) {
      return null
    }

    shiftTemplatePlaceholderExpressionLocations(expression, loc, prefix.length)

    return expression
  } catch (error) {
    if (error instanceof CompileError) {
      return null
    }

    throw error
  }
}

function parseTemplatePlaceholderExpression(value, loc, context) {
  if (value === '') {
    context.diagnostics.push(diagnostic('CCJS_C_STRING_EXPR', 'empty template placeholder in C template literal', loc))
    return null
  }

  const prefix = 'const __ccjs_template = '

  try {
    const program = parse(tokenize(`${prefix}${value}`, loc.file == null ? {} : { file: loc.file }))
    const statement = program.body[0]
    const expression = statement?.type === 'VariableDeclaration' ? statement.init : null

    if (program.body.length !== 1 || expression == null) {
      context.diagnostics.push(
        diagnostic('CCJS_C_STRING_EXPR', 'template placeholder must contain exactly one expression', loc)
      )
      return null
    }

    shiftTemplatePlaceholderExpressionLocations(expression, loc, prefix.length)

    return validateTemplatePlaceholderExpressionReferences(expression, context) ? expression : null
  } catch (error) {
    if (error instanceof CompileError) {
      const first = error.diagnostics[0]

      context.diagnostics.push(
        diagnostic(
          first?.code ?? 'CCJS_C_STRING_EXPR',
          first == null
            ? 'invalid template placeholder expression'
            : `invalid template placeholder expression: ${first.message}`,
          loc
        )
      )

      return null
    }

    throw error
  }
}

function validateTemplatePlaceholderExpressionReferences(expression, context) {
  const reported = new Set<string>()
  let valid = true

  visit(expression, null, '')

  return valid

  function visit(value, parent, key) {
    if (Array.isArray(value)) {
      for (const item of value) {
        visit(item, parent, key)
      }

      return
    }

    if (value == null || typeof value !== 'object') {
      return
    }

    if (value.type === 'Reference') {
      const name = value.path[0]

      if (!isKnownTemplatePlaceholderReference(value, parent, key, context)) {
        const reportKey = `${name}:${value.loc?.line ?? 1}:${value.loc?.column ?? 1}`

        if (!reported.has(reportKey)) {
          reported.add(reportKey)
          context.diagnostics.push(diagnostic('CCJS_UNKNOWN_NAME', `unknown name ${name}`, value.loc))
        }

        valid = false
      }
    }

    for (const [childKey, child] of Object.entries(value)) {
      if (childKey === 'loc' || childKey.endsWith('Loc')) {
        continue
      }

      visit(child, value, childKey)
    }
  }
}

function isKnownTemplatePlaceholderReference(expression, parent, key, context) {
  const name = expression.path[0]

  return (
    context.variables.has(expression.path.join('.')) ||
    context.variables.has(name) ||
    context.functionNames.has(name) ||
    isCJsGlobalRoot(name, context) ||
    (key === 'callee' &&
      parent?.type === 'CallExpression' &&
      expression.path.length === 1 &&
      ['Number', 'String'].includes(name))
  )
}

function shiftTemplatePlaceholderExpressionLocations(value, loc, prefixLength) {
  if (Array.isArray(value)) {
    for (const item of value) {
      shiftTemplatePlaceholderExpressionLocations(item, loc, prefixLength)
    }

    return
  }

  if (value == null || typeof value !== 'object') {
    return
  }

  if (typeof value.line === 'number' && typeof value.column === 'number') {
    const lineOffset = value.line - 1

    value.line = loc.line + lineOffset
    value.column = lineOffset === 0 ? loc.column + value.column - prefixLength - 1 : value.column

    if (loc.file == null) {
      delete value.file
    } else {
      value.file = loc.file
    }
  }

  for (const child of Object.values(value)) {
    shiftTemplatePlaceholderExpressionLocations(child, loc, prefixLength)
  }
}

function emitStringLogValue(expression, context) {
  if (expression?.type === 'Reference') {
    const name = expression.path.join('_')

    if (isBoxedRuntimeStringName(name, context)) {
      const string = nextCName(context, 'ccjs_log_string')

      return {
        lines: [
          emitRuntimeTypeCheck(`(*${name}).tag != CCJS_TAG_STRING || (*${name}).as.ref == 0`, context),
          `ccjs_string* ${string} = (ccjs_string*)(*${name}).as.ref;`
        ],
        format: '%.*s',
        values: [`(int)${string}->len`, `${string}->bytes`]
      }
    }

    const reference = emitReference(expression, context)

    if (context.runtimeStrings.has(reference)) {
      return {
        lines: [],
        format: '%.*s',
        values: [`(int)${reference}->len`, `${reference}->bytes`]
      }
    }
  }

  if (isMemberAccessExpression(expression)) {
    const netAddressMember = resolveNetAddressStringMember(expression, context)

    if (netAddressMember != null) {
      return {
        lines: [],
        format: '%s',
        values: [netAddressMember]
      }
    }

    const member = resolveKnownObjectMember(expression, context)

    if (member?.valueType === 'string') {
      return emitRuntimeStringLogValue(
        (temp) =>
          `ccjs_object_get_known(${emitObjectValueReference(member.objectName, context)}, ${member.index}, &${temp})`,
        context
      )
    }
  }

  if (isIndexAccessExpression(expression)) {
    const element = resolveKnownArrayIndex(expression, context)

    if (element?.valueType === 'string') {
      return emitRuntimeStringLogValue(
        (temp) => `ccjs_array_get(${element.arrayName}, ${element.index}, &${temp})`,
        context
      )
    }

    const field = resolveKnownObjectIndex(expression, context)

    if (field?.valueType === 'string') {
      return emitRuntimeStringLogValue(
        (temp) =>
          `ccjs_object_get(${emitObjectValueReference(field.objectName, context)}, ${cStringLiteral(field.key)}, ${utf8ByteLength(field.key)}, &${temp})`,
        context
      )
    }

    const runtimeElement = resolveRuntimeArrayIndex(expression, context)

    if (runtimeElement?.valueType === 'string') {
      const value = emitPreparedRuntimeArrayIndexValue(expression, runtimeElement, context, 'ccjs_log_value')
      const string = nextCName(context, 'ccjs_log_string')

      return {
        lines: [
          ...value.lines,
          emitRuntimeTypeCheck(
            `${value.expression}.tag != CCJS_TAG_STRING || ${value.expression}.as.ref == 0`,
            context
          ),
          `ccjs_string* ${string} = (ccjs_string*)${value.expression}.as.ref;`
        ],
        format: '%.*s',
        values: [`(int)${string}->len`, `${string}->bytes`]
      }
    }
  }

  if (isRuntimeProducedStringExpression(expression, context)) {
    const value = emitCValueExpression(expression, context)
    const string = nextCName(context, 'ccjs_log_string')

    return {
      lines: [...value.lines, `ccjs_string* ${string} = (ccjs_string*)${value.expression}.as.ref;`],
      format: '%.*s',
      values: [`(int)${string}->len`, `${string}->bytes`]
    }
  }

  if (isStringConcatExpression(expression, context)) {
    const value = emitCValueExpression(expression, context)
    const string = nextCName(context, 'ccjs_log_string')

    return {
      lines: [...value.lines, `ccjs_string* ${string} = (ccjs_string*)${value.expression}.as.ref;`],
      format: '%.*s',
      values: [`(int)${string}->len`, `${string}->bytes`]
    }
  }

  if (isNullishCoalescingExpression(expression) && canLowerCNullishCoalescingExpression(expression, context)) {
    const value = emitCValueExpression(expression, context)
    const string = nextCName(context, 'ccjs_log_string')

    return {
      lines: [
        ...value.lines,
        emitRuntimeTypeCheck(`${value.expression}.tag != CCJS_TAG_STRING || ${value.expression}.as.ref == 0`, context),
        `ccjs_string* ${string} = (ccjs_string*)${value.expression}.as.ref;`
      ],
      format: '%.*s',
      values: [`(int)${string}->len`, `${string}->bytes`]
    }
  }

  return {
    lines: [],
    format: '%s',
    values: [emitStringExpression(expression, context)]
  }
}

function emitNumberLogValue(expression, type, context) {
  if (isMemberAccessExpression(expression)) {
    const stringLength = emitPreparedStringLengthExpression(expression, context)

    if (stringLength != null) {
      return {
        lines: stringLength.lines,
        format: '%g',
        values: [`((double)${stringLength.expression})`]
      }
    }

    const length = emitPreparedArrayLengthExpression(expression, context)

    if (length != null) {
      return {
        lines: length.lines,
        format: '%g',
        values: [`((double)${length.expression})`]
      }
    }

    const member = resolveKnownObjectMember(expression, context)

    if (member != null && ['number', 'boolean'].includes(member.valueType)) {
      return emitRuntimeNumberLogValue(
        member.valueType,
        (temp) =>
          `ccjs_object_get_known(${emitObjectValueReference(member.objectName, context)}, ${member.index}, &${temp})`,
        context
      )
    }
  }

  if (isIndexAccessExpression(expression)) {
    const element = resolveKnownArrayIndex(expression, context)

    if (element != null && ['number', 'boolean'].includes(element.valueType)) {
      return emitRuntimeNumberLogValue(
        element.valueType,
        (temp) => `ccjs_array_get(${element.arrayName}, ${element.index}, &${temp})`,
        context
      )
    }

    const field = resolveKnownObjectIndex(expression, context)

    if (field != null && ['number', 'boolean'].includes(field.valueType)) {
      return emitRuntimeNumberLogValue(
        field.valueType,
        (temp) =>
          `ccjs_object_get(${emitObjectValueReference(field.objectName, context)}, ${cStringLiteral(field.key)}, ${utf8ByteLength(field.key)}, &${temp})`,
        context
      )
    }

    const runtimeElement = resolveRuntimeArrayIndex(expression, context)

    if (runtimeElement != null && ['number', 'boolean'].includes(runtimeElement.valueType)) {
      const value = emitPreparedRuntimeArrayIndexValue(expression, runtimeElement, context, 'ccjs_log_value')

      return {
        lines: value.lines,
        format: '%g',
        values: [
          runtimeElement.valueType === 'boolean'
            ? `((double)(${value.expression}.as.boolean ? 1 : 0))`
            : `${value.expression}.as.number`
        ]
      }
    }
  }

  const value = emitPreparedNumberExpression(expression, context)

  return {
    lines: value.lines,
    format: '%g',
    values: [`((double)${value.expression})`]
  }
}

function emitRuntimeStringLogValue(emitGetCall, context) {
  const value = nextCName(context, 'ccjs_log_value')
  const string = nextCName(context, 'ccjs_log_string')
  registerOwnedValue(context, value)

  return {
    lines: [
      ...emitPrepareOwnedValueWrite(value),
      emitStatusCheck(emitGetCall(value), context),
      emitRuntimeTypeCheck(`${value}.tag != CCJS_TAG_STRING || ${value}.as.ref == 0`, context),
      `ccjs_string* ${string} = (ccjs_string*)${value}.as.ref;`
    ],
    format: '%.*s',
    values: [`(int)${string}->len`, `${string}->bytes`]
  }
}

function emitRuntimeNumberLogValue(valueType, emitGetCall, context) {
  const value = nextCName(context, 'ccjs_log_value')
  registerOwnedValue(context, value)

  return {
    lines: [...emitPrepareOwnedValueWrite(value), emitStatusCheck(emitGetCall(value), context)],
    format: '%g',
    values: [valueType === 'boolean' ? `((double)(${value}.as.boolean ? 1 : 0))` : `${value}.as.number`]
  }
}

function emitRuntimeErrorLogValue(expression, context) {
  const object = emitErrorLogObjectExpression(expression, context)
  const nameValue = nextCName(context, 'ccjs_log_value')
  const messageValue = nextCName(context, 'ccjs_log_value')
  const nameString = nextCName(context, 'ccjs_log_string')
  const messageString = nextCName(context, 'ccjs_log_string')
  registerOwnedValue(context, nameValue)
  registerOwnedValue(context, messageValue)

  return {
    lines: [
      ...object.lines,
      ...emitPrepareOwnedValueWrite(nameValue),
      ...emitPrepareOwnedValueWrite(messageValue),
      emitStatusCheck(`ccjs_object_get_known(${object.expression}, 0, &${nameValue})`, context),
      emitStatusCheck(`ccjs_object_get_known(${object.expression}, 1, &${messageValue})`, context),
      emitRuntimeTypeCheck(`${nameValue}.tag != CCJS_TAG_STRING || ${nameValue}.as.ref == 0`, context),
      emitRuntimeTypeCheck(`${messageValue}.tag != CCJS_TAG_STRING || ${messageValue}.as.ref == 0`, context),
      `ccjs_string* ${nameString} = (ccjs_string*)${nameValue}.as.ref;`,
      `ccjs_string* ${messageString} = (ccjs_string*)${messageValue}.as.ref;`
    ],
    format: '%.*s: %.*s',
    values: [
      `(int)${nameString}->len`,
      `${nameString}->bytes`,
      `(int)${messageString}->len`,
      `${messageString}->bytes`
    ]
  }
}

function emitErrorLogObjectExpression(expression, context) {
  if (expression?.type === 'Reference' && expression.path.length === 1) {
    return {
      lines: [],
      expression: emitObjectValueReference(expression.path[0], context)
    }
  }

  return emitCValueExpression(expression, context)
}

function resolveRuntimeStringReference(expression, context) {
  if (expression?.type !== 'Reference' || expression.path.length !== 1) {
    return null
  }

  const name = expression.path[0]

  return context.runtimeStrings.has(name) ? name : null
}

function emitStringExpression(expression, context) {
  if (expression?.type === 'StringLiteral') {
    return JSON.stringify(expression.value)
  }

  if (expression?.type === 'TemplateLiteral' && !expression.raw.includes('${')) {
    return JSON.stringify(expression.raw.slice(1, -1))
  }

  if (expression?.type === 'Reference') {
    return emitReference(expression, context)
  }

  if (expression?.type === 'CallExpression') {
    return emitCallExpression(expression, context)
  }

  if (isNullishCoalescingExpression(expression)) {
    context.diagnostics.push(
      diagnostic('CCJS_C_NULLISH', 'nullish coalescing is not supported by the current C backend slice', expression.loc)
    )
    return '""'
  }

  if (isMemberAccessExpression(expression)) {
    const member = resolveKnownObjectMember(expression, context)

    if (member != null && ['number', 'boolean'].includes(member.valueType)) {
      context.diagnostics.push(
        diagnostic(
          'CCJS_C_UNSUPPORTED_EXPR',
          'object field access must be assigned before it can be used by the current C backend slice',
          expression.loc
        )
      )
      return '""'
    }
  }

  if (expression?.type === 'AwaitExpression') {
    context.diagnostics.push(
      diagnostic('CCJS_C_ASYNC', 'async/await is not supported by the current C backend slice', expression?.loc)
    )
    return '""'
  }

  if (isOptionalChainExpression(expression)) {
    context.diagnostics.push(
      diagnostic(
        'CCJS_C_OPTIONAL_CHAINING',
        'optional chaining is not supported by the current C backend slice',
        expression?.loc
      )
    )
    return '""'
  }

  context.diagnostics.push(
    diagnostic(
      'CCJS_C_STRING_EXPR',
      'this string expression is not supported by the current C backend slice',
      expression?.loc
    )
  )
  return '""'
}

function emitNumberExpression(expression, context) {
  return emitPreparedNumberExpression(expression, context).expression
}

function emitPreparedNumberExpression(expression, context) {
  const classMethodCall = emitPreparedClassMethodCallExpression(expression, context)

  if (classMethodCall != null && classMethodCall.expression !== '') {
    return classMethodCall
  }

  const fsConstant = cFsRuntimeConstantExpression(expression)

  if (fsConstant != null) {
    return {
      lines: [],
      expression: fsConstant
    }
  }

  if (expression?.type === 'NumberLiteral') {
    return {
      lines: [],
      expression: expression.value
    }
  }

  if (isNarrowedNullableScalarReference(expression, context)) {
    const name = expression.path[0]
    const valueType = context.variables.get(name)

    return {
      lines: [],
      expression: valueType === 'boolean' ? `(${name}.as.boolean ? 1 : 0)` : `${name}.as.number`
    }
  }

  if (isNullableScalarRuntimeExpression(expression, context)) {
    context.diagnostics.push(
      diagnostic(
        'CCJS_C_NULLISH',
        'nullable scalar values must be narrowed with ?? before scalar use in the current C backend slice',
        expression.loc
      )
    )

    return {
      lines: [],
      expression: '0'
    }
  }

  if (expression?.type === 'Reference') {
    return {
      lines: [],
      expression: emitReference(expression, context)
    }
  }

  if (expression?.type === 'BooleanLiteral') {
    return {
      lines: [],
      expression: expression.value ? '1' : '0'
    }
  }

  if (expression?.type === 'UnaryExpression') {
    const argument = emitPreparedNumberExpression(expression.argument, context)

    return {
      lines: argument.lines,
      expression: `(${expression.operator}${argument.expression})`
    }
  }

  if (expression?.type === 'UpdateExpression') {
    return emitPreparedUpdateExpression(expression, context)
  }

  if (expression?.type === 'BinaryExpression') {
    const scalarNullish = emitPreparedScalarNullishCoalescingExpression(expression, context)

    if (scalarNullish != null) {
      return scalarNullish
    }

    if (isNullishCoalescingExpression(expression)) {
      context.diagnostics.push(
        diagnostic(
          'CCJS_C_NULLISH',
          'nullish coalescing is not supported by the current C backend slice',
          expression.loc
        )
      )

      return {
        lines: [],
        expression: '0'
      }
    }

    const leftType = inferExpressionType(expression.left, context)
    const rightType = inferExpressionType(expression.right, context)
    const nullableNullCompare = emitPreparedNullableNullCompareExpression(expression, context)

    if (nullableNullCompare != null) {
      return nullableNullCompare
    }

    if (['===', '!==', '==', '!='].includes(expression.operator) && leftType === 'string' && rightType === 'string') {
      return emitPreparedStringCompareExpression(expression, context)
    }

    if (leftType === 'string' || rightType === 'string') {
      context.diagnostics.push(
        diagnostic(
          'CCJS_C_STRING_EXPR',
          'string binary expressions are not supported by the current C backend slice',
          expression.loc
        )
      )

      return {
        lines: [],
        expression: '0'
      }
    }

    if (['&&', '||'].includes(expression.operator)) {
      return emitPreparedLogicalExpression(expression, context)
    }

    const left = emitPreparedNumberExpression(expression.left, context)
    const right = emitPreparedNumberExpression(expression.right, context)

    return {
      lines: [...left.lines, ...right.lines],
      expression: `(${left.expression} ${emitCOperator(expression.operator)} ${right.expression})`
    }
  }

  if (expression?.type === 'AssignmentExpression') {
    const value = emitPreparedNumberExpression(expression.value, context)

    return {
      lines: value.lines,
      expression: `(${emitReference(expression.target, context)} = ${value.expression})`
    }
  }

  if (expression?.type === 'CallExpression') {
    const jsonScalarParse = emitPreparedJsonScalarParseExpression(expression, context)

    if (jsonScalarParse != null) {
      return jsonScalarParse
    }

    const binaryCall = emitPreparedBinaryNumberCallExpression(expression, context)

    if (binaryCall != null) {
      return binaryCall
    }

    const numericCast = emitPreparedNumericCastExpression(expression, context)

    if (numericCast != null) {
      return numericCast
    }

    if (isStringPredicateCall(expression, context)) {
      return emitPreparedStringPredicateCall(expression, context)
    }

    const collectionCall = emitPreparedCollectionCallExpression(expression, context)

    if (collectionCall != null) {
      return collectionCall
    }

    return emitPreparedCallExpression(expression, context)
  }

  if (isMemberAccessExpression(expression)) {
    const dgramAddressPort = emitPreparedDgramAddressPortExpression(expression, context)

    if (dgramAddressPort != null) {
      return dgramAddressPort
    }

    const netAddressPort = emitPreparedNetAddressPortExpression(expression, context)

    if (netAddressPort != null) {
      return netAddressPort
    }

    const stringLength = emitPreparedStringLengthExpression(expression, context)

    if (stringLength != null) {
      return stringLength
    }

    const length = emitPreparedArrayLengthExpression(expression, context)

    if (length != null) {
      return length
    }

    const collectionSize = emitPreparedCollectionSizeExpression(expression, context)

    if (collectionSize != null) {
      return collectionSize
    }

    const bytesLength = emitPreparedBytesLengthExpression(expression, context)

    if (bytesLength != null) {
      return bytesLength
    }

    const member = resolveKnownObjectMember(expression, context)

    if (member != null && ['number', 'boolean'].includes(member.valueType)) {
      return emitPreparedRuntimeNumberValue(
        member.valueType,
        (temp) =>
          `ccjs_object_get_known(${emitObjectValueReference(member.objectName, context)}, ${member.index}, &${temp})`,
        context
      )
    }
  }

  if (isIndexAccessExpression(expression)) {
    const element = resolveKnownArrayIndex(expression, context)

    if (element != null && ['number', 'boolean'].includes(element.valueType)) {
      return emitPreparedRuntimeNumberValue(
        element.valueType,
        (temp) => `ccjs_array_get(${element.arrayName}, ${element.index}, &${temp})`,
        context
      )
    }

    const field = resolveKnownObjectIndex(expression, context)

    if (field != null && ['number', 'boolean'].includes(field.valueType)) {
      return emitPreparedRuntimeNumberValue(
        field.valueType,
        (temp) =>
          `ccjs_object_get(${emitObjectValueReference(field.objectName, context)}, ${cStringLiteral(field.key)}, ${utf8ByteLength(field.key)}, &${temp})`,
        context
      )
    }

    const runtimeElement = resolveRuntimeArrayIndex(expression, context)

    if (runtimeElement != null && ['number', 'boolean'].includes(runtimeElement.valueType)) {
      const value = emitPreparedRuntimeArrayIndexValue(expression, runtimeElement, context, 'ccjs_expr_value')

      return {
        lines: value.lines,
        expression:
          runtimeElement.valueType === 'boolean'
            ? `(${value.expression}.as.boolean ? 1 : 0)`
            : `${value.expression}.as.number`
      }
    }

    const bytesIndex = emitPreparedBytesIndexExpression(expression, context)

    if (bytesIndex != null) {
      return bytesIndex
    }
  }

  if (expression?.type === 'AwaitExpression') {
    const valueType = inferExpressionType(expression, context)
    const awaited = emitCAwaitValueExpression(expression, context)

    return {
      lines: awaited.lines,
      expression:
        valueType === 'boolean' ? `(${awaited.expression}.as.boolean ? 1 : 0)` : `${awaited.expression}.as.number`
    }
  }

  if (isOptionalChainExpression(expression)) {
    context.diagnostics.push(
      diagnostic(
        'CCJS_C_OPTIONAL_CHAINING',
        'optional chaining is not supported by the current C backend slice',
        expression?.loc
      )
    )
    return {
      lines: [],
      expression: '0'
    }
  }

  context.diagnostics.push(
    diagnostic('CCJS_C_NUMBER_EXPR', 'this number expression is not supported by the current C backend slice')
  )

  return {
    lines: [],
    expression: '0'
  }
}

function emitPreparedStringLengthExpression(expression, context) {
  if (
    expression?.type !== 'MemberExpression' ||
    expression.property !== 'length' ||
    !isStringLengthObject(expression.object, context)
  ) {
    return null
  }

  const operand = emitPreparedStringBytesOperand(expression.object, context, 'ccjs_length_string')
  const length = nextCName(context, 'ccjs_string_length')

  return {
    lines: [
      ...operand.lines,
      `size_t ${length} = ccjs_string_code_point_length_parts(${operand.bytes}, ${operand.length});`
    ],
    expression: `((double)${length})`
  }
}

function emitPreparedStringCompareExpression(expression, context) {
  const left = emitPreparedStringBytesOperand(expression.left, context)
  const right = emitPreparedStringBytesOperand(expression.right, context)
  const equals = `(${left.length} == ${right.length} && memcmp(${left.bytes}, ${right.bytes}, ${left.length}) == 0)`

  return {
    lines: [...left.lines, ...right.lines],
    expression: ['===', '=='].includes(expression.operator) ? equals : `(!${equals})`
  }
}

function emitPreparedLogicalExpression(expression, context) {
  const left = emitPreparedNumberExpression(expression.left, context)
  const leftNarrowing = resolveNullableScalarConditionNarrowing(expression.left, context)
  const rightNarrowed = expression.operator === '&&' ? leftNarrowing.trueNames : leftNarrowing.falseNames
  const right = withNullableScalarNarrowing(context, rightNarrowed, () =>
    emitPreparedNumberExpression(expression.right, context)
  )
  const temp = nextCName(context, 'ccjs_logical')

  if (expression.operator === '&&') {
    return {
      lines: [
        ...left.lines,
        `double ${temp} = 0;`,
        `if ${emitCConditionClause(left.expression)} {`,
        ...right.lines.map((line) => `  ${line}`),
        `  ${temp} = ${right.expression};`,
        '}'
      ],
      expression: temp
    }
  }

  return {
    lines: [
      ...left.lines,
      `double ${temp} = 0;`,
      `if ${emitCConditionClause(left.expression)} {`,
      `  ${temp} = 1;`,
      '} else {',
      ...right.lines.map((line) => `  ${line}`),
      `  ${temp} = ${right.expression};`,
      '}'
    ],
    expression: temp
  }
}

function emitPreparedScalarNullishCoalescingExpression(expression, context) {
  if (!canLowerCScalarNullishCoalescingExpression(expression, context)) {
    return null
  }

  const valueType = inferExpressionType(expression, context)
  const expectedTag = cRuntimeValueTag(valueType)
  const left = emitCValueExpression(expression.left, context)
  const right = emitPreparedNumberExpression(expression.right, context)
  const temp = nextCName(context, 'ccjs_nullable_scalar')
  const leftValue = valueType === 'boolean' ? `(${left.expression}.as.boolean ? 1 : 0)` : `${left.expression}.as.number`

  return {
    lines: [
      ...left.lines,
      `double ${temp} = 0;`,
      `if (${left.expression}.tag == CCJS_TAG_NULL) {`,
      ...right.lines.map((line) => `  ${line}`),
      `  ${temp} = ${right.expression};`,
      '} else {',
      `  ${emitRuntimeTypeCheck(`${left.expression}.tag != ${expectedTag}`, context)}`,
      `  ${temp} = ${leftValue};`,
      '}'
    ],
    expression: temp
  }
}

function emitPreparedNullableNullCompareExpression(expression, context) {
  if (!['===', '!==', '==', '!='].includes(expression.operator)) {
    return null
  }

  const nullable = expression.left?.type === 'NullLiteral' ? expression.right : expression.left
  const maybeNull = expression.left?.type === 'NullLiteral' ? expression.left : expression.right

  if (maybeNull?.type !== 'NullLiteral' || !isNullableRuntimeExpression(nullable, context)) {
    return null
  }

  const value = emitCValueExpression(nullable, context)
  const equals = `(${value.expression}.tag == CCJS_TAG_NULL)`

  return {
    lines: value.lines,
    expression: ['===', '=='].includes(expression.operator) ? equals : `(!${equals})`
  }
}

function resolveNullableScalarConditionNarrowing(expression, context) {
  if (expression?.type !== 'BinaryExpression') {
    return emptyNullableScalarNarrowing()
  }

  if (expression.operator === '&&') {
    const left = resolveNullableScalarConditionNarrowing(expression.left, context)
    const right = withNullableScalarNarrowing(context, left.trueNames, () =>
      resolveNullableScalarConditionNarrowing(expression.right, context)
    )

    return {
      trueNames: uniqueNames([...left.trueNames, ...right.trueNames]),
      falseNames: intersectNames(left.falseNames, uniqueNames([...left.trueNames, ...right.falseNames]))
    }
  }

  if (expression.operator === '||') {
    const left = resolveNullableScalarConditionNarrowing(expression.left, context)
    const right = withNullableScalarNarrowing(context, left.falseNames, () =>
      resolveNullableScalarConditionNarrowing(expression.right, context)
    )

    return {
      trueNames: intersectNames(left.trueNames, uniqueNames([...left.falseNames, ...right.trueNames])),
      falseNames: uniqueNames([...left.falseNames, ...right.falseNames])
    }
  }

  return resolveNullableScalarNullCheckNarrowing(expression, context)
}

function resolveNullableScalarNullCheckNarrowing(expression, context) {
  if (expression?.type !== 'BinaryExpression' || !['===', '!==', '==', '!='].includes(expression.operator)) {
    return emptyNullableScalarNarrowing()
  }

  const nullable = expression.left?.type === 'NullLiteral' ? expression.right : expression.left
  const maybeNull = expression.left?.type === 'NullLiteral' ? expression.left : expression.right

  if (maybeNull?.type !== 'NullLiteral' || nullable?.type !== 'Reference' || nullable.path.length !== 1) {
    return emptyNullableScalarNarrowing()
  }

  const name = nullable.path[0]

  if (!context.nullableVariables.has(name) || !isNullableScalarType(context.variables.get(name))) {
    return emptyNullableScalarNarrowing()
  }

  if (['!==', '!='].includes(expression.operator)) {
    return {
      trueNames: [name],
      falseNames: []
    }
  }

  return {
    trueNames: [],
    falseNames: [name]
  }
}

function emptyNullableScalarNarrowing() {
  return {
    trueNames: [],
    falseNames: []
  }
}

function uniqueNames(names) {
  return [...new Set(names)]
}

function intersectNames(left, right) {
  const rightNames = new Set(right)

  return uniqueNames(left.filter((name) => rightNames.has(name)))
}

function isNarrowedNullableScalarReference(expression, context) {
  return (
    expression?.type === 'Reference' &&
    expression.path.length === 1 &&
    context.narrowedNullableScalars.has(expression.path[0]) &&
    context.nullableVariables.has(expression.path[0]) &&
    isNullableScalarType(context.variables.get(expression.path[0]))
  )
}

function clearNullableScalarNarrowing(name, context) {
  context.narrowedNullableScalars.delete(name)

  return []
}

function emitPreparedStringPredicateCall(expression, context) {
  const value = emitPreparedStringBytesOperand(expression.callee.object, context, 'ccjs_string_method_value')
  const search = emitPreparedStringBytesOperand(expression.args[0], context, 'ccjs_string_method_search')
  const helper = cStringPredicateHelperName(expression.callee.property)

  return {
    lines: [...value.lines, ...search.lines],
    expression: `(${helper}(${value.bytes}, ${value.length}, ${search.bytes}, ${search.length}) ? 1 : 0)`
  }
}

function emitPreparedNumericCastExpression(expression, context) {
  if (!isNumericCastCall(expression, context)) {
    return null
  }

  const cast = expression.callee.path[0]
  const value = emitPreparedNumberExpression(expression.args[0], context)

  if (cast === 'f64') {
    return value
  }

  if (cast === 'f32') {
    const result = nextCName(context, 'ccjs_f32')

    return {
      lines: [...value.lines, `double ${result} = (double)((float)${value.expression});`],
      expression: result
    }
  }

  const limits = numericIntegerCastLimits(cast)

  if (limits == null) {
    return null
  }

  const raw = nextCName(context, `ccjs_${cast}_value`)
  const truncated = nextCName(context, `ccjs_${cast}_truncated`)
  const result = nextCName(context, `ccjs_${cast}`)

  return {
    lines: [
      ...value.lines,
      `double ${raw} = ${value.expression};`,
      emitRuntimeTypeCheck(`${raw} != ${raw} || (${raw} - ${raw}) != 0`, context),
      emitRuntimeTypeCheck(`${raw} <= ${limits.preMin} || ${raw} >= ${limits.preMax}`, context),
      `long long ${truncated} = (long long)${raw};`,
      emitRuntimeTypeCheck(`${truncated} < ${limits.min}LL || ${truncated} > ${limits.max}LL`, context),
      `double ${result} = (double)${truncated};`
    ],
    expression: result
  }
}

function numericIntegerCastLimits(cast) {
  if (cast === 'i32') {
    return {
      preMin: '-2147483649.0',
      preMax: '2147483648.0',
      min: '-2147483648',
      max: '2147483647'
    }
  }

  if (cast === 'u32') {
    return {
      preMin: '-1.0',
      preMax: '4294967296.0',
      min: '0',
      max: '4294967295'
    }
  }

  if (cast === 'u64') {
    return {
      preMin: '-1.0',
      preMax: '9007199254740992.0',
      min: '0',
      max: '9007199254740991'
    }
  }

  return null
}

function emitPreparedStringBytesOperand(expression, context, tempPrefix = 'ccjs_cmp_string') {
  if (expression?.type === 'StringLiteral') {
    return {
      lines: [],
      bytes: cStringLiteral(expression.value),
      length: `${utf8ByteLength(expression.value)}`
    }
  }

  if (expression?.type === 'TemplateLiteral' && !expression.raw.includes('${')) {
    const value = expression.raw.slice(1, -1)

    return {
      lines: [],
      bytes: cStringLiteral(value),
      length: `${utf8ByteLength(value)}`
    }
  }

  if (expression?.type === 'TemplateLiteral') {
    const value = emitCTemplateLiteralValueExpression(expression, context)
    const string = nextCName(context, tempPrefix)

    return {
      lines: [...value.lines, `ccjs_string* ${string} = (ccjs_string*)${value.expression}.as.ref;`],
      bytes: `${string}->bytes`,
      length: `${string}->len`
    }
  }

  if (expression?.type === 'Reference' && expression.path.length === 1) {
    const name = expression.path[0]

    if (context.variables.get(name) === 'string') {
      if (isBoxedRuntimeStringName(name, context)) {
        const string = nextCName(context, tempPrefix)

        return {
          lines: [
            emitRuntimeTypeCheck(`(*${name}).tag != CCJS_TAG_STRING || (*${name}).as.ref == 0`, context),
            `ccjs_string* ${string} = (ccjs_string*)(*${name}).as.ref;`
          ],
          bytes: `${string}->bytes`,
          length: `${string}->len`
        }
      }

      const reference = emitReference(expression, context)

      if (context.runtimeStrings.has(reference)) {
        return {
          lines: [],
          bytes: `${reference}->bytes`,
          length: `${reference}->len`
        }
      }

      return {
        lines: [],
        bytes: reference,
        length: `strlen(${reference})`
      }
    }
  }

  const netAddressMember = resolveNetAddressStringMember(expression, context)

  if (netAddressMember != null) {
    return {
      lines: [],
      bytes: netAddressMember,
      length: `strlen(${netAddressMember})`
    }
  }

  if (inferExpressionType(expression, context) === 'string') {
    const value = emitCValueExpression(expression, context)
    const string = nextCName(context, tempPrefix)

    return {
      lines: [...value.lines, `ccjs_string* ${string} = (ccjs_string*)${value.expression}.as.ref;`],
      bytes: `${string}->bytes`,
      length: `${string}->len`
    }
  }

  context.diagnostics.push(
    diagnostic(
      'CCJS_C_STRING_EXPR',
      'this string operand is not supported by the current C backend slice',
      expression?.loc
    )
  )

  return {
    lines: [],
    bytes: '""',
    length: '0'
  }
}

function emitPreparedUpdateExpression(expression, context) {
  const reference = emitReference(expression.argument, context)
  const operator = expression.operator === '--' ? '--' : '++'

  if (expression.prefix !== false) {
    return {
      lines: [],
      expression: `(${operator}${reference})`
    }
  }

  const previous = nextCName(context, 'ccjs_update_previous')

  return {
    lines: [`double ${previous} = ${reference};`, `${reference}${operator};`],
    expression: previous
  }
}

function emitPreparedRuntimeNumberValue(valueType, emitGetCall, context) {
  const value = nextCName(context, 'ccjs_expr_value')
  registerOwnedValue(context, value)

  return {
    lines: [...emitPrepareOwnedValueWrite(value), emitStatusCheck(emitGetCall(value), context)],
    expression: valueType === 'boolean' ? `(${value}.as.boolean ? 1 : 0)` : `${value}.as.number`
  }
}

function emitCExpression(expression, context) {
  if (isNullishCoalescingExpression(expression)) {
    context.diagnostics.push(
      diagnostic('CCJS_C_NULLISH', 'nullish coalescing is not supported by the current C backend slice', expression.loc)
    )
    return '0'
  }

  const type = inferExpressionType(expression, context)

  if (type === 'string') {
    return emitStringExpression(expression, context)
  }

  if (type === 'function') {
    context.diagnostics.push(
      diagnostic(
        'CCJS_C_FUNCTION_VALUE',
        'function values are not supported by the current C backend slice',
        expression?.loc
      )
    )
    return '0'
  }

  if (type === 'timer') {
    context.diagnostics.push(
      diagnostic(
        'CCJS_C_TIMER_HANDLE',
        'timer handles can only be stored or passed to clear timer functions in the current C backend slice',
        expression?.loc
      )
    )
    return '0'
  }

  if (type === 'optional') {
    context.diagnostics.push(
      diagnostic(
        'CCJS_C_OPTIONAL_CHAINING',
        'optional chaining is not supported by the current C backend slice',
        expression?.loc
      )
    )
    return '0'
  }

  if (type === 'js-global') {
    reportCJsGlobalDiagnostic(context.diagnostics, expression?.loc)
    return '0'
  }

  return emitNumberExpression(expression, context)
}

function emitReference(expression, context) {
  if (expression?.type === 'Reference') {
    const name = expression.path.join('_')

    if (context.variables.has(name)) {
      return context.boxedVariables.has(name) ? `(*${name})` : name
    }

    return context.functionNames.get(name) ?? name
  }

  context.diagnostics.push(
    diagnostic(
      'CCJS_C_ASSIGNMENT_TARGET',
      'this assignment target is not supported by the current C backend slice',
      expression?.loc
    )
  )
  return '_'
}

function emitCallExpression(expression, context) {
  return `${emitCallee(expression.callee, context)}(${expression.args.map((arg) => emitCExpression(arg, context)).join(', ')})`
}

function emitPreparedCallExpression(expression, context) {
  const mathCall = emitPreparedMathCallExpression(expression, context)

  if (mathCall != null) {
    return mathCall
  }

  const fsStatsMethod = emitPreparedFsStatsMethodExpression(expression, context)

  if (fsStatsMethod != null) {
    return fsStatsMethod
  }

  const numberConversion = emitCNumberConversionValueExpression(expression, context)

  if (numberConversion != null) {
    return numberConversion
  }

  const classMethodCall = emitPreparedClassMethodCallExpression(expression, context)

  if (classMethodCall != null) {
    return classMethodCall
  }

  const arrayPopCall = emitPreparedArrayPopCallExpression(expression, context)

  if (arrayPopCall != null) {
    return arrayPopCall
  }

  const arrayMapCall = emitPreparedArrayMapCallExpression(expression, context)

  if (arrayMapCall != null) {
    return arrayMapCall
  }

  const arrayFilterCall = emitPreparedArrayFilterCallExpression(expression, context)

  if (arrayFilterCall != null) {
    return arrayFilterCall
  }

  const arraySortCall = emitPreparedArraySortCallExpression(expression, context)

  if (arraySortCall != null) {
    return arraySortCall
  }

  const collectionCall = emitPreparedCollectionCallExpression(expression, context)

  if (collectionCall != null) {
    return collectionCall
  }

  const cryptoCall = emitPreparedCryptoCallExpression(expression, context)

  if (cryptoCall != null) {
    return cryptoCall
  }

  const fsCall = emitPreparedFsCallExpression(expression, context)

  if (fsCall != null) {
    return fsCall
  }

  const fetchHeadersCall = emitPreparedFetchHeadersCallExpression(expression, context)

  if (fetchHeadersCall != null) {
    return fetchHeadersCall
  }

  const jsonCall = emitPreparedJsonCallExpression(expression, context)

  if (jsonCall != null) {
    return jsonCall
  }

  const timerCall = emitPreparedTimerCallExpression(expression, context, {
    asValue: true
  })

  if (timerCall != null) {
    return timerCall
  }

  const promise = emitPreparedPromiseStaticExpression(expression, context)

  if (promise != null) {
    return promise
  }

  const promiseMethod = emitPreparedPromiseMethodExpression(expression, context)

  if (promiseMethod != null) {
    return promiseMethod
  }

  const callbackType = resolveRuntimeCallbackCalleeType(expression.callee, context)

  if (callbackType != null) {
    return emitRuntimeCallbackCall(expression, callbackType, context)
  }

  const params = resolveFunctionParams(expression.callee, context)

  if (params == null) {
    return {
      lines: [],
      expression: emitCallExpression(expression, context)
    }
  }

  const prepared = emitPreparedCallArgs(expression, params, context)
  const { lines, args } = prepared

  if (isThrowingFunctionCallee(expression.callee, context)) {
    return emitPreparedThrowingCallExpression(expression, args, lines, context)
  }

  if (isPromiseReturningFunctionCallee(expression.callee, context)) {
    registerEventLoop(context)

    return {
      lines,
      expression: `${emitCallee(expression.callee, context)}(${[emitEventLoopReference(context), ...args].join(', ')})`
    }
  }

  if (isExternalEventLoopFunctionCallee(expression.callee, context)) {
    registerEventLoop(context)

    return {
      lines,
      expression: `${emitCallee(expression.callee, context)}(${[emitEventLoopReference(context), ...args].join(', ')})`
    }
  }

  return {
    lines,
    expression: `${emitCallee(expression.callee, context)}(${args.join(', ')})`
  }
}

function emitPreparedMathCallExpression(expression, context) {
  const method = mathRuntimeMethodName(expression.callee)

  if (method == null) {
    return null
  }

  const args = expression.args.map((arg) => emitPreparedNumberExpression(arg, context))

  return {
    lines: args.flatMap((arg) => arg.lines),
    expression: `ccjs_math_${method}(${args.map((arg) => arg.expression).join(', ')})`
  }
}

function emitPreparedCallArgs(expression, params, context) {
  const lines: string[] = []
  const args: string[] = []

  for (const [index, arg] of expression.args.entries()) {
    if (isNullableScalarParam(params[index])) {
      const value = emitNullableScalarValueExpression(arg, context)

      lines.push(...value.lines)
      args.push(value.expression)
    } else if (isNullableFunctionType(params[index]?.valueType, params[index]?.nullable)) {
      const value = emitNullableFunctionValueExpression(arg, params[index]?.functionType, context)

      lines.push(...value.lines)
      args.push(value.expression)
    } else if (params[index]?.valueType === 'string') {
      const value = emitCValueExpression(arg, context)

      lines.push(...value.lines)
      args.push(value.expression)
    } else if (params[index]?.valueType === 'object') {
      const value = emitCValueExpression(arg, context)

      lines.push(...value.lines)
      args.push(value.expression)
    } else if (
      params[index]?.valueType === 'bytes' ||
      params[index]?.valueType === 'array' ||
      params[index]?.valueType === 'map' ||
      params[index]?.valueType === 'set'
    ) {
      const value = emitCValueExpression(arg, context)

      lines.push(...value.lines)
      args.push(value.expression)
    } else if (params[index]?.valueType === 'function') {
      const runtimeFunctionType = resolveRuntimeFunctionArgumentType(expression.callee, index, params[index], context)

      if (runtimeFunctionType != null) {
        const value = emitRuntimeCallbackValue(arg, runtimeFunctionType, context)

        lines.push(...value.lines)
        args.push(value.expression)
      } else {
        args.push(emitFunctionValueExpression(arg, context))
      }
    } else {
      args.push(emitCExpression(arg, context))
    }
  }

  return {
    lines,
    args
  }
}

function emitPreparedFsCallExpression(expression, context, options: { out?: string; owned?: boolean } = {}) {
  const method = cFsRuntimeExpressionMethod(expression)

  if (method == null || expression?.valueType !== 'promise') {
    return null
  }

  registerEventLoop(context)

  const out = options.out ?? nextCName(context, 'ccjs_promise')
  if (options.owned !== false) {
    registerOwnedPromise(
      context,
      out,
      expression.promiseValueType ??
        ([
          'access',
          'appendFile',
          'appendFileBytes',
          'copyFile',
          'mkdir',
          'rename',
          'rm',
          'symlink',
          'unlink',
          'writeFile',
          'writeFileBytes'
        ].includes(method)
          ? 'void'
          : method === 'readDir' || method === 'readDirDirents'
            ? 'array'
            : method === 'stat' || method === 'lstat'
              ? 'object'
              : method === 'realpath' || method === 'readlink'
                ? 'string'
              : method === 'readFileBytes'
                ? 'bytes'
                : 'string'),
      'error'
    )
  }
  const path = emitPreparedStringBytesOperand(expression.args[0], context, 'ccjs_fs_path')
  const lines = [...path.lines]

  if (method === 'readFile') {
    lines.push(
      emitStatusCheck(
        `ccjs_fs_read_file(${emitEventLoopReference(context)}, ${path.bytes}, ${path.length}, &${out})`,
        context
      )
    )

    return {
      lines,
      expression: out,
      rejectionValueType: 'error'
    }
  }

  if (method === 'readFileBytes') {
    lines.push(
      emitStatusCheck(
        `ccjs_fs_read_file_bytes(${emitEventLoopReference(context)}, ${path.bytes}, ${path.length}, &${out})`,
        context
      )
    )

    return {
      lines,
      expression: out,
      rejectionValueType: 'error'
    }
  }

  if (method === 'readDir') {
    lines.push(
      emitStatusCheck(
        `ccjs_fs_read_dir(${emitEventLoopReference(context)}, ${path.bytes}, ${path.length}, &${out})`,
        context
      )
    )

    return {
      lines,
      expression: out,
      rejectionValueType: 'error'
    }
  }

  if (method === 'readDirDirents') {
    lines.push(
      emitStatusCheck(
        `ccjs_fs_read_dir_dirents(${emitEventLoopReference(context)}, ${path.bytes}, ${path.length}, &${out})`,
        context
      )
    )

    return {
      lines,
      expression: out,
      rejectionValueType: 'error'
    }
  }

  if (method === 'stat' || method === 'lstat') {
    lines.push(
      emitStatusCheck(
        `ccjs_fs_${method}(${emitEventLoopReference(context)}, ${path.bytes}, ${path.length}, &${out})`,
        context
      )
    )

    return {
      lines,
      expression: out,
      rejectionValueType: 'error'
    }
  }

  if (method === 'realpath' || method === 'readlink') {
    lines.push(
      emitStatusCheck(
        `ccjs_fs_${method}(${emitEventLoopReference(context)}, ${path.bytes}, ${path.length}, &${out})`,
        context
      )
    )

    return {
      lines,
      expression: out,
      rejectionValueType: 'error'
    }
  }

  if (method === 'access') {
    const mode = emitPreparedFsAccessModeExpression(expression, context)

    lines.push(...mode.lines)
    lines.push(
      emitStatusCheck(
        `ccjs_fs_access(${emitEventLoopReference(context)}, ${path.bytes}, ${path.length}, ${mode.expression}, &${out})`,
        context
      )
    )

    return {
      lines,
      expression: out,
      rejectionValueType: 'error'
    }
  }

  if (method === 'appendFileBytes') {
    const bytes = emitCValueExpression(expression.args[1], context)

    lines.push(...bytes.lines)
    lines.push(emitRuntimeValueCheck(bytes.expression, 'CCJS_TAG_BYTES', context))
    lines.push(
      emitStatusCheck(
        `ccjs_fs_append_file_bytes(${emitEventLoopReference(context)}, ${path.bytes}, ${path.length}, ${bytes.expression}, &${out})`,
        context
      )
    )

    return {
      lines,
      expression: out,
      rejectionValueType: 'error'
    }
  }

  if (method === 'appendFile') {
    const bytes = emitPreparedStringBytesOperand(expression.args[1], context, 'ccjs_fs_bytes')

    lines.push(...bytes.lines)
    lines.push(
      emitStatusCheck(
        `ccjs_fs_append_file(${emitEventLoopReference(context)}, ${path.bytes}, ${path.length}, ${bytes.bytes}, ${bytes.length}, &${out})`,
        context
      )
    )

    return {
      lines,
      expression: out,
      rejectionValueType: 'error'
    }
  }

  if (method === 'copyFile') {
    const destPath = emitPreparedStringBytesOperand(expression.args[1], context, 'ccjs_fs_dest_path')

    lines.push(...destPath.lines)
    lines.push(
      emitStatusCheck(
        `ccjs_fs_copy_file(${emitEventLoopReference(context)}, ${path.bytes}, ${path.length}, ${destPath.bytes}, ${destPath.length}, &${out})`,
        context
      )
    )

    return {
      lines,
      expression: out,
      rejectionValueType: 'error'
    }
  }

  if (method === 'symlink') {
    const linkPath = emitPreparedStringBytesOperand(expression.args[1], context, 'ccjs_fs_link_path')

    lines.push(...linkPath.lines)
    lines.push(
      emitStatusCheck(
        `ccjs_fs_symlink(${emitEventLoopReference(context)}, ${path.bytes}, ${path.length}, ${linkPath.bytes}, ${linkPath.length}, &${out})`,
        context
      )
    )

    return {
      lines,
      expression: out,
      rejectionValueType: 'error'
    }
  }

  if (method === 'mkdir') {
    lines.push(
      emitStatusCheck(
        `ccjs_fs_mkdir(${emitEventLoopReference(context)}, ${path.bytes}, ${path.length}, ${emitFsBooleanFlag(expression, 'fsRecursive')}, &${out})`,
        context
      )
    )

    return {
      lines,
      expression: out,
      rejectionValueType: 'error'
    }
  }

  if (method === 'unlink') {
    lines.push(
      emitStatusCheck(`ccjs_fs_unlink(${emitEventLoopReference(context)}, ${path.bytes}, ${path.length}, &${out})`, context)
    )

    return {
      lines,
      expression: out,
      rejectionValueType: 'error'
    }
  }

  if (method === 'rm') {
    lines.push(
      emitStatusCheck(
        `ccjs_fs_rm(${emitEventLoopReference(context)}, ${path.bytes}, ${path.length}, ${emitFsBooleanFlag(expression, 'fsRecursive')}, ${emitFsBooleanFlag(expression, 'fsForce')}, &${out})`,
        context
      )
    )

    return {
      lines,
      expression: out,
      rejectionValueType: 'error'
    }
  }

  if (method === 'rename') {
    const newPath = emitPreparedStringBytesOperand(expression.args[1], context, 'ccjs_fs_new_path')

    lines.push(...newPath.lines)
    lines.push(
      emitStatusCheck(
        `ccjs_fs_rename(${emitEventLoopReference(context)}, ${path.bytes}, ${path.length}, ${newPath.bytes}, ${newPath.length}, &${out})`,
        context
      )
    )

    return {
      lines,
      expression: out,
      rejectionValueType: 'error'
    }
  }

  if (method === 'writeFileBytes') {
    const bytes = emitCValueExpression(expression.args[1], context)

    lines.push(...bytes.lines)
    lines.push(emitRuntimeValueCheck(bytes.expression, 'CCJS_TAG_BYTES', context))
    lines.push(
      emitStatusCheck(
        `ccjs_fs_write_file_bytes(${emitEventLoopReference(context)}, ${path.bytes}, ${path.length}, ${bytes.expression}, &${out})`,
        context
      )
    )

    return {
      lines,
      expression: out,
      rejectionValueType: 'error'
    }
  }

  const bytes = emitPreparedStringBytesOperand(expression.args[1], context, 'ccjs_fs_bytes')

  lines.push(...bytes.lines)
  lines.push(
    emitStatusCheck(
      `ccjs_fs_write_file(${emitEventLoopReference(context)}, ${path.bytes}, ${path.length}, ${bytes.bytes}, ${bytes.length}, &${out})`,
      context
    )
  )

  return {
    lines,
    expression: out,
    rejectionValueType: 'error'
  }
}

function emitPreparedFetchCallExpression(expression, context, options: { out?: string; owned?: boolean } = {}) {
  const method = cFetchRuntimeExpressionMethod(expression)

  if (method == null || expression?.valueType !== 'promise') {
    return null
  }

  registerEventLoop(context)

  const out = options.out ?? nextCName(context, 'ccjs_promise')
  const valueType = expression.promiseValueType ?? (method === 'text' ? 'string' : 'object')

  if (options.owned !== false) {
    registerOwnedPromise(context, out, valueType, 'error')
  }

  if (method === 'fetch') {
    const url = emitPreparedStringBytesOperand(expression.args[0], context, 'ccjs_fetch_url')
    const init = emitPreparedFetchInitOperand(expression, context)
    const call =
      init.expression === '0'
        ? `ccjs_fetch(${emitEventLoopReference(context)}, ${url.bytes}, ${url.length}, &${out})`
        : `ccjs_fetch_with_init(${emitEventLoopReference(context)}, ${url.bytes}, ${url.length}, ${init.expression}, &${out})`

    return {
      lines: [
        ...url.lines,
        ...init.lines,
        emitStatusCheck(call, context)
      ],
      expression: out,
      valueType,
      rejectionValueType: 'error'
    }
  }

  const response = emitCValueExpression(expression.callee.object, context)

  return {
    lines: [
      ...response.lines,
      emitRuntimeTypeCheck(`${response.expression}.tag != CCJS_TAG_OBJECT || ${response.expression}.as.ref == 0`, context),
      emitStatusCheck(`ccjs_fetch_response_text(${emitEventLoopReference(context)}, ${response.expression}, &${out})`, context)
    ],
    expression: out,
    valueType,
    rejectionValueType: 'error'
  }
}

function emitPreparedFetchHeadersCallExpression(expression, context, options: { out?: string; owned?: boolean } = {}) {
  const method = cFetchRuntimeExpressionMethod(expression)

  if (method !== 'headersGet' && method !== 'headersHas') {
    return null
  }

  const headers = emitCValueExpression(expression.callee.object, context)
  const name = emitPreparedStringBytesOperand(expression.args[0], context, 'ccjs_fetch_header_name')
  const lines = [
    ...headers.lines,
    emitRuntimeTypeCheck(`${headers.expression}.tag != CCJS_TAG_OBJECT || ${headers.expression}.as.ref == 0`, context),
    ...name.lines
  ]

  if (method === 'headersHas') {
    const out = options.out ?? nextCName(context, 'ccjs_fetch_header_has')
    lines.push(`int ${out} = 0;`)
    lines.push(emitStatusCheck(`ccjs_fetch_headers_has(${headers.expression}, ${name.bytes}, ${name.length}, &${out})`, context))

    return {
      lines,
      expression: out,
      valueType: 'boolean'
    }
  }

  const out = options.out ?? nextCName(context, 'ccjs_fetch_header_value')

  if (options.owned !== false) {
    registerOwnedValue(context, out)
  }

  lines.push(...emitPrepareOwnedValueWrite(out))
  lines.push(
    emitStatusCheck(
      `ccjs_fetch_headers_get(&ccjs_default_allocator, ${headers.expression}, ${name.bytes}, ${name.length}, &${out})`,
      context
    )
  )

  return {
    lines,
    expression: out,
    valueType: 'string',
    nullable: true
  }
}

function emitFetchAbortControllerVariableDeclaration(statement, context) {
  if (!isFetchAbortControllerConstructorExpression(statement.init)) {
    return null
  }

  registerOwnedValue(context, statement.name)
  context.variables.set(statement.name, 'object')
  registerObjectShape(context, statement.name, statement.shape)

  return [
    ...emitPrepareOwnedValueWrite(statement.name),
    emitStatusCheck(`ccjs_fetch_abort_controller_new(&ccjs_default_allocator, &${statement.name})`, context)
  ]
}

function emitFetchAbortControllerAbortStatement(expression, context) {
  if (cFetchRuntimeExpressionMethod(expression) !== 'abort') {
    return null
  }

  const controller = emitCValueExpression(expression.callee.object, context)

  return [
    ...controller.lines,
    emitRuntimeTypeCheck(`${controller.expression}.tag != CCJS_TAG_OBJECT || ${controller.expression}.as.ref == 0`, context),
    emitStatusCheck(`ccjs_fetch_abort_controller_abort(${controller.expression})`, context)
  ]
}

function emitPreparedFetchInitOperand(expression, context) {
  const init = expression.args[1]

  if (init == null || init.type !== 'ObjectLiteral') {
    return {
      lines: [],
      expression: '0'
    }
  }

  const lines: string[] = []
  const methodValue = findObjectLiteralPropertyValue(init, 'method')
  const headersValue = findObjectLiteralPropertyValue(init, 'headers')
  const bodyValue = findObjectLiteralPropertyValue(init, 'body')
  const signalValue = findObjectLiteralPropertyValue(init, 'signal')
  const redirectValue = findObjectLiteralPropertyValue(init, 'redirect')
  const method =
    methodValue == null
      ? { lines: [] as string[], bytes: '0', length: '0' }
      : emitPreparedStringBytesOperand(methodValue, context, 'ccjs_fetch_method')
  const redirect =
    redirectValue == null
      ? { lines: [] as string[], bytes: '0', length: '0' }
      : emitPreparedStringBytesOperand(redirectValue, context, 'ccjs_fetch_redirect')
  const body =
    bodyValue == null ? { lines: [] as string[], bytes: '0', length: '0' } : emitPreparedFetchBodyOperand(bodyValue, context)
  const signal =
    signalValue == null ? { lines: [] as string[], expression: 'ccjs_undefined_value()' } : emitPreparedFetchSignalOperand(signalValue, context)
  let headersExpression = '0'
  let headerCount = '0'

  lines.push(...method.lines)

  if (headersValue?.type === 'ObjectLiteral' && headersValue.properties.length > 0) {
    const headersName = nextCName(context, 'ccjs_fetch_headers')
    const headerInitializers: string[] = []

    for (const property of headersValue.properties) {
      const value = emitPreparedStringBytesOperand(property.value, context, 'ccjs_fetch_header')

      lines.push(...value.lines)
      headerInitializers.push(
        `{ ${cStringLiteral(String(property.key))}, ${utf8ByteLength(String(property.key))}, ${value.bytes}, ${value.length} }`
      )
    }

    lines.push(`ccjs_fetch_header ${headersName}[${headersValue.properties.length}] = { ${headerInitializers.join(', ')} };`)
    headersExpression = headersName
    headerCount = `${headersValue.properties.length}`
  }

  lines.push(...body.lines)
  lines.push(...signal.lines)
  lines.push(...redirect.lines)

  const initName = nextCName(context, 'ccjs_fetch_init')

  lines.push(
    `ccjs_fetch_init ${initName} = { ${method.bytes}, ${method.length}, ${headersExpression}, ${headerCount}, ${body.bytes}, ${body.length}, ${signal.expression}, ${redirect.bytes}, ${redirect.length} };`
  )

  return {
    lines,
    expression: `&${initName}`
  }
}

function emitPreparedFetchSignalOperand(expression, context) {
  if (expression?.type === 'MemberExpression' && expression.property === 'signal') {
    const controller = emitCValueExpression(expression.object, context)
    const signal = nextCName(context, 'ccjs_fetch_signal')

    registerOwnedValue(context, signal)

    return {
      lines: [
        ...controller.lines,
        emitRuntimeTypeCheck(`${controller.expression}.tag != CCJS_TAG_OBJECT || ${controller.expression}.as.ref == 0`, context),
        ...emitPrepareOwnedValueWrite(signal),
        emitStatusCheck(`ccjs_fetch_abort_controller_signal(${controller.expression}, &${signal})`, context)
      ],
      expression: signal
    }
  }

  const signal = emitCValueExpression(expression, context)

  return {
    lines: [
      ...signal.lines,
      emitRuntimeTypeCheck(`${signal.expression}.tag != CCJS_TAG_OBJECT || ${signal.expression}.as.ref == 0`, context)
    ],
    expression: signal.expression
  }
}

function emitPreparedFetchBodyOperand(expression, context) {
  if (inferExpressionType(expression, context) === 'bytes') {
    const value = emitCValueExpression(expression, context)
    const bytes = nextCName(context, 'ccjs_fetch_body')

    return {
      lines: [
        ...value.lines,
        emitRuntimeValueCheck(value.expression, 'CCJS_TAG_BYTES', context),
        `ccjs_bytes* ${bytes} = (ccjs_bytes*)${value.expression}.as.ref;`
      ],
      bytes: `(const char*)${bytes}->bytes`,
      length: `${bytes}->len`
    }
  }

  return emitPreparedStringBytesOperand(expression, context, 'ccjs_fetch_body')
}

function emitPreparedFsSyncValueExpression(expression, context) {
  const method = cFsRuntimeExpressionMethod(expression)

  if (
    method == null ||
    ![
      'lstatSync',
      'readFileBytesSync',
      'readFileSync',
      'readDirDirentsSync',
      'readDirSync',
      'readlinkSync',
      'realpathSync',
      'statSync'
    ].includes(method)
  ) {
    return null
  }

  const valueType = inferExpressionType(expression, context)
  const expectedTag = cRuntimeValueTag(valueType)

  if (expectedTag == null) {
    return null
  }

  const path = emitPreparedStringBytesOperand(expression.args[0], context, 'ccjs_fs_path')
  const out = nextCName(context, 'ccjs_fs_value')
  registerOwnedValue(context, out)
  const call =
    method === 'readFileSync'
      ? `ccjs_fs_read_file_sync(&ccjs_default_allocator, ${path.bytes}, ${path.length}, &${out})`
      : method === 'readFileBytesSync'
        ? `ccjs_fs_read_file_bytes_sync(&ccjs_default_allocator, ${path.bytes}, ${path.length}, &${out})`
        : method === 'readDirSync'
          ? `ccjs_fs_read_dir_sync(&ccjs_default_allocator, ${path.bytes}, ${path.length}, &${out})`
          : method === 'readDirDirentsSync'
            ? `ccjs_fs_read_dir_dirents_sync(&ccjs_default_allocator, ${path.bytes}, ${path.length}, &${out})`
            : method === 'realpathSync'
              ? `ccjs_fs_realpath_sync(&ccjs_default_allocator, ${path.bytes}, ${path.length}, &${out})`
              : method === 'readlinkSync'
                ? `ccjs_fs_readlink_sync(&ccjs_default_allocator, ${path.bytes}, ${path.length}, &${out})`
                : method === 'statSync'
                  ? `ccjs_fs_stat_sync(&ccjs_default_allocator, ${path.bytes}, ${path.length}, &${out})`
                  : `ccjs_fs_lstat_sync(&ccjs_default_allocator, ${path.bytes}, ${path.length}, &${out})`

  return {
    lines: [
      ...path.lines,
      ...emitPrepareOwnedValueWrite(out),
      emitStatusCheck(call, context),
      emitRuntimeValueCheck(out, expectedTag, context)
    ],
    expression: out
  }
}

function emitPreparedFsSyncStatementExpression(expression, context) {
  const method = cFsRuntimeExpressionMethod(expression)

  if (
    method == null ||
    ![
      'accessSync',
      'appendFileBytesSync',
      'appendFileSync',
      'copyFileSync',
      'mkdirSync',
      'renameSync',
      'rmSync',
      'symlinkSync',
      'unlinkSync',
      'writeFileBytesSync',
      'writeFileSync'
    ].includes(method)
  ) {
    return null
  }

  const path = emitPreparedStringBytesOperand(expression.args[0], context, 'ccjs_fs_path')
  const lines = [...path.lines]

  if (method === 'accessSync') {
    const mode = emitPreparedFsAccessModeExpression(expression, context)

    lines.push(...mode.lines)
    lines.push(emitStatusCheck(`ccjs_fs_access_sync(${path.bytes}, ${path.length}, ${mode.expression})`, context))

    return {
      lines
    }
  }

  if (method === 'appendFileBytesSync') {
    const bytes = emitCValueExpression(expression.args[1], context)

    lines.push(...bytes.lines)
    lines.push(emitRuntimeValueCheck(bytes.expression, 'CCJS_TAG_BYTES', context))
    lines.push(
      emitStatusCheck(`ccjs_fs_append_file_bytes_sync(${path.bytes}, ${path.length}, ${bytes.expression})`, context)
    )

    return {
      lines
    }
  }

  if (method === 'appendFileSync') {
    const bytes = emitPreparedStringBytesOperand(expression.args[1], context, 'ccjs_fs_bytes')

    lines.push(...bytes.lines)
    lines.push(
      emitStatusCheck(`ccjs_fs_append_file_sync(${path.bytes}, ${path.length}, ${bytes.bytes}, ${bytes.length})`, context)
    )

    return {
      lines
    }
  }

  if (method === 'copyFileSync') {
    const destPath = emitPreparedStringBytesOperand(expression.args[1], context, 'ccjs_fs_dest_path')

    lines.push(...destPath.lines)
    lines.push(
      emitStatusCheck(`ccjs_fs_copy_file_sync(${path.bytes}, ${path.length}, ${destPath.bytes}, ${destPath.length})`, context)
    )

    return {
      lines
    }
  }

  if (method === 'symlinkSync') {
    const linkPath = emitPreparedStringBytesOperand(expression.args[1], context, 'ccjs_fs_link_path')

    lines.push(...linkPath.lines)
    lines.push(emitStatusCheck(`ccjs_fs_symlink_sync(${path.bytes}, ${path.length}, ${linkPath.bytes}, ${linkPath.length})`, context))

    return {
      lines
    }
  }

  if (method === 'mkdirSync') {
    lines.push(
      emitStatusCheck(
        `ccjs_fs_mkdir_sync(${path.bytes}, ${path.length}, ${emitFsBooleanFlag(expression, 'fsRecursive')})`,
        context
      )
    )

    return {
      lines
    }
  }

  if (method === 'unlinkSync') {
    lines.push(emitStatusCheck(`ccjs_fs_unlink_sync(${path.bytes}, ${path.length})`, context))

    return {
      lines
    }
  }

  if (method === 'rmSync') {
    lines.push(
      emitStatusCheck(
        `ccjs_fs_rm_sync(${path.bytes}, ${path.length}, ${emitFsBooleanFlag(expression, 'fsRecursive')}, ${emitFsBooleanFlag(expression, 'fsForce')})`,
        context
      )
    )

    return {
      lines
    }
  }

  if (method === 'renameSync') {
    const newPath = emitPreparedStringBytesOperand(expression.args[1], context, 'ccjs_fs_new_path')

    lines.push(...newPath.lines)
    lines.push(
      emitStatusCheck(`ccjs_fs_rename_sync(${path.bytes}, ${path.length}, ${newPath.bytes}, ${newPath.length})`, context)
    )

    return {
      lines
    }
  }

  if (method === 'writeFileBytesSync') {
    const bytes = emitCValueExpression(expression.args[1], context)

    lines.push(...bytes.lines)
    lines.push(emitRuntimeValueCheck(bytes.expression, 'CCJS_TAG_BYTES', context))
    lines.push(
      emitStatusCheck(`ccjs_fs_write_file_bytes_sync(${path.bytes}, ${path.length}, ${bytes.expression})`, context)
    )

    return {
      lines
    }
  }

  const bytes = emitPreparedStringBytesOperand(expression.args[1], context, 'ccjs_fs_bytes')

  lines.push(...bytes.lines)
  lines.push(
    emitStatusCheck(`ccjs_fs_write_file_sync(${path.bytes}, ${path.length}, ${bytes.bytes}, ${bytes.length})`, context)
  )

  return {
    lines
  }
}

function emitPreparedFsAccessModeExpression(expression, context) {
  if (expression.args[1] == null) {
    return {
      lines: [],
      expression: 'CCJS_FS_F_OK'
    }
  }

  const mode = emitPreparedNumberExpression(expression.args[1], context)

  return {
    lines: mode.lines,
    expression: `((int)${mode.expression})`
  }
}

function emitFsBooleanFlag(expression, field: string) {
  return expression?.[field] === true ? 'true' : 'false'
}

function emitPreparedFsStatsMethodExpression(expression, context) {
  const method = cFsRuntimeExpressionMethod(expression)

  if (method == null || !['direntIsDirectory', 'direntIsFile', 'statsIsDirectory', 'statsIsFile'].includes(method)) {
    return null
  }

  const receiver = emitCValueExpression(expression.callee.object, context)
  const helper =
    method === 'statsIsFile'
      ? 'ccjs_fs_stats_is_file'
      : method === 'statsIsDirectory'
        ? 'ccjs_fs_stats_is_directory'
        : method === 'direntIsFile'
          ? 'ccjs_fs_dirent_is_file'
          : 'ccjs_fs_dirent_is_directory'

  return {
    lines: receiver.lines,
    expression: `(${helper}(${receiver.expression}) ? 1 : 0)`
  }
}

function emitPreparedJsonCallExpression(expression, context, options: { out?: string; owned?: boolean } = {}) {
  const method = cJsonRuntimeCallName(expression?.callee)

  if (method == null) {
    return null
  }

  const out = options.out ?? nextCName(context, 'ccjs_json_value')

  if (options.owned !== false) {
    registerOwnedValue(context, out)
  }

  if (method === 'parse') {
    const text = emitPreparedStringBytesOperand(expression.args[0], context, 'ccjs_json_text')
    const expectedTag = cRuntimeValueTag(inferExpressionType(expression, context))

    return {
      lines: [
        ...text.lines,
        ...emitPrepareOwnedValueWrite(out),
        emitStatusCheck(`ccjs_json_parse(&ccjs_default_allocator, ${text.bytes}, ${text.length}, &${out})`, context),
        ...(expectedTag == null ? [] : [emitRuntimeValueCheck(out, expectedTag, context)])
      ],
      expression: out
    }
  }

  const value = emitCValueExpression(expression.args[0], context)

  return {
    lines: [
      ...value.lines,
      ...emitPrepareOwnedValueWrite(out),
      emitStatusCheck(`ccjs_json_stringify(&ccjs_default_allocator, ${value.expression}, &${out})`, context),
      emitRuntimeValueCheck(out, 'CCJS_TAG_STRING', context)
    ],
    expression: out
  }
}

function emitPreparedJsonScalarParseExpression(expression, context) {
  if (expression?.type !== 'CallExpression' || cJsonRuntimeCallName(expression.callee) !== 'parse') {
    return null
  }

  const valueType = inferExpressionType(expression, context)

  if (valueType !== 'number' && valueType !== 'boolean') {
    return null
  }

  const value = emitPreparedJsonCallExpression(expression, context)

  if (value == null) {
    return null
  }

  return {
    lines: value.lines,
    expression: valueType === 'boolean' ? `(${value.expression}.as.boolean ? 1 : 0)` : `${value.expression}.as.number`
  }
}

function emitPreparedCryptoCallExpression(expression, context, options: { discard?: boolean } = {}) {
  if (cryptoRuntimeMethodName(expression) !== 'getRandomValues') {
    return null
  }

  const value = emitCValueExpression(expression.args[0], context)

  if (options.discard === true) {
    return {
      lines: [...value.lines, emitStatusCheck(`ccjs_crypto_get_random_values(${value.expression})`, context)],
      expression: ''
    }
  }

  const out = nextCName(context, 'ccjs_crypto_bytes')
  registerOwnedValue(context, out)

  return {
    lines: [
      ...value.lines,
      emitStatusCheck(`ccjs_crypto_get_random_values(${value.expression})`, context),
      ...emitPrepareOwnedValueWrite(out),
      `${out} = ${value.expression};`,
      emitRuntimeValueCheck(out, 'CCJS_TAG_BYTES', context),
      `ccjs_retain(${out});`
    ],
    expression: out
  }
}

function emitPreparedTimerCallExpression(expression, context, options: { out?: string; asValue?: boolean } = {}) {
  const method = cTimerRuntimeCallName(expression?.callee)

  if (method == null) {
    return null
  }

  const clearMethod = cTimerClearCallName(expression.callee)

  if (clearMethod != null) {
    const handle = emitPreparedTimerHandleExpression(expression.args[0], context)

    return {
      lines: [...handle.lines, `ccjs_loop_clear_timer(${handle.expression});`],
      expression: ''
    }
  }

  if (context.statusReturn && !context.externalEventLoop) {
    context.diagnostics.push(
      diagnostic(
        'CCJS_C_TIMER_CALLBACK',
        'timer calls inside runtime callbacks need callback loop capture and are not supported by the current C backend slice',
        expression.loc
      )
    )

    return {
      lines: [],
      expression: ''
    }
  }

  if (method === 'setInterval' && options.out == null && options.asValue !== true) {
    context.diagnostics.push(
      diagnostic(
        'CCJS_C_TIMER_HANDLE',
        'setInterval requires a timer handle so it can be cleared by the current C backend slice',
        expression.loc
      )
    )

    return {
      lines: [],
      expression: ''
    }
  }

  registerEventLoop(context)

  const out = options.out ?? (options.asValue === true ? nextCName(context, 'ccjs_timer_handle') : null)
  const callback = emitRuntimeCallbackValue(expression.args[0], timerCallbackFunctionType(), context)
  const callbackContext = nextCName(context, 'ccjs_timer_ctx')
  const lines = [
    ...(out != null && options.out == null ? [`ccjs_timer_handle* ${out} = 0;`] : []),
    ...callback.lines,
    `ccjs_value* ${callbackContext} = ccjs_default_alloc(0, sizeof(ccjs_value), _Alignof(ccjs_value));`,
    `if (${callbackContext} == 0) ${emitFailureStatement(context)}`,
    `*${callbackContext} = ${callback.expression};`,
    `ccjs_retain(*${callbackContext});`
  ]
  const outArgument = out == null ? '0' : `&${out}`

  if (method === 'setImmediate') {
    lines.push(
      `if (ccjs_loop_queue_immediate(${emitEventLoopReference(context)}, ccjs_timer_callback_run, ${callbackContext}, ccjs_timer_callback_finalize, ${outArgument}) != CCJS_OK) {`
    )
    lines.push(`  ccjs_timer_callback_finalize(${callbackContext});`)
    lines.push(`  ${emitFailureStatement(context)}`)
    lines.push('}')

    return {
      lines,
      expression: out ?? ''
    }
  }

  const delay = emitPreparedNumberExpression(expression.args[1], context)
  const runtimeCall = method === 'setInterval' ? 'ccjs_loop_set_interval' : 'ccjs_loop_set_timeout'

  lines.push(...delay.lines)
  lines.push(
    `if (${runtimeCall}(${emitEventLoopReference(context)}, ${delay.expression}, ccjs_timer_callback_run, ${callbackContext}, ccjs_timer_callback_finalize, ${outArgument}) != CCJS_OK) {`
  )
  lines.push(`  ccjs_timer_callback_finalize(${callbackContext});`)
  lines.push(`  ${emitFailureStatement(context)}`)
  lines.push('}')

  return {
    lines,
    expression: out ?? ''
  }
}

function emitPreparedTimerHandleExpression(expression, context) {
  if (
    expression?.type === 'Reference' &&
    expression.path.length === 1 &&
    context.variables.get(expression.path[0]) === 'timer'
  ) {
    return {
      lines: [],
      expression: emitReference(expression, context)
    }
  }

  if (expression?.type === 'CallExpression' && cTimerStartCallName(expression.callee) != null) {
    return emitPreparedTimerCallExpression(expression, context, {
      asValue: true
    })
  }

  context.diagnostics.push(
    diagnostic('CCJS_C_TIMER_HANDLE', 'timer clear calls require a timer handle value', expression?.loc)
  )

  return {
    lines: [],
    expression: '0'
  }
}

function emitPreparedPromiseStaticExpression(expression, context, options: { out?: string; owned?: boolean } = {}) {
  const method = cPromiseRuntimeCallName(expression?.callee)

  if (method == null || expression?.valueType !== 'promise') {
    return null
  }

  registerEventLoop(context)

  const out = options.out ?? nextCName(context, 'ccjs_promise')
  const rejectionValueType = method === 'reject' ? inferRejectedValueType(expression.args[0], context) : 'unknown'

  if (options.owned !== false) {
    registerOwnedPromise(context, out, expression.promiseValueType ?? 'unknown', rejectionValueType)
  }
  const runtimeCall = method === 'resolve' ? 'ccjs_promise_resolved' : 'ccjs_promise_rejected'
  const value =
    expression.args[0] == null
      ? {
          lines: [],
          expression: 'ccjs_undefined_value()'
        }
      : emitCValueExpression(expression.args[0], context)

  return {
    lines: [
      ...value.lines,
      emitStatusCheck(`${runtimeCall}(${emitEventLoopReference(context)}, ${value.expression}, &${out})`, context)
    ],
    expression: out,
    rejectionValueType
  }
}

function emitPreparedPromiseConstructorExpression(
  expression,
  context,
  options: { out?: string; owned?: boolean } = {}
) {
  if (!isPromiseConstructorExpression(expression) || expression?.valueType !== 'promise') {
    return null
  }

  registerEventLoop(context)

  const out = options.out ?? nextCName(context, 'ccjs_promise')
  const executor = expression.args[0]
  const valueType = expression.promiseValueType ?? 'unknown'
  const rejectionValueType = promiseConstructorRejectionValueType(executor, context)

  if (options.owned !== false) {
    registerOwnedPromise(context, out, valueType, rejectionValueType)
  }

  const lines = [emitStatusCheck(`ccjs_promise_new(${emitEventLoopReference(context)}, &${out})`, context)]

  if (executor?.type !== 'ArrowFunctionExpression') {
    context.diagnostics.push(
      diagnostic(
        'CCJS_C_ASYNC',
        'Promise constructor currently supports only arrow-function executors in C',
        expression.loc
      )
    )

    return {
      lines,
      expression: out,
      valueType,
      rejectionValueType
    }
  }

  const resolveName = executor.params[0]?.name ?? null
  const rejectName = executor.params[1]?.name ?? null
  const statements = executor.expressionBody
    ? [
        {
          type: 'ExpressionStatement',
          expression: executor.body,
          loc: executor.body?.loc ?? executor.loc
        }
      ]
    : executor.body

  lines.push(
    ...withPromiseConstructorHandlers(context, resolveName, rejectName, out, () =>
      emitStatementList(statements, context)
    )
  )

  return {
    lines,
    expression: out,
    valueType,
    rejectionValueType
  }
}

function emitPromiseConstructorSettlementCall(expression, context): string[] | null {
  if (
    expression?.type !== 'CallExpression' ||
    expression.callee?.type !== 'Reference' ||
    expression.callee.path.length !== 1
  ) {
    return null
  }

  const handler = context.promiseConstructorHandlers.get(expression.callee.path[0])

  if (handler == null) {
    return null
  }

  if (expression.args.length > 1) {
    context.diagnostics.push(
      diagnostic(
        'CCJS_C_ASYNC',
        'Promise constructor resolve/reject handlers currently support at most one argument in C',
        expression.loc
      )
    )
  }

  const value =
    expression.args[0] == null
      ? {
          lines: [],
          expression: 'ccjs_undefined_value()'
        }
      : emitCValueExpression(expression.args[0], context)
  const runtimeCall = handler.kind === 'resolve' ? 'ccjs_promise_resolve' : 'ccjs_promise_reject'

  return [...value.lines, emitStatusCheck(`${runtimeCall}(${handler.promise}, ${value.expression})`, context)]
}

function withPromiseConstructorHandlers(context, resolveName, rejectName, promise, callback) {
  const previous = context.promiseConstructorHandlers
  context.promiseConstructorHandlers = new Map(previous)

  if (resolveName != null) {
    context.promiseConstructorHandlers.set(resolveName, {
      kind: 'resolve',
      promise
    })
  }

  if (rejectName != null) {
    context.promiseConstructorHandlers.set(rejectName, {
      kind: 'reject',
      promise
    })
  }

  try {
    return callback()
  } finally {
    context.promiseConstructorHandlers = previous
  }
}

function promiseConstructorRejectionValueType(executor, context) {
  if (executor?.type !== 'ArrowFunctionExpression') {
    return 'unknown'
  }

  const rejectName = executor.params[1]?.name

  if (rejectName == null) {
    return 'unknown'
  }

  const types: string[] = []
  const visit = (node) => {
    if (node == null) {
      return
    }

    if (Array.isArray(node)) {
      node.forEach(visit)
      return
    }

    if (typeof node !== 'object') {
      return
    }

    if (
      node.type === 'CallExpression' &&
      node.callee?.type === 'Reference' &&
      node.callee.path.length === 1 &&
      node.callee.path[0] === rejectName
    ) {
      types.push(inferRejectedValueType(node.args[0], context))
    }

    for (const [key, value] of Object.entries(node)) {
      if (key === 'loc' || key === 'callee') {
        continue
      }

      visit(value)
    }
  }

  visit(executor.expressionBody ? executor.body : executor.body)

  return uniqueValueTypes(types)
}

function uniqueValueTypes(types) {
  const [first] = types

  if (first == null) {
    return 'unknown'
  }

  return types.every((type) => type === first) ? first : 'unknown'
}

function emitPreparedPromiseMethodExpression(expression, context, options: { out?: string; owned?: boolean } = {}) {
  if (!isPromiseMethodCallExpression(expression, context)) {
    return null
  }

  const method = expression.callee.property
  const callback = expression.args[0]
  const wrapper = callback == null ? null : context.promiseChainArrowWrappers.get(callback)

  if (wrapper == null) {
    context.diagnostics.push(
      diagnostic(
        'CCJS_C_ASYNC',
        'Promise.then/catch currently supports only non-capturing expression-body, single-return block-body, straight-line block-body or simple control-flow block-body arrow callbacks in C',
        expression.loc
      )
    )

    return {
      lines: [],
      expression: '0',
      valueType: expression.promiseValueType ?? 'unknown',
      rejectionValueType: 'unknown'
    }
  }

  const receiver = emitPreparedPromiseExpression(expression.callee.object, context)

  if (receiver == null) {
    context.diagnostics.push(
      diagnostic(
        'CCJS_C_ASYNC',
        'this Promise chain receiver is not supported by the current C backend slice',
        expression.loc
      )
    )

    return {
      lines: [],
      expression: '0',
      valueType: expression.promiseValueType ?? 'unknown',
      rejectionValueType: 'unknown'
    }
  }

  const out = options.out ?? nextCName(context, 'ccjs_promise')
  const valueType = expression.promiseValueType ?? 'unknown'
  const rejectionValueType = method === 'then' ? (receiver.rejectionValueType ?? 'unknown') : 'unknown'
  const callbackContext = emitPromiseChainCallbackContext(wrapper, context)
  const runtimeCall =
    method === 'then'
      ? `ccjs_promise_chain(${receiver.expression}, ${wrapper.name}, 0, ${callbackContext.expression}, ${callbackContext.finalizer}, &${out})`
      : `ccjs_promise_catch(${receiver.expression}, ${wrapper.name}, ${callbackContext.expression}, ${callbackContext.finalizer}, &${out})`
  const runtimeCallLines =
    callbackContext.expression === '0'
      ? [emitStatusCheck(runtimeCall, context)]
      : [
          `if (${runtimeCall} != CCJS_OK) {`,
          `  ${wrapper.finalizerName}(${callbackContext.expression});`,
          `  ${emitFailureStatement(context)}`,
          '}'
        ]

  if (options.owned !== false) {
    registerOwnedPromise(context, out, valueType, rejectionValueType)
  }

  return {
    lines: [...receiver.lines, ...callbackContext.lines, ...runtimeCallLines],
    expression: out,
    valueType,
    rejectionValueType
  }
}

function emitPromiseChainCallbackContext(wrapper, context) {
  if (!isPromiseChainCallbackWrapperWithContext(wrapper)) {
    return {
      lines: [],
      expression: '0',
      finalizer: '0'
    }
  }

  const lines: string[] = []

  for (const capture of wrapper.captures) {
    if (capture.mutable) {
      context.diagnostics.push(
        diagnostic(
          'CCJS_C_ASYNC',
          'mutable Promise callback captures are outside the current C backend MVP; use const captures or move mutation outside the Promise callback',
          wrapper.expression.loc
        )
      )
    }

    if (!['number', 'boolean', 'string', 'object'].includes(capture.valueType)) {
      context.diagnostics.push(
        diagnostic(
          'CCJS_C_ASYNC',
          'capturing Promise callbacks currently support only const number/boolean/string/object bindings',
          wrapper.expression.loc
        )
      )
    }
  }

  const contextName = nextCName(context, 'ccjs_promise_callback_ctx')

  lines.push(
    `${wrapper.contextTypeName}* ${contextName} = ccjs_default_alloc(0, sizeof(${wrapper.contextTypeName}), _Alignof(${wrapper.contextTypeName}));`
  )
  lines.push(`if (${contextName} == 0) ${emitFailureStatement(context)}`)

  if (wrapper.needsEventLoop === true) {
    registerEventLoop(context)
    lines.push(`${contextName}->ccjs_loop = ${emitEventLoopReference(context)};`)
  }

  for (const capture of wrapper.captures) {
    lines.push(...emitRuntimeArrowCaptureStoreLines(capture, contextName, context))
  }

  return {
    lines,
    expression: contextName,
    finalizer: wrapper.finalizerName
  }
}

function emitPreparedAsyncFunctionPromiseCallExpression(
  expression,
  context,
  options: { out?: string; owned?: boolean } = {}
) {
  if (
    expression?.type !== 'CallExpression' ||
    !isAsyncFunctionCallee(expression.callee, context) ||
    expression.valueType !== 'promise'
  ) {
    return null
  }

  const valueType =
    resolveCAsyncFunctionAwaitValueType(expression.callee, context) ?? expression.promiseValueType ?? 'unknown'
  const taskCall = emitPreparedAsyncTaskPromiseCallExpression(expression, valueType, context, options)

  if (taskCall != null) {
    return taskCall
  }

  if (isThrowingFunctionCallee(expression.callee, context)) {
    return emitPreparedThrowingAsyncFunctionPromiseCallExpression(expression, valueType, context, options)
  }

  if (!isSupportedAsyncFunctionPromiseValueType(valueType)) {
    context.diagnostics.push(
      diagnostic(
        'CCJS_C_ASYNC',
        'async function calls as Promise values currently support only number, boolean, string, bytes, object, array, map, set and void values in C',
        expression.loc
      )
    )

    return {
      lines: [],
      expression: '0',
      valueType,
      rejectionValueType: 'unknown'
    }
  }

  registerEventLoop(context)

  const out = options.out ?? nextCName(context, 'ccjs_promise')
  const call = emitPreparedCallExpression(expression, context)
  const managedValue = isManagedRuntimeReturnType(valueType) ? nextCName(context, 'ccjs_async_value') : null
  const value =
    valueType === 'void'
      ? 'ccjs_undefined_value()'
      : valueType === 'boolean'
        ? `ccjs_bool_value((${call.expression}) != 0)`
        : valueType === 'number'
          ? `ccjs_number_value(${call.expression})`
          : managedValue
  const valueCheck =
    managedValue == null ? '' : emitRuntimeValueCheck(managedValue, cRuntimeValueTag(valueType), context)

  if (managedValue != null) {
    registerOwnedValue(context, managedValue)
  }

  if (options.owned !== false) {
    registerOwnedPromise(context, out, valueType, 'unknown')
  }

  return {
    lines:
      managedValue == null
        ? [
            ...call.lines,
            emitStatusCheck(`ccjs_promise_resolved(${emitEventLoopReference(context)}, ${value}, &${out})`, context)
          ]
        : [
            ...call.lines,
            ...emitPrepareOwnedValueWrite(managedValue),
            `${managedValue} = ${call.expression};`,
            ...(valueCheck === '' ? [] : [valueCheck]),
            emitStatusCheck(`ccjs_promise_resolved(${emitEventLoopReference(context)}, ${value}, &${out})`, context),
            ...emitPrepareOwnedValueWrite(managedValue)
          ],
    expression: out,
    valueType,
    rejectionValueType: 'unknown'
  }
}

function emitPreparedAsyncTaskPromiseCallExpression(
  expression,
  valueType,
  context,
  options: { out?: string; owned?: boolean } = {}
) {
  if (expression.callee?.type !== 'Reference' || expression.callee.path.length !== 1) {
    return null
  }

  const wrapper = context.asyncTaskWrappers.get(expression.callee.path[0])

  if (wrapper == null) {
    return null
  }

  registerEventLoop(context)

  const out = options.out ?? nextCName(context, 'ccjs_promise')
  const prepared = emitPreparedCallArgs(expression, wrapper.params, context)
  const args = [emitEventLoopReference(context), ...prepared.args, `&${out}`]

  if (options.owned !== false) {
    registerOwnedPromise(context, out, valueType, 'unknown')
  }

  return {
    lines: [...prepared.lines, emitStatusCheck(`${wrapper.startName}(${args.join(', ')})`, context)],
    expression: out,
    valueType,
    rejectionValueType: 'unknown'
  }
}

function emitPreparedThrowingAsyncFunctionPromiseCallExpression(
  expression,
  valueType,
  context,
  options: { out?: string; owned?: boolean } = {}
) {
  if (!isSupportedAsyncFunctionPromiseValueType(valueType)) {
    context.diagnostics.push(
      diagnostic(
        'CCJS_C_ASYNC',
        'throwing async function calls as Promise values currently support only number, boolean, string, bytes, object, array, map, set and void values in C',
        expression.loc
      )
    )

    return {
      lines: [],
      expression: '0',
      valueType,
      rejectionValueType: resolveCFunctionRejectionValueType(expression.callee, context)
    }
  }

  const params = resolveFunctionParams(expression.callee, context)

  if (params == null) {
    context.diagnostics.push(
      diagnostic(
        'CCJS_C_ASYNC',
        'this async function call is not supported as a Promise value in the current C backend slice',
        expression.loc
      )
    )

    return {
      lines: [],
      expression: '0',
      valueType,
      rejectionValueType: 'unknown'
    }
  }

  registerEventLoop(context)
  registerErrorChannel(context)

  const out = options.out ?? nextCName(context, 'ccjs_promise')
  const prepared = emitPreparedCallArgs(expression, params, context)
  const result = valueType === 'void' ? null : nextCName(context, 'ccjs_async_result')
  const managedResult = result != null && isManagedRuntimeReturnType(valueType)
  const status = nextCName(context, 'ccjs_async_status')
  const args = [...prepared.args]
  const rejectionValueType = resolveCFunctionRejectionValueType(expression.callee, context)
  const fulfilledValue =
    valueType === 'void'
      ? 'ccjs_undefined_value()'
      : valueType === 'boolean'
        ? `ccjs_bool_value((${result}) != 0)`
        : valueType === 'number'
          ? `ccjs_number_value(${result})`
          : result
  const valueCheck = managedResult ? emitRuntimeValueCheck(result, cRuntimeValueTag(valueType), context) : ''

  if (result != null) {
    args.push(`&${result}`)
  }

  args.push('&ccjs_error')

  if (options.owned !== false) {
    registerOwnedPromise(context, out, valueType, rejectionValueType)
  }

  if (managedResult) {
    registerOwnedValue(context, result)
  }

  return {
    lines: [
      ...prepared.lines,
      ...emitPrepareOwnedValueWrite('ccjs_error'),
      ...(result == null ? [] : managedResult ? emitPrepareOwnedValueWrite(result) : [`double ${result} = 0;`]),
      `ccjs_status ${status} = ${emitCallee(expression.callee, context)}(${args.join(', ')});`,
      `if (${status} == CCJS_ERR_THROW) {`,
      `  ${emitStatusCheck(`ccjs_promise_rejected(${emitEventLoopReference(context)}, ccjs_error, &${out})`, context)}`,
      '  ccjs_release(ccjs_error);',
      '  ccjs_error = ccjs_undefined_value();',
      '} else {',
      `  if (${status} != CCJS_OK) ${emitFailureStatement(context)}`,
      ...(valueCheck === '' ? [] : [`  ${valueCheck}`]),
      `  ${emitStatusCheck(`ccjs_promise_resolved(${emitEventLoopReference(context)}, ${fulfilledValue}, &${out})`, context)}`,
      ...(managedResult ? emitPrepareOwnedValueWrite(result).map((line) => `  ${line}`) : []),
      '}'
    ],
    expression: out,
    valueType,
    rejectionValueType
  }
}

function isSupportedAsyncFunctionPromiseValueType(valueType) {
  return (
    valueType === 'void' || valueType === 'number' || valueType === 'boolean' || isManagedRuntimeReturnType(valueType)
  )
}

function resolveCFunctionRejectionValueType(callee, context) {
  if (callee?.type !== 'Reference' || callee.path.length !== 1) {
    return 'unknown'
  }

  const types = context.functionThrowValueTypes.get(callee.path[0]) ?? []

  if (types.length === 1 && types[0] === 'error') {
    return 'error'
  }

  if (types.length === 1 && types[0] === 'string') {
    return 'string'
  }

  return 'unknown'
}

function emitPreparedAwaitPromiseExpression(expression, context) {
  const promiseExpression = emitPreparedPromiseExpression(expression, context)

  if (promiseExpression != null) {
    return {
      ...promiseExpression,
      valueType:
        knownValueType(promiseExpression.valueType) ??
        knownValueType(expression.promiseValueType) ??
        resolvePromiseExpressionValueType(expression, context) ??
        'unknown'
    }
  }

  return null
}

function emitPreparedPromiseExpression(expression, context, options: { out?: string; owned?: boolean } = {}) {
  const fetchCall = emitPreparedFetchCallExpression(expression, context, options)

  if (fetchCall != null) {
    return {
      ...fetchCall,
      valueType: resolvePromiseExpressionValueType(expression, context) ?? fetchCall.valueType ?? 'unknown'
    }
  }

  const fsCall = emitPreparedFsCallExpression(expression, context, options)

  if (fsCall != null) {
    return {
      ...fsCall,
      valueType: resolvePromiseExpressionValueType(expression, context) ?? 'unknown'
    }
  }

  const promiseConstructor = emitPreparedPromiseConstructorExpression(expression, context, options)

  if (promiseConstructor != null) {
    return {
      ...promiseConstructor,
      valueType: resolvePromiseExpressionValueType(expression, context) ?? promiseConstructor.valueType ?? 'unknown'
    }
  }

  const promiseResolve = emitPreparedPromiseStaticExpression(expression, context, options)

  if (promiseResolve != null) {
    return {
      ...promiseResolve,
      valueType: resolvePromiseExpressionValueType(expression, context) ?? 'unknown'
    }
  }

  const promiseMethod = emitPreparedPromiseMethodExpression(expression, context, options)

  if (promiseMethod != null) {
    return {
      ...promiseMethod,
      valueType: resolvePromiseExpressionValueType(expression, context) ?? 'unknown'
    }
  }

  const asyncPromiseCall = emitPreparedAsyncFunctionPromiseCallExpression(expression, context, options)

  if (asyncPromiseCall != null) {
    return {
      ...asyncPromiseCall,
      valueType: resolvePromiseExpressionValueType(expression, context) ?? 'unknown'
    }
  }

  const promiseCall = emitPreparedPromiseReturningCallExpression(expression, context, options)

  if (promiseCall != null) {
    return promiseCall
  }

  if (expression?.type === 'Reference' && expression.path.length === 1) {
    const name = expression.path[0]

    if (context.variables.get(name) === 'promise') {
      return {
        lines: [],
        expression: name,
        valueType: context.promiseValueTypes.get(name) ?? 'unknown',
        rejectionValueType: context.promiseRejectionValueTypes.get(name) ?? 'unknown'
      }
    }
  }

  return null
}

function emitCAwaitValueExpression(expression, context) {
  const asyncCall = emitCAsyncFunctionAwaitExpression(expression, context)

  if (asyncCall != null) {
    return asyncCall
  }

  const promise = emitPreparedAwaitPromiseExpression(expression.argument, context)

  if (promise == null) {
    if (inferExpressionType(expression.argument, context) !== 'promise') {
      return emitCValueExpression(expression.argument, context)
    }

    context.diagnostics.push(
      diagnostic(
        'CCJS_C_ASYNC',
        'this awaited promise expression is not supported by the current C backend slice',
        expression.loc
      )
    )

    return {
      lines: [],
      expression: 'ccjs_undefined_value()'
    }
  }

  registerEventLoop(context)

  const valueType =
    knownValueType(expression.valueType) ??
    knownValueType(promise.valueType) ??
    resolvePromiseExpressionValueType(expression.argument, context) ??
    'unknown'
  const value = nextCName(context, 'ccjs_await_value')
  const valueTag = cRuntimeValueTag(valueType)
  const valueCheck = emitRuntimeValueCheck(value, valueTag, context)
  registerOwnedValue(context, value)

  return {
    lines: [
      ...promise.lines,
      ...emitPrepareOwnedValueWrite(value),
      `while (ccjs_promise_get_state(${promise.expression}) == CCJS_PROMISE_PENDING && ccjs_loop_has_work(${emitEventLoopReference(context)})) {`,
      ...emitEventLoopSleepUntilNextTimerLines(context, '  '),
      `  ${emitStatusCheck(`ccjs_loop_poll(${emitEventLoopReference(context)}, ${emitEventLoopNextTimeExpression(context)})`, context)}`,
      '}',
      ...emitAwaitRejectedPromiseLines(promise.expression, promise.rejectionValueType ?? 'unknown', context),
      `if (ccjs_promise_get_state(${promise.expression}) != CCJS_PROMISE_FULFILLED) ${emitFailureStatement(context)}`,
      emitStatusCheck(`ccjs_promise_get_result(${promise.expression}, &${value})`, context),
      ...(valueCheck === '' ? [] : [valueCheck])
    ],
    expression: value
  }
}

function emitAwaitRejectedPromiseLines(promiseExpression, rejectionValueType, context) {
  const target = currentErrorTarget(context)
  const rejectedTypeCheck =
    rejectionValueType === 'error'
      ? 'ccjs_error.tag != CCJS_TAG_OBJECT || ccjs_error.as.ref == 0'
      : 'ccjs_error.tag != CCJS_TAG_STRING || ccjs_error.as.ref == 0'

  if (target == null && !context.throwingFunction) {
    return [
      `if (ccjs_promise_get_state(${promiseExpression}) == CCJS_PROMISE_REJECTED) ${emitFailureStatement(context)}`
    ]
  }

  registerErrorChannel(context)

  return [
    `if (ccjs_promise_get_state(${promiseExpression}) == CCJS_PROMISE_REJECTED) {`,
    ...emitPrepareOwnedValueWrite('ccjs_error').map((line) => `  ${line}`),
    `  ${emitStatusCheck(`ccjs_promise_get_result(${promiseExpression}, &ccjs_error)`, context)}`,
    `  ${emitRuntimeTypeCheck(rejectedTypeCheck, context)}`,
    '  ccjs_error_active = 1;',
    ...(target == null ? ['  ccjs_status_result = CCJS_ERR_THROW;', '  goto ccjs_cleanup;'] : [`  goto ${target};`]),
    '}'
  ]
}

function emitCAsyncFunctionAwaitExpression(expression, context) {
  const callExpression = expression.argument

  if (callExpression?.type !== 'CallExpression' || !isAsyncFunctionCallee(callExpression.callee, context)) {
    return null
  }

  if (callExpression.callee.type === 'Reference' && context.asyncTaskWrappers.has(callExpression.callee.path[0])) {
    return null
  }

  const valueType =
    knownValueType(expression.valueType) ??
    knownValueType(resolveCAsyncFunctionAwaitValueType(callExpression.callee, context)) ??
    'unknown'
  const call = emitPreparedCallExpression(callExpression, context)

  if (valueType === 'void') {
    return {
      lines: [...call.lines, `${call.expression};`],
      expression: 'ccjs_undefined_value()'
    }
  }

  const valueTag = cRuntimeValueTag(valueType)

  if (valueTag == null && valueType !== 'number' && valueType !== 'boolean') {
    context.diagnostics.push(
      diagnostic(
        'CCJS_C_ASYNC',
        'this async function return value is not supported by the current C backend slice',
        expression.loc
      )
    )

    return {
      lines: [],
      expression: 'ccjs_undefined_value()'
    }
  }

  const value = nextCName(context, 'ccjs_await_value')
  registerOwnedValue(context, value)

  const resultExpression =
    valueType === 'boolean'
      ? `ccjs_bool_value((${call.expression}) != 0)`
      : valueType === 'number'
        ? `ccjs_number_value(${call.expression})`
        : call.expression
  const valueCheck = emitRuntimeValueCheck(value, valueTag, context)

  return {
    lines: [
      ...call.lines,
      ...emitPrepareOwnedValueWrite(value),
      `${value} = ${resultExpression};`,
      ...(valueCheck === '' ? [] : [valueCheck])
    ],
    expression: value
  }
}

function emitPreparedThrowingCallExpression(expression, args, preparedLines, context) {
  const name = expression.callee.path[0]
  const returnInfo = resolveCFunctionCallReturnInfo(name, context)
  const returnType = returnInfo.returnType
  const returnNullable = returnInfo.returnNullable
  const callArgs = [...args]
  const lines: string[] = [...preparedLines]
  let result = ''

  if (currentErrorTarget(context) == null && !context.throwingFunction) {
    context.diagnostics.push(
      diagnostic(
        'CCJS_C_THROW',
        'uncaught throwing function calls must be inside try/catch in the current C backend slice',
        expression.loc
      )
    )
  }

  registerErrorChannel(context)
  lines.push(...emitPrepareOwnedValueWrite('ccjs_error'))

  if (returnType !== 'void') {
    if (isManagedRuntimeReturnType(returnType) || (returnNullable && isNullableScalarType(returnType))) {
      result = nextCName(context, 'ccjs_call_result')
      lines.push(`ccjs_value ${result} = ccjs_undefined_value();`)
    } else {
      result = nextCName(context, 'ccjs_call_result')
      lines.push(`double ${result} = 0;`)
    }

    callArgs.push(`&${result}`)
  }

  callArgs.push('&ccjs_error')

  const status = nextCName(context, 'ccjs_call_status')

  lines.push(`ccjs_status ${status} = ${emitCallee(expression.callee, context)}(${callArgs.join(', ')});`)
  lines.push(...emitThrowingCallStatusCheck(status, context))

  return {
    lines,
    expression: result
  }
}

function emitPreparedPromiseReturningCallExpression(
  expression,
  context,
  options: { out?: string; owned?: boolean } = {}
) {
  if (expression?.type !== 'CallExpression' || !isPromiseReturningFunctionCallee(expression.callee, context)) {
    return null
  }

  const out = options.out ?? nextCName(context, 'ccjs_promise')
  const valueType = resolvePromiseReturningFunctionValueType(expression.callee, context)
  const call = emitPreparedCallExpression(expression, context)

  if (options.owned !== false) {
    registerOwnedPromise(context, out, valueType)
  }

  return {
    lines: [...call.lines, `${out} = ${call.expression};`, `if (${out} == 0) ${emitFailureStatement(context)}`],
    expression: out,
    valueType,
    rejectionValueType: 'unknown'
  }
}

function resolveCFunctionCallReturnInfo(name, context) {
  const returnType = context.functionReturnTypes.get(name) ?? 'void'

  if (context.functionAsyncFlags.get(name) === true && returnType === 'promise') {
    return {
      returnType: context.functionReturnPromiseValueTypes.get(name) ?? 'void',
      returnNullable: false
    }
  }

  return {
    returnType,
    returnNullable: context.functionReturnNullables.get(name) === true
  }
}

function emitThrowingCallStatusCheck(status, context) {
  const target = currentErrorTarget(context)
  const lines = [`if (${status} == CCJS_ERR_THROW) {`, '  ccjs_error_active = 1;']

  if (target != null) {
    lines.push(`  goto ${target};`)
  } else if (context.throwingFunction) {
    lines.push('  ccjs_status_result = CCJS_ERR_THROW;')
    lines.push('  goto ccjs_cleanup;')
  } else {
    lines.push(`  ${emitFailureStatement(context)}`)
  }

  lines.push('}')
  lines.push(`if (${status} != CCJS_OK) ${emitFailureStatement(context)}`)

  return lines
}

function isThrowingFunctionCallee(callee, context) {
  return callee?.type === 'Reference' && callee.path.length === 1 && isThrowingFunctionName(callee.path[0], context)
}

function isThrowingFunctionName(name, context) {
  return context.throwingFunctions?.has(name) === true
}

function emitCallee(callee, context) {
  const timeRuntimeCall = cTimeRuntimeCallName(callee)

  if (timeRuntimeCall != null) {
    return timeRuntimeCall
  }

  if (callee.type === 'Reference' && callee.path.length === 1) {
    if (isCJsGlobalRoot(callee.path[0], context)) {
      reportCJsGlobalDiagnostic(context.diagnostics, callee.loc)
      return '_'
    }

    return context.functionNames.get(callee.path[0]) ?? callee.path[0]
  }

  if (usesCJsGlobal(callee, context)) {
    reportCJsGlobalDiagnostic(context.diagnostics, callee.loc)
    return '_'
  }

  context.diagnostics.push(
    diagnostic('CCJS_C_CALL_EXPR', 'this call expression is not supported by the current C backend slice', callee.loc)
  )
  return '_'
}

function emitFunctionValueExpression(expression, context) {
  if (expression?.type === 'ArrowFunctionExpression') {
    const wrapper = context.callbackArrowWrappers.get(expression)

    if (wrapper?.kind === 'plain-arrow') {
      return wrapper.name
    }

    context.diagnostics.push(
      diagnostic(
        'CCJS_C_FUNCTION_VALUE',
        'capturing or unsupported inline callbacks are not supported by the current C backend slice; use a named function or a non-capturing inline callback with a supported signature',
        expression.loc
      )
    )

    return '0'
  }

  if (expression?.type === 'Reference' && expression.path.length === 1) {
    const name = expression.path[0]

    if (context.variables.get(name) === 'function') {
      return name
    }

    if (context.functionNames.has(name)) {
      return context.functionNames.get(name)
    }
  }

  context.diagnostics.push(
    diagnostic(
      'CCJS_C_FUNCTION_VALUE',
      'this function value is not supported by the current C backend slice',
      expression?.loc
    )
  )

  return '0'
}

function resolveRuntimeCallbackCalleeType(callee, context) {
  if (callee?.type !== 'Reference' || callee.path.length !== 1) {
    return null
  }

  const name = callee.path[0]

  if (!context.runtimeCallbacks.has(name)) {
    return null
  }

  const functionType = context.functionTypes.get(name)

  return isSupportedRuntimeCallbackType(functionType) ? normalizeFunctionType(functionType) : null
}

function isRuntimeArrowCallbackExpression(expression, context) {
  return context.callbackArrowWrappers.get(expression)?.kind === 'arrow'
}

function emitRuntimeCallbackVariableDeclaration(statement, context) {
  const functionType = normalizeFunctionType(statement.functionType)

  context.variables.set(statement.name, 'function')
  context.functionTypes.set(statement.name, functionType)
  context.runtimeCallbacks.add(statement.name)
  registerOwnedValue(context, statement.name)

  return emitRuntimeCallbackValueInto(statement.init, functionType, statement.name, context)
}

function emitRuntimeCallbackValue(expression, functionType, context) {
  if (
    expression?.type === 'Reference' &&
    expression.path.length === 1 &&
    context.runtimeCallbacks.has(expression.path[0])
  ) {
    return {
      lines: [],
      expression: expression.path[0]
    }
  }

  const temp = nextCName(context, 'ccjs_callback')
  registerOwnedValue(context, temp)

  return {
    lines: emitRuntimeCallbackValueInto(expression, functionType, temp, context),
    expression: temp
  }
}

function emitRuntimeCallbackValueInto(expression, functionType, out, context) {
  if (
    expression?.type === 'Reference' &&
    expression.path.length === 1 &&
    context.runtimeCallbacks.has(expression.path[0])
  ) {
    return [...emitPrepareOwnedValueWrite(out), `${out} = ${expression.path[0]};`, `ccjs_retain(${out});`]
  }

  if (expression?.type === 'ArrowFunctionExpression') {
    const wrapper = context.callbackArrowWrappers.get(expression)

    if (wrapper == null) {
      context.diagnostics.push(
        diagnostic(
          'CCJS_C_FUNCTION_VALUE',
          'runtime C callback wrapper was not generated for this arrow function',
          expression.loc
        )
      )
      return [...emitPrepareOwnedValueWrite(out), `${out} = ccjs_undefined_value();`]
    }

    return emitRuntimeArrowCallbackValueInto(wrapper, out, context)
  }

  if (
    expression?.type !== 'Reference' ||
    expression.path.length !== 1 ||
    !context.functionNames.has(expression.path[0])
  ) {
    context.diagnostics.push(
      diagnostic(
        'CCJS_C_FUNCTION_VALUE',
        'runtime C callbacks currently require a named non-capturing function',
        expression?.loc
      )
    )
    return [...emitPrepareOwnedValueWrite(out), `${out} = ccjs_undefined_value();`]
  }

  const wrapper = runtimeCallbackWrapperFor(expression.path[0], functionType, context)

  if (wrapper == null) {
    context.diagnostics.push(
      diagnostic(
        'CCJS_C_FUNCTION_VALUE',
        'runtime C callback wrapper was not generated for this function value',
        expression.loc
      )
    )
    return [...emitPrepareOwnedValueWrite(out), `${out} = ccjs_undefined_value();`]
  }

  const callbackContext = functionTakesEventLoopParam(expression.path[0], context)
    ? emitEventLoopReference(context)
    : '0'

  if (callbackContext !== '0') {
    registerEventLoop(context)
  }

  return [
    ...emitPrepareOwnedValueWrite(out),
    emitStatusCheck(
      `ccjs_callback_new(&ccjs_default_allocator, ${wrapper.name}, ${callbackContext}, 0, &${out})`,
      context
    )
  ]
}

function emitRuntimeArrowCallbackValueInto(wrapper, out, context) {
  const lines = [...emitPrepareOwnedValueWrite(out)]

  for (const capture of wrapper.captures) {
    if (capture.mutable && !isSupportedMutableRuntimeArrowCapture(capture, context)) {
      context.diagnostics.push(
        diagnostic(
          'CCJS_C_FUNCTION_VALUE',
          'capturing this mutable binding in C callbacks requires unsupported boxed closure storage',
          wrapper.expression.loc
        )
      )
    }

    if (!['number', 'boolean', 'string', 'object', 'timer', 'promise-settlement'].includes(capture.valueType)) {
      context.diagnostics.push(
        diagnostic(
          'CCJS_C_FUNCTION_VALUE',
          'capturing C callbacks currently support only const number/boolean/string/object/timer bindings and Promise resolve/reject handlers',
          wrapper.expression.loc
        )
      )
    }
  }

  if (!isRuntimeArrowCallbackWrapperWithContext(wrapper)) {
    lines.push(emitStatusCheck(`ccjs_callback_new(&ccjs_default_allocator, ${wrapper.name}, 0, 0, &${out})`, context))
    return lines
  }

  const contextName = nextCName(context, 'ccjs_callback_ctx')

  lines.push(
    `${wrapper.contextTypeName}* ${contextName} = ccjs_default_alloc(0, sizeof(${wrapper.contextTypeName}), _Alignof(${wrapper.contextTypeName}));`
  )
  lines.push(`if (${contextName} == 0) ${emitFailureStatement(context)}`)

  if (wrapper.needsEventLoop === true) {
    registerEventLoop(context)
    lines.push(`${contextName}->ccjs_loop = ${emitEventLoopReference(context)};`)
  }

  for (const capture of wrapper.captures) {
    lines.push(...emitRuntimeArrowCaptureStoreLines(capture, contextName, context))
  }

  lines.push(
    `if (ccjs_callback_new(&ccjs_default_allocator, ${wrapper.name}, ${contextName}, ${wrapper.finalizerName}, &${out}) != CCJS_OK) {`
  )
  lines.push(`  ${wrapper.finalizerName}(${contextName});`)
  lines.push(`  ${emitFailureStatement(context)}`)
  lines.push('}')

  return lines
}

function emitRuntimeArrowCaptureStoreLines(capture, contextName, context) {
  const field = `${contextName}->${emitRuntimeArrowCaptureField(capture)}`

  if (isSupportedMutableRuntimeArrowCapture(capture, context)) {
    return [`${field} = ${capture.name};`]
  }

  if (isRetainedRuntimeArrowCapture(capture)) {
    if (capture.valueType === 'string') {
      return [
        `${field}.tag = CCJS_TAG_STRING;`,
        `${field}.as.ref = (ccjs_ref*)&${capture.name}->header;`,
        `ccjs_retain(${field});`
      ]
    }

    return [`${field} = ${capture.name};`, `ccjs_retain(${field});`]
  }

  if (capture.valueType === 'promise-settlement') {
    const handler = context.promiseConstructorHandlers.get(capture.name)

    if (handler == null) {
      context.diagnostics.push(
        diagnostic(
          'CCJS_C_FUNCTION_VALUE',
          'Promise resolve/reject handlers can only be captured inside Promise constructor executors',
          capture.loc
        )
      )

      return [`${field} = 0;`]
    }

    return [`${field} = ${handler.promise};`, `if (${field} != 0) ccjs_promise_retain(${field});`]
  }

  return [`${field} = ${capture.name};`]
}

function emitRuntimeCallbackCall(expression, functionType, context) {
  const lines: string[] = []
  const args: string[] = []

  for (const arg of expression.args) {
    const value = emitCValueExpression(arg, context)

    lines.push(...value.lines)
    args.push(value.expression)
  }

  const out = nextCName(context, 'ccjs_callback_out')
  registerOwnedValue(context, out)
  lines.push(...emitPrepareOwnedValueWrite(out))

  if (args.length === 0) {
    lines.push(
      emitStatusCheck(`ccjs_callback_call(${emitReference(expression.callee, context)}, 0, 0, &${out})`, context)
    )
  } else {
    const argArray = nextCName(context, 'ccjs_callback_args')

    lines.push(`ccjs_value ${argArray}[] = { ${args.join(', ')} };`)
    lines.push(
      emitStatusCheck(
        `ccjs_callback_call(${emitReference(expression.callee, context)}, ${argArray}, ${args.length}, &${out})`,
        context
      )
    )
  }

  return {
    lines,
    expression: ''
  }
}

function emitOptionalRuntimeCallbackCallExpression(expression, context) {
  const functionType = resolveRuntimeCallbackCalleeType(expression.callee, context)

  if (functionType == null) {
    context.diagnostics.push(
      diagnostic(
        'CCJS_C_OPTIONAL_CHAINING',
        'optional calls currently require a nullable runtime callback value in the C backend',
        expression.loc
      )
    )
    return []
  }

  const callee = emitReference(expression.callee, context)
  const lines: string[] = [
    `if (${callee}.tag != CCJS_TAG_NULL) {`,
    `  ${emitRuntimeTypeCheck(`${callee}.tag != CCJS_TAG_FUNCTION || ${callee}.as.ref == 0`, context)}`
  ]
  const args: string[] = []

  for (const arg of expression.args) {
    const value = emitCValueExpression(arg, context)

    lines.push(...value.lines.map((line) => `  ${line}`))
    args.push(value.expression)
  }

  const out = nextCName(context, 'ccjs_callback_out')
  registerOwnedValue(context, out)
  lines.push(...emitPrepareOwnedValueWrite(out).map((line) => `  ${line}`))

  if (args.length === 0) {
    lines.push(`  ${emitStatusCheck(`ccjs_callback_call(${callee}, 0, 0, &${out})`, context)}`)
  } else {
    const argArray = nextCName(context, 'ccjs_callback_args')

    lines.push(`  ccjs_value ${argArray}[] = { ${args.join(', ')} };`)
    lines.push(`  ${emitStatusCheck(`ccjs_callback_call(${callee}, ${argArray}, ${args.length}, &${out})`, context)}`)
  }

  lines.push('}')

  return lines
}

function emitOptionalRuntimeCallbackCallValueExpression(expression, context) {
  const functionType = resolveRuntimeCallbackCalleeType(expression.callee, context)
  const resultType = inferExpressionType(expression, context)
  const expectedTag = cRuntimeValueTag(resultType)

  if (functionType == null || !isRuntimeNullableType(functionType.returnType) || expectedTag == null) {
    context.diagnostics.push(
      diagnostic(
        'CCJS_C_OPTIONAL_CHAINING',
        'optional call results currently support nullable runtime callback results in the C backend',
        expression.loc
      )
    )

    return {
      lines: [],
      expression: 'ccjs_null_value()'
    }
  }

  const callee = emitReference(expression.callee, context)
  const out = nextCName(context, 'ccjs_optional_call')
  const lines: string[] = [
    ...emitPrepareOwnedValueWrite(out),
    `${out} = ccjs_null_value();`,
    `if (${callee}.tag != CCJS_TAG_NULL) {`,
    `  ${emitRuntimeTypeCheck(`${callee}.tag != CCJS_TAG_FUNCTION || ${callee}.as.ref == 0`, context)}`
  ]
  const args: string[] = []

  registerOwnedValue(context, out)

  for (const arg of expression.args) {
    const value = emitCValueExpression(arg, context)

    lines.push(...value.lines.map((line) => `  ${line}`))
    args.push(value.expression)
  }

  lines.push(...emitPrepareOwnedValueWrite(out).map((line) => `  ${line}`))

  if (args.length === 0) {
    lines.push(`  ${emitStatusCheck(`ccjs_callback_call(${callee}, 0, 0, &${out})`, context)}`)
  } else {
    const argArray = nextCName(context, 'ccjs_callback_args')

    lines.push(`  ccjs_value ${argArray}[] = { ${args.join(', ')} };`)
    lines.push(`  ${emitStatusCheck(`ccjs_callback_call(${callee}, ${argArray}, ${args.length}, &${out})`, context)}`)
  }

  lines.push(`  ${emitRuntimeValueCheck(out, expectedTag, context)}`)
  lines.push('}')

  return {
    lines,
    expression: out
  }
}

function resolveFunctionParams(callee, context) {
  if (callee.type !== 'Reference' || callee.path.length !== 1) {
    return null
  }

  return context.functionParams.get(callee.path[0]) ?? null
}

function inferExpressionType(expression, context) {
  if (expression?.type === 'CallExpression' && cTimeRuntimeCallName(expression.callee) != null) {
    return 'number'
  }

  if (expression?.type === 'CallExpression' && cFsRuntimeExpressionMethod(expression) != null) {
    return expression.valueType === 'promise' ? 'promise' : (expression.valueType ?? 'unknown')
  }

  if (expression?.type === 'CallExpression' && cFetchRuntimeExpressionMethod(expression) != null) {
    return expression.valueType === 'promise' ? 'promise' : (expression.valueType ?? 'unknown')
  }

  if (expression?.type === 'CallExpression' && cJsonRuntimeCallName(expression.callee) != null) {
    return expression.valueType ?? (cJsonRuntimeCallName(expression.callee) === 'parse' ? 'object' : 'string')
  }

  if (cryptoRuntimeMethodName(expression) === 'getRandomValues') {
    return 'bytes'
  }

  if (
    expression?.type === 'CallExpression' &&
    cPromiseRuntimeCallName(expression.callee) != null &&
    expression.valueType === 'promise'
  ) {
    return 'promise'
  }

  if (isPromiseConstructorExpression(expression)) {
    return 'promise'
  }

  if (expression?.type === 'CallExpression' && mathRuntimeMethodName(expression.callee) != null) {
    return 'number'
  }

  if (isNumberConversionCall(expression, context)) {
    return 'number'
  }

  if (isErrorConstructorExpression(expression)) {
    return 'object'
  }

  if (isFetchAbortControllerConstructorExpression(expression)) {
    return 'object'
  }

  if (expression?.type === 'NewExpression' && collectionConstructorName(expression) === 'Map') {
    return 'map'
  }

  if (expression?.type === 'NewExpression' && collectionConstructorName(expression) === 'Set') {
    return 'set'
  }

  if (isClassConstructorExpression(expression, context)) {
    return 'object'
  }

  if (isStringConversionCall(expression, context)) {
    return 'string'
  }

  if (isStringTrimCall(expression, context)) {
    return 'string'
  }

  if (isStringSliceCall(expression, context)) {
    return 'string'
  }

  if (isStringSplitCall(expression, context)) {
    return 'array'
  }

  if (isStringPredicateCall(expression, context)) {
    return 'boolean'
  }

  if (isBinaryRuntimeCall(expression)) {
    return expression.valueType ?? (binaryRuntimeMethodName(expression?.callee) === 'toString' ? 'string' : 'bytes')
  }

  if (isBinaryConstructorExpression(expression)) {
    return 'bytes'
  }

  if (expression?.type === 'CallExpression' && usesCJsGlobal(expression.callee, context)) {
    return 'js-global'
  }

  if (expression?.type === 'NewExpression' && usesCJsGlobal(expression.callee, context)) {
    return 'js-global'
  }

  if (expression?.valueType != null && expression.valueType !== 'unknown') {
    return expression.valueType
  }

  if (expression?.type === 'StringLiteral') {
    return 'string'
  }

  if (expression?.type === 'TemplateLiteral') {
    return 'string'
  }

  if (expression?.type === 'Reference') {
    return (
      context.variables.get(expression.path.join('.')) ??
      (context.functionNames.has(expression.path[0])
        ? 'function'
        : isCJsGlobalRoot(expression.path[0], context)
          ? 'js-global'
          : 'number')
    )
  }

  if (expression?.type === 'ArrowFunctionExpression') {
    return 'function'
  }

  if (expression?.type === 'BooleanLiteral') {
    return 'boolean'
  }

  if (expression?.type === 'UnaryExpression') {
    return expression.operator === '!' ? 'boolean' : 'number'
  }

  if (expression?.type === 'UpdateExpression') {
    return 'number'
  }

  if (expression?.type === 'BinaryExpression') {
    if (['===', '!==', '==', '!=', '<', '<=', '>', '>=', '&&', '||'].includes(expression.operator)) {
      return 'boolean'
    }

    if (expression.operator === '??') {
      const left = inferExpressionType(expression.left, context)

      return left === 'null' || left === 'unknown' ? inferExpressionType(expression.right, context) : left
    }

    if (
      expression.operator === '+' &&
      (inferExpressionType(expression.left, context) === 'string' ||
        inferExpressionType(expression.right, context) === 'string')
    ) {
      return 'string'
    }

    return 'number'
  }

  if (expression?.type === 'ArrayLiteral') {
    return 'array'
  }

  if (expression?.type === 'ObjectLiteral') {
    return 'object'
  }

  if (isMemberAccessExpression(expression)) {
    if (emitPreparedNetAddressPortExpression(expression, context) != null) {
      return 'number'
    }

    if (resolveNetAddressStringMember(expression, context) != null) {
      return 'string'
    }

    if (isArrayLengthExpression(expression, context)) {
      return 'number'
    }

    const length = resolveKnownArrayLength(expression, context)

    if (length != null) {
      return 'number'
    }

    const member = resolveKnownObjectMember(expression, context)

    if (member != null) {
      return member.valueType
    }

    return expression.type === 'OptionalMemberExpression' ? 'optional' : 'number'
  }

  if (isIndexAccessExpression(expression)) {
    if (expression.collectionKind === 'map') {
      return expression.valueType ?? 'unknown'
    }

    const element = resolveKnownArrayIndex(expression, context)
    const field = resolveKnownObjectIndex(expression, context)
    const runtimeElement = resolveRuntimeArrayIndex(expression, context)

    if (element != null) {
      return element.valueType
    }

    if (field != null) {
      return field.valueType
    }

    if (runtimeElement != null) {
      return runtimeElement.valueType
    }

    return expression.type === 'OptionalIndexExpression' ? 'optional' : 'number'
  }

  if (expression?.type === 'CallExpression') {
    if (expression.valueType != null && expression.valueType !== 'unknown') {
      return expression.valueType
    }

    if (expression.callee.type === 'Reference') {
      return context.functionReturnTypes.get(expression.callee.path[0]) ?? 'number'
    }

    return 'number'
  }

  if (expression?.type === 'NewExpression') {
    return 'class'
  }

  if (expression?.type === 'AwaitExpression') {
    const valueType =
      knownValueType(expression.valueType) ?? resolvePromiseExpressionValueType(expression.argument, context)

    if (valueType != null) {
      return valueType
    }

    const argumentType = inferExpressionType(expression.argument, context)

    return argumentType === 'promise' ? 'unknown' : argumentType
  }

  if (isOptionalChainExpression(expression)) {
    return 'optional'
  }

  return 'number'
}

function isErrorConstructorExpression(expression) {
  return (
    expression?.type === 'NewExpression' &&
    expression.callee.type === 'Reference' &&
    expression.callee.path.length === 1 &&
    expression.callee.path[0] === 'Error'
  )
}

function isFetchAbortControllerConstructorExpression(expression) {
  return (
    expression?.type === 'NewExpression' &&
    expression.callee.type === 'Reference' &&
    expression.callee.path.length === 1 &&
    expression.callee.path[0] === 'AbortController'
  )
}

function isErrorValueExpression(expression, context) {
  return isKnownErrorValueExpression(expression, context, context.errorObjectNames)
}

function isKnownErrorValueExpression(expression, context, errorObjectNames) {
  if (isErrorConstructorExpression(expression)) {
    return true
  }

  if (expression?.type === 'Reference' && expression.path.length === 1) {
    return errorObjectNames.has(expression.path[0])
  }

  return false
}

function registerErrorObjectShape(context, name) {
  context.errorObjectNames.add(name)
  context.objectShapes.set(name, [
    {
      name: 'name',
      valueType: 'string'
    },
    {
      name: 'message',
      valueType: 'string'
    },
    {
      name: 'code',
      valueType: 'string'
    },
    {
      name: 'cause',
      valueType: 'object'
    }
  ])
}

function canLowerCNullishCoalescingExpression(expression, context) {
  if (!isNullishCoalescingExpression(expression)) {
    return false
  }

  const resultType = inferExpressionType(expression, context)

  return (
    isRuntimeNullableType(resultType) &&
    (inferExpressionType(expression.left, context) === 'null' || isNullableRuntimeExpression(expression.left, context))
  )
}

function canLowerCScalarNullishCoalescingExpression(expression, context) {
  if (!isNullishCoalescingExpression(expression)) {
    return false
  }

  const resultType = inferExpressionType(expression, context)

  return (
    ['number', 'boolean'].includes(resultType) &&
    (inferExpressionType(expression.left, context) === 'null' || isNullableRuntimeExpression(expression.left, context))
  )
}

function isNullableRuntimeExpression(expression, context) {
  if (expression?.type === 'Reference' && expression.path.length === 1) {
    return context.nullableVariables.has(expression.path[0])
  }

  if (isNumberConversionCall(expression, context)) {
    return true
  }

  if (
    expression?.type === 'CallExpression' &&
    expression.callee.type === 'Reference' &&
    expression.callee.path.length === 1
  ) {
    return context.functionReturnNullables.get(expression.callee.path[0]) === true
  }

  if (expression?.type === 'OptionalCallExpression') {
    const functionType = resolveRuntimeCallbackCalleeType(expression.callee, context)

    return functionType != null && isRuntimeNullableType(functionType.returnType)
  }

  if (isNullishCoalescingExpression(expression)) {
    return false
  }

  return expression?.nullable === true && isRuntimeNullableType(inferExpressionType(expression, context))
}

function isStringConcatExpression(expression, context) {
  return (
    expression?.type === 'BinaryExpression' &&
    expression.operator === '+' &&
    inferExpressionType(expression.left, context) === 'string' &&
    inferExpressionType(expression.right, context) === 'string'
  )
}

function isRuntimeProducedStringExpression(expression, context) {
  return (
    (expression?.type === 'CallExpression' && inferExpressionType(expression, context) === 'string') ||
    (expression?.type === 'AwaitExpression' && inferExpressionType(expression, context) === 'string') ||
    isStringConcatExpression(expression, context) ||
    (expression?.type === 'TemplateLiteral' && expression.raw.includes('${')) ||
    (isNullishCoalescingExpression(expression) && canLowerCNullishCoalescingExpression(expression, context)) ||
    isBoxedRuntimeStringReference(expression, context)
  )
}

function isStringConversionCall(expression, context) {
  if (
    expression?.type !== 'CallExpression' ||
    expression.callee.type !== 'Reference' ||
    expression.callee.path.length !== 1 ||
    expression.callee.path[0] !== 'String' ||
    expression.args.length !== 1
  ) {
    return false
  }

  return ['boolean', 'null', 'number', 'string'].includes(inferExpressionType(expression.args[0], context))
}

function isNumberConversionCall(expression, context) {
  if (
    expression?.type !== 'CallExpression' ||
    expression.callee.type !== 'Reference' ||
    expression.callee.path.length !== 1 ||
    expression.callee.path[0] !== 'Number' ||
    expression.args.length !== 1
  ) {
    return false
  }

  return inferExpressionType(expression.args[0], context) === 'string'
}

function isNumericCastCall(expression, context) {
  if (
    expression?.type !== 'CallExpression' ||
    expression.callee.type !== 'Reference' ||
    expression.callee.path.length !== 1 ||
    !['i32', 'u32', 'u64', 'f32', 'f64'].includes(expression.callee.path[0]) ||
    expression.args.length !== 1
  ) {
    return false
  }

  return inferExpressionType(expression.args[0], context) === 'number'
}

function isStringTrimCall(expression, context) {
  if (
    expression?.type !== 'CallExpression' ||
    expression.callee.type !== 'MemberExpression' ||
    expression.callee.property !== 'trim' ||
    expression.args.length !== 0
  ) {
    return false
  }

  return isStringLengthObject(expression.callee.object, context)
}

function isStringSliceCall(expression, context) {
  if (
    expression?.type !== 'CallExpression' ||
    expression.callee.type !== 'MemberExpression' ||
    expression.callee.property !== 'slice' ||
    expression.args.length < 1 ||
    expression.args.length > 2
  ) {
    return false
  }

  return (
    isStringLengthObject(expression.callee.object, context) &&
    expression.args.every((arg) => inferExpressionType(arg, context) === 'number')
  )
}

function isStringSplitCall(expression, context) {
  if (
    expression?.type !== 'CallExpression' ||
    expression.callee.type !== 'MemberExpression' ||
    expression.callee.property !== 'split' ||
    expression.args.length !== 1
  ) {
    return false
  }

  return (
    isStringLengthObject(expression.callee.object, context) &&
    inferExpressionType(expression.args[0], context) === 'string'
  )
}

function isStringPredicateCall(expression, context) {
  if (
    expression?.type !== 'CallExpression' ||
    expression.callee.type !== 'MemberExpression' ||
    !cStringPredicateMethods.has(expression.callee.property) ||
    expression.args.length !== 1
  ) {
    return false
  }

  return (
    isStringLengthObject(expression.callee.object, context) &&
    inferExpressionType(expression.args[0], context) === 'string'
  )
}

function isArrayMethodCall(expression) {
  return (
    expression?.type === 'CallExpression' &&
    expression.callee.type === 'MemberExpression' &&
    cArrayMethods.has(expression.callee.property)
  )
}

function emitArraySortVariableDeclaration(statement, sorted, context) {
  registerOwnedValue(context, statement.name)
  context.variables.set(statement.name, 'array')

  const shape = context.arrayShapes.get(sorted.expression)

  if (shape != null) {
    context.arrayShapes.set(
      statement.name,
      shape.map((element) => ({ ...element }))
    )
  } else {
    context.runtimeArrayElementTypes.set(statement.name, statement.arrayElementType ?? sorted.elementType ?? 'unknown')
  }

  return [
    ...sorted.lines,
    ...emitPrepareOwnedValueWrite(statement.name),
    `${statement.name} = ${sorted.expression};`,
    `ccjs_retain(${statement.name});`
  ]
}

function emitArrayFilterVariableDeclaration(statement, filtered, context) {
  registerOwnedValue(context, statement.name)
  context.variables.set(statement.name, 'array')
  context.runtimeArrayElementTypes.set(statement.name, statement.arrayElementType ?? filtered.elementType ?? 'unknown')

  return [
    ...filtered.lines,
    ...emitPrepareOwnedValueWrite(statement.name),
    `${statement.name} = ${filtered.expression};`,
    `ccjs_retain(${statement.name});`
  ]
}

function emitArrayMapVariableDeclaration(statement, mapped, context) {
  registerOwnedValue(context, statement.name)
  context.variables.set(statement.name, 'array')
  context.runtimeArrayElementTypes.set(statement.name, statement.arrayElementType ?? mapped.elementType ?? 'unknown')

  return [
    ...mapped.lines,
    ...emitPrepareOwnedValueWrite(statement.name),
    `${statement.name} = ${mapped.expression};`,
    `ccjs_retain(${statement.name});`
  ]
}

function emitPreparedArraySortCallExpression(expression, context) {
  if (
    expression?.type !== 'CallExpression' ||
    expression.callee.type !== 'MemberExpression' ||
    expression.callee.property !== 'sort' ||
    expression.args.length > 1
  ) {
    return null
  }

  const receiver = emitPreparedArrayReceiver(expression.callee.object, context)

  if (receiver == null) {
    return null
  }

  if (expression.args.length === 1) {
    return emitPreparedArrayComparatorSortCallExpression(expression, receiver, context)
  }

  return {
    lines: [...receiver.lines, emitStatusCheck(`ccjs_array_sort(${receiver.expression})`, context)],
    expression: receiver.expression,
    elementType: receiver.elementType
  }
}

function emitPreparedArrayPushCallExpression(expression, context) {
  if (
    expression?.type !== 'CallExpression' ||
    expression.callee.type !== 'MemberExpression' ||
    expression.callee.property !== 'push' ||
    expression.args.length !== 1
  ) {
    return null
  }

  const receiver = emitPreparedArrayReceiver(expression.callee.object, context)

  if (receiver == null) {
    return null
  }

  const value = emitCValueExpression(expression.args[0], context)

  updatePushedArrayMetadata(expression.callee.object, inferExpressionType(expression.args[0], context), context)

  return {
    lines: [
      ...receiver.lines,
      ...value.lines,
      emitStatusCheck(`ccjs_array_push(${receiver.expression}, ${value.expression})`, context)
    ],
    expression: '',
    elementType: receiver.elementType
  }
}

function emitPreparedArrayPopCallExpression(expression, context, options: { discard?: boolean } = {}) {
  if (
    expression?.type !== 'CallExpression' ||
    expression.callee.type !== 'MemberExpression' ||
    expression.callee.property !== 'pop' ||
    expression.args.length !== 0
  ) {
    return null
  }

  const receiver = emitPreparedArrayReceiver(expression.callee.object, context)

  if (receiver == null) {
    return null
  }

  const value = nextCName(context, 'ccjs_array_pop')
  registerOwnedValue(context, value)
  updatePoppedArrayMetadata(expression.callee.object, context)

  const lines = [
    ...receiver.lines,
    ...emitPrepareOwnedValueWrite(value),
    emitStatusCheck(`ccjs_array_pop(${receiver.expression}, &${value})`, context)
  ]

  if (options.discard === true) {
    lines.push(`ccjs_release(${value});`)
    lines.push(`${value} = ccjs_undefined_value();`)
  }

  return {
    lines,
    expression: value,
    elementType: receiver.elementType
  }
}

function emitPreparedArrayComparatorSortCallExpression(expression, receiver, context) {
  const callback = expression.args[0]
  const returnExpression = resolveArrowReturnExpression(callback)

  if (
    callback?.type !== 'ArrowFunctionExpression' ||
    returnExpression == null ||
    callback.params.length > 2 ||
    !['number', 'boolean', 'string'].includes(receiver.elementType)
  ) {
    return null
  }

  const length = nextCName(context, 'ccjs_sort_length')
  const index = nextCName(context, 'ccjs_sort_index')
  const scan = nextCName(context, 'ccjs_sort_scan')
  const left = nextCName(context, 'ccjs_sort_left')
  const right = nextCName(context, 'ccjs_sort_right')
  const compare = nextCName(context, 'ccjs_sort_compare')

  registerOwnedValue(context, left)
  registerOwnedValue(context, right)

  const body = withVariableScope(context, () => {
    const input = emitPreparedArraySortComparatorInput(callback, receiver, left, right, context)
    const result = emitPreparedNumberExpression(returnExpression, context)

    return [
      ...input,
      ...result.lines,
      `double ${compare} = ${result.expression};`,
      `if (!(${compare} > 0)) break;`,
      emitStatusCheck(`ccjs_array_set(${receiver.expression}, ${scan} - 1, ${right})`, context),
      emitStatusCheck(`ccjs_array_set(${receiver.expression}, ${scan}, ${left})`, context)
    ]
  })

  return {
    lines: [
      ...receiver.lines,
      `size_t ${length} = 0;`,
      emitStatusCheck(`ccjs_array_len(${receiver.expression}, &${length})`, context),
      `for (size_t ${index} = 1; ${index} < ${length}; ${index} += 1) {`,
      `  for (size_t ${scan} = ${index}; ${scan} > 0; ${scan} -= 1) {`,
      ...emitPrepareOwnedValueWrite(left).map((line) => `    ${line}`),
      `    ${emitStatusCheck(`ccjs_array_get(${receiver.expression}, ${scan} - 1, &${left})`, context)}`,
      ...emitPrepareOwnedValueWrite(right).map((line) => `    ${line}`),
      `    ${emitStatusCheck(`ccjs_array_get(${receiver.expression}, ${scan}, &${right})`, context)}`,
      ...body.map((line) => `    ${line}`),
      '  }',
      '}',
      ...emitPrepareOwnedValueWrite(right),
      ...emitPrepareOwnedValueWrite(left)
    ],
    expression: receiver.expression,
    elementType: receiver.elementType
  }
}

function emitPreparedArrayMapCallExpression(expression, context) {
  if (
    expression?.type !== 'CallExpression' ||
    expression.callee.type !== 'MemberExpression' ||
    expression.callee.property !== 'map' ||
    expression.args.length !== 1
  ) {
    return null
  }

  const callback = expression.args[0]
  const callbackBody = resolveArrayCallbackBody(callback)

  if (callback?.type !== 'ArrowFunctionExpression' || callbackBody == null || callback.params.length > 2) {
    return null
  }

  const receiver = emitPreparedArrayReceiver(expression.callee.object, context)

  if (receiver == null || !['number', 'boolean', 'string'].includes(receiver.elementType)) {
    return null
  }

  const out = nextCName(context, 'ccjs_map_array')
  const length = nextCName(context, 'ccjs_map_length')
  const index = nextCName(context, 'ccjs_map_index')
  const value = nextCName(context, 'ccjs_map_value')
  let mappedElementType = expression.arrayElementType ?? 'unknown'

  registerOwnedValue(context, out)
  registerOwnedValue(context, value)

  const body = withVariableScope(context, () => {
    const input = emitPreparedArrayCallbackInput(callback, receiver, value, index, context)

    mappedElementType =
      mappedElementType === 'unknown' ? resolveArrayCallbackReturnType(callbackBody, context) : mappedElementType

    if (!['number', 'boolean', 'string'].includes(mappedElementType)) {
      return null
    }

    return [...input, ...emitArrayMapCallbackBodyLines(callbackBody, mappedElementType, out, context)]
  })

  if (body == null) {
    return null
  }

  return {
    lines: [
      ...receiver.lines,
      ...emitPrepareOwnedValueWrite(out),
      emitStatusCheck(`ccjs_array_new(&ccjs_default_allocator, 0, &${out})`, context),
      `size_t ${length} = 0;`,
      emitStatusCheck(`ccjs_array_len(${receiver.expression}, &${length})`, context),
      `for (size_t ${index} = 0; ${index} < ${length}; ${index} += 1) {`,
      ...emitPrepareOwnedValueWrite(value).map((line) => `  ${line}`),
      `  ${emitStatusCheck(`ccjs_array_get(${receiver.expression}, ${index}, &${value})`, context)}`,
      ...body.map((line) => `  ${line}`),
      '}',
      ...emitPrepareOwnedValueWrite(value)
    ],
    expression: out,
    elementType: mappedElementType
  }
}

function emitPreparedArrayFilterCallExpression(expression, context) {
  if (
    expression?.type !== 'CallExpression' ||
    expression.callee.type !== 'MemberExpression' ||
    expression.callee.property !== 'filter' ||
    expression.args.length !== 1
  ) {
    return null
  }

  const callback = expression.args[0]
  const callbackBody = resolveArrayCallbackBody(callback)

  if (callback?.type !== 'ArrowFunctionExpression' || callbackBody == null || callback.params.length > 2) {
    return null
  }

  const receiver = emitPreparedArrayReceiver(expression.callee.object, context)

  if (receiver == null || !['number', 'boolean', 'string'].includes(receiver.elementType)) {
    return null
  }

  const out = nextCName(context, 'ccjs_filter_array')
  const length = nextCName(context, 'ccjs_filter_length')
  const index = nextCName(context, 'ccjs_filter_index')
  const value = nextCName(context, 'ccjs_filter_value')

  registerOwnedValue(context, out)
  registerOwnedValue(context, value)

  const body = withVariableScope(context, () => {
    const input = emitPreparedArrayCallbackInput(callback, receiver, value, index, context)

    return [...input, ...emitArrayFilterCallbackBodyLines(callbackBody, out, value, context)]
  })

  return {
    lines: [
      ...receiver.lines,
      ...emitPrepareOwnedValueWrite(out),
      emitStatusCheck(`ccjs_array_new(&ccjs_default_allocator, 0, &${out})`, context),
      `size_t ${length} = 0;`,
      emitStatusCheck(`ccjs_array_len(${receiver.expression}, &${length})`, context),
      `for (size_t ${index} = 0; ${index} < ${length}; ${index} += 1) {`,
      ...emitPrepareOwnedValueWrite(value).map((line) => `  ${line}`),
      `  ${emitStatusCheck(`ccjs_array_get(${receiver.expression}, ${index}, &${value})`, context)}`,
      ...body.map((line) => `  ${line}`),
      '}',
      ...emitPrepareOwnedValueWrite(value)
    ],
    expression: out,
    elementType: receiver.elementType
  }
}

function resolveArrowReturnExpression(callback) {
  if (callback?.type !== 'ArrowFunctionExpression') {
    return null
  }

  if (callback.expressionBody) {
    return callback.body
  }

  const statements = Array.isArray(callback.body)
    ? callback.body
    : callback.body?.type === 'BlockStatement'
      ? callback.body.body
      : null

  if (statements == null || statements.length !== 1) {
    return null
  }

  const statement = statements[0]

  return statement?.type === 'ReturnStatement' ? (statement.argument ?? null) : null
}

function resolveArrayCallbackBody(callback) {
  const returnExpression = resolveArrowReturnExpression(callback)

  if (returnExpression != null) {
    return {
      kind: 'prepared-return',
      returnExpression
    }
  }

  if (callback?.type !== 'ArrowFunctionExpression' || callback.expressionBody) {
    return null
  }

  const statements = Array.isArray(callback.body)
    ? callback.body
    : callback.body?.type === 'BlockStatement'
      ? callback.body.body
      : null

  if (!canLowerArrayCallbackStatementList(statements)) {
    return null
  }

  return {
    kind: 'statement-list',
    statements
  }
}

function canLowerArrayCallbackStatementList(statements) {
  if (statements == null || statements.length === 0) {
    return false
  }

  return statements.every((statement, index) => {
    if (index === statements.length - 1) {
      return canLowerArrayCallbackTerminalStatement(statement)
    }

    return canLowerArrayCallbackEarlyReturnStatement(statement)
  })
}

function canLowerArrayCallbackTerminalStatement(statement) {
  if (statement?.type === 'ReturnStatement') {
    return statement.argument != null
  }

  if (statement?.type === 'BlockStatement') {
    return canLowerArrayCallbackStatementList(statement.body)
  }

  if (statement?.type !== 'IfStatement' || statement.alternate == null) {
    return false
  }

  return (
    canLowerArrayCallbackTerminalStatement(statement.consequent) &&
    canLowerArrayCallbackTerminalStatement(statement.alternate)
  )
}

function canLowerArrayCallbackReturnStatement(statement) {
  if (statement?.type === 'ReturnStatement') {
    return statement.argument != null
  }

  return false
}

function canLowerArrayCallbackEarlyReturnStatement(statement) {
  if (statement?.type === 'BlockStatement') {
    return canLowerArrayCallbackStatementList(statement.body)
  }

  if (statement?.type !== 'IfStatement') {
    return false
  }

  return (
    canLowerArrayCallbackBranch(statement.consequent) &&
    (statement.alternate == null || canLowerArrayCallbackBranch(statement.alternate))
  )
}

function canLowerArrayCallbackBranch(statement) {
  if (canLowerArrayCallbackReturnStatement(statement)) {
    return true
  }

  if (statement?.type === 'BlockStatement') {
    return canLowerArrayCallbackStatementList(statement.body)
  }

  return canLowerArrayCallbackEarlyReturnStatement(statement)
}

function resolveArrayCallbackReturnType(body, context) {
  const expressions = collectArrayCallbackReturnExpressions(body)
  const firstType = expressions.length === 0 ? 'unknown' : inferExpressionType(expressions[0], context)

  if (firstType === 'unknown') {
    return 'unknown'
  }

  return expressions.every((expression) => inferExpressionType(expression, context) === firstType)
    ? firstType
    : 'unknown'
}

function collectArrayCallbackReturnExpressions(body) {
  if (body.kind === 'prepared-return') {
    return [body.returnExpression]
  }

  const expressions: any[] = []
  const visitStatement = (statement) => {
    if (statement == null) {
      return
    }

    if (statement.type === 'ReturnStatement') {
      expressions.push(statement.argument)
      return
    }

    if (statement.type === 'BlockStatement') {
      statement.body.forEach(visitStatement)
      return
    }

    if (statement.type === 'IfStatement') {
      visitStatement(statement.consequent)
      visitStatement(statement.alternate)
    }
  }

  body.statements.forEach(visitStatement)

  return expressions.filter(Boolean)
}

function emitArrayMapCallbackBodyLines(body, elementType, out, context) {
  const emitReturn = (expression) => emitArrayMapReturnLines(expression, elementType, out, context)

  return emitArrayCallbackBodyLines(body, emitReturn, context)
}

function emitArrayFilterCallbackBodyLines(body, out, value, context) {
  const emitReturn = (expression) => emitArrayFilterReturnLines(expression, out, value, context)

  return emitArrayCallbackBodyLines(body, emitReturn, context)
}

function emitArrayCallbackBodyLines(body, emitReturn, context) {
  if (body.kind === 'prepared-return') {
    return emitReturn(body.returnExpression)
  }

  const doneLabel = nextCName(context, 'ccjs_array_callback_done')

  return [...emitArrayCallbackStatementListLines(body.statements, doneLabel, emitReturn, context), `${doneLabel}:;`]
}

function emitArrayCallbackStatementListLines(statements, doneLabel, emitReturn, context) {
  return statements.flatMap((statement) => emitArrayCallbackStatementLines(statement, doneLabel, emitReturn, context))
}

function emitArrayCallbackStatementLines(statement, doneLabel, emitReturn, context) {
  if (statement?.type === 'ReturnStatement') {
    return [...emitReturn(statement.argument), `goto ${doneLabel};`]
  }

  if (statement?.type === 'BlockStatement') {
    return [
      '{',
      ...emitArrayCallbackStatementListLines(statement.body, doneLabel, emitReturn, context).map((line) => `  ${line}`),
      '}'
    ]
  }

  if (statement?.type !== 'IfStatement') {
    return []
  }

  const condition = emitPreparedNumberExpression(statement.condition, context)
  const consequent = emitArrayCallbackStatementLines(statement.consequent, doneLabel, emitReturn, context)
  const lines = [
    ...condition.lines,
    `if ${emitCConditionClause(condition.expression)} {`,
    ...consequent.map((line) => `  ${line}`),
    '}'
  ]

  if (statement.alternate != null) {
    lines[lines.length - 1] = '} else {'
    lines.push(
      ...emitArrayCallbackStatementLines(statement.alternate, doneLabel, emitReturn, context).map((line) => `  ${line}`)
    )
    lines.push('}')
  }

  return lines
}

function emitArrayMapReturnLines(expression, elementType, out, context) {
  const mappedValue = emitPreparedArrayMapValue(expression, elementType, context)

  return [...mappedValue.lines, emitStatusCheck(`ccjs_array_push(${out}, ${mappedValue.expression})`, context)]
}

function emitArrayFilterReturnLines(expression, out, value, context) {
  const predicate = emitPreparedNumberExpression(expression, context)

  return [
    ...predicate.lines,
    `if ${emitCConditionClause(predicate.expression)} {`,
    `  ${emitStatusCheck(`ccjs_array_push(${out}, ${value})`, context)}`,
    '}'
  ]
}

function resolvePromiseChainArrowBody(callback) {
  if (callback?.type !== 'ArrowFunctionExpression') {
    return null
  }

  if (callback.expressionBody) {
    return {
      kind: 'prepared-return',
      prefixStatements: [],
      returnExpression: callback.body
    }
  }

  const statements = Array.isArray(callback.body)
    ? callback.body
    : callback.body?.type === 'BlockStatement'
      ? callback.body.body
      : null

  if (statements == null || statements.length === 0) {
    return null
  }

  const returnStatement = statements.at(-1)

  if (returnStatement?.type !== 'ReturnStatement') {
    return null
  }

  const prefixStatements = statements.slice(0, -1)

  if (prefixStatements.every(isStraightLinePromiseCallbackStatement)) {
    return {
      kind: 'prepared-return',
      prefixStatements,
      returnExpression: returnStatement.argument ?? null
    }
  }

  if (!statements.every(isPromiseChainCallbackStatement)) {
    return null
  }

  return {
    kind: 'statement-list',
    statements
  }
}

function isStraightLinePromiseCallbackStatement(statement) {
  return statement?.type === 'VariableDeclaration' || statement?.type === 'ExpressionStatement'
}

function isPromiseChainCallbackStatement(statement) {
  if (statement == null) {
    return false
  }

  if (
    isStraightLinePromiseCallbackStatement(statement) ||
    statement.type === 'ReturnStatement' ||
    statement.type === 'ThrowStatement' ||
    statement.type === 'BreakStatement' ||
    statement.type === 'ContinueStatement'
  ) {
    return true
  }

  if (statement.type === 'BlockStatement') {
    return statement.body.every(isPromiseChainCallbackStatement)
  }

  if (statement.type === 'WhileStatement' || statement.type === 'ForStatement') {
    return isPromiseChainCallbackStatement(statement.body)
  }

  if (statement.type === 'SwitchStatement') {
    return isPromiseChainCallbackSwitchStatement(statement)
  }

  if (statement.type === 'TryStatement') {
    return (
      isPromiseChainCallbackStatement(statement.block) &&
      (statement.handler == null || isPromiseChainCallbackStatement(statement.handler.body)) &&
      (statement.finalizer == null || isPromiseChainCallbackStatement(statement.finalizer))
    )
  }

  if (statement.type !== 'IfStatement') {
    return false
  }

  return (
    isPromiseChainCallbackStatement(statement.consequent) &&
    (statement.alternate == null || isPromiseChainCallbackStatement(statement.alternate))
  )
}

function isPromiseChainCallbackSwitchStatement(statement) {
  return statement.cases.every((item) => item.consequent.every(isPromiseChainCallbackStatement))
}

function emitPreparedArrayCallbackInput(callback, receiver, value, index, context) {
  const lines: string[] = []
  const valueParam = callback.params[0]
  const indexParam = callback.params[1]

  if (valueParam != null) {
    context.variables.set(valueParam.name, receiver.elementType)

    if (receiver.elementType === 'string') {
      context.runtimeStrings.add(valueParam.name)
      lines.push(emitRuntimeTypeCheck(`${value}.tag != CCJS_TAG_STRING || ${value}.as.ref == 0`, context))
      lines.push(`ccjs_string* ${valueParam.name} = (ccjs_string*)${value}.as.ref;`)
    } else if (receiver.elementType === 'boolean') {
      lines.push(emitRuntimeTypeCheck(`${value}.tag != CCJS_TAG_BOOL`, context))
      lines.push(`double ${valueParam.name} = (${value}.as.boolean ? 1 : 0);`)
    } else {
      lines.push(emitRuntimeTypeCheck(`${value}.tag != CCJS_TAG_NUMBER`, context))
      lines.push(`double ${valueParam.name} = ${value}.as.number;`)
    }
  }

  if (indexParam != null) {
    context.variables.set(indexParam.name, 'number')
    lines.push(`double ${indexParam.name} = (double)${index};`)
  }

  return lines
}

function updatePushedArrayMetadata(receiver, valueType, context) {
  if (receiver?.type !== 'Reference' || receiver.path.length !== 1 || valueType === 'unknown') {
    return
  }

  const name = receiver.path[0]
  const elements = context.arrayShapes.get(name)

  if (elements == null) {
    if (context.variables.get(name) === 'array') {
      context.runtimeArrayElementTypes.set(name, context.runtimeArrayElementTypes.get(name) ?? valueType)
    }

    return
  }

  const nextElements = [...elements, { valueType }]
  const elementType = resolveForOfElementType(nextElements)

  if (elementType === 'unknown') {
    context.arrayShapes.delete(name)
    context.runtimeArrayElementTypes.set(name, 'unknown')
    return
  }

  context.arrayShapes.set(name, nextElements)
}

function updatePoppedArrayMetadata(receiver, context) {
  if (receiver?.type !== 'Reference' || receiver.path.length !== 1) {
    return
  }

  const name = receiver.path[0]
  const elements = context.arrayShapes.get(name)

  if (elements == null) {
    return
  }

  context.arrayShapes.set(name, elements.slice(0, -1))
}

function emitPreparedArrayMapValue(expression, valueType, context) {
  if (valueType === 'string') {
    return emitCValueExpression(expression, context)
  }

  const value = emitPreparedNumberExpression(expression, context)

  return {
    lines: value.lines,
    expression:
      valueType === 'boolean' ? `ccjs_bool_value((${value.expression}) != 0)` : `ccjs_number_value(${value.expression})`
  }
}

function emitPreparedArraySortComparatorInput(callback, receiver, left, right, context) {
  const lines: string[] = []
  const leftParam = callback.params[0]
  const rightParam = callback.params[1]

  if (leftParam != null) {
    lines.push(...emitPreparedArraySortComparatorParam(leftParam.name, receiver.elementType, left, context))
  }

  if (rightParam != null) {
    lines.push(...emitPreparedArraySortComparatorParam(rightParam.name, receiver.elementType, right, context))
  }

  return lines
}

function emitPreparedArraySortComparatorParam(name, elementType, value, context) {
  context.variables.set(name, elementType)

  if (elementType === 'string') {
    context.runtimeStrings.add(name)
    return [
      emitRuntimeTypeCheck(`${value}.tag != CCJS_TAG_STRING || ${value}.as.ref == 0`, context),
      `ccjs_string* ${name} = (ccjs_string*)${value}.as.ref;`
    ]
  }

  if (elementType === 'boolean') {
    return [
      emitRuntimeTypeCheck(`${value}.tag != CCJS_TAG_BOOL`, context),
      `double ${name} = (${value}.as.boolean ? 1 : 0);`
    ]
  }

  return [emitRuntimeTypeCheck(`${value}.tag != CCJS_TAG_NUMBER`, context), `double ${name} = ${value}.as.number;`]
}

function emitPreparedArrayReceiver(expression, context) {
  if (expression?.type === 'ArrayLiteral') {
    const value = emitCArrayLiteralValueExpression(expression, context)

    return {
      lines: value.lines,
      expression: value.expression,
      elementType: resolveForOfElementType(
        expression.elements.map((element) => ({
          valueType: inferExpressionType(element, context)
        }))
      )
    }
  }

  if (expression?.type === 'Reference' && expression.path.length === 1) {
    const name = expression.path[0]

    if (context.variables.get(name) !== 'array') {
      return null
    }

    return {
      lines: [],
      expression: name,
      elementType:
        context.runtimeArrayElementTypes.get(name) ?? resolveForOfElementType(context.arrayShapes.get(name) ?? [])
    }
  }

  if (expression?.type === 'MemberExpression' || expression?.type === 'IndexExpression') {
    const valueType = inferExpressionType(expression, context)

    if (valueType !== 'array') {
      return null
    }

    const value = emitCValueExpression(expression, context)

    return {
      lines: value.lines,
      expression: value.expression,
      elementType: resolveRuntimeArrayElementType(expression, context) ?? expression.arrayElementType ?? 'unknown'
    }
  }

  if (expression?.type === 'CallExpression') {
    const valueType = inferExpressionType(expression, context)

    if (valueType !== 'array') {
      return null
    }

    const call =
      emitPreparedArrayMapCallExpression(expression, context) ??
      emitPreparedArrayFilterCallExpression(expression, context) ??
      emitPreparedArraySortCallExpression(expression, context) ??
      emitCStringSplitValueExpression(expression, context)

    return call == null
      ? null
      : {
          lines: call.lines,
          expression: call.expression,
          elementType: call.elementType
        }
  }

  return null
}

function isCollectionConstructorExpression(expression) {
  return collectionConstructorName(expression) != null
}

function collectionConstructorName(expression) {
  if (
    expression?.type !== 'NewExpression' ||
    expression.callee.type !== 'Reference' ||
    expression.callee.path.length !== 1
  ) {
    return null
  }

  return ['Map', 'Set'].includes(expression.callee.path[0]) ? expression.callee.path[0] : null
}

function emitPreparedCollectionCallExpression(expression, context) {
  if (expression?.type !== 'CallExpression' || expression.callee.type !== 'MemberExpression') {
    return null
  }

  const receiver = emitPreparedCollectionReceiver(expression.callee.object, context)

  if (receiver == null) {
    return null
  }

  const call =
    receiver.type === 'map'
      ? emitPreparedMapMethodCall(receiver.expression, expression, context)
      : emitPreparedSetMethodCall(receiver.expression, expression, context)

  return {
    lines: [...receiver.lines, ...call.lines],
    expression: call.expression
  }
}

function emitPreparedCollectionReceiver(expression, context) {
  if (expression?.type === 'Reference' && expression.path.length === 1) {
    const name = expression.path[0]
    const type = context.variables.get(name)

    return type === 'map' || type === 'set'
      ? {
          type,
          lines: [],
          expression: name
        }
      : null
  }

  if (expression?.type === 'CallExpression') {
    const valueType = inferExpressionType(expression, context)

    if (valueType !== 'map' && valueType !== 'set') {
      return null
    }

    const call = emitPreparedCollectionCallExpression(expression, context)

    if (call != null && call.expression !== '') {
      return {
        type: valueType,
        lines: call.lines,
        expression: call.expression
      }
    }

    const value = emitCValueExpression(expression, context)

    return {
      type: valueType,
      lines: value.lines,
      expression: value.expression
    }
  }

  if (isMemberAccessExpression(expression) || isIndexAccessExpression(expression)) {
    const valueType = inferExpressionType(expression, context)

    if (valueType !== 'map' && valueType !== 'set') {
      return null
    }

    const value = emitCValueExpression(expression, context)

    return {
      type: valueType,
      lines: value.lines,
      expression: value.expression
    }
  }

  return null
}

function emitPreparedMapMethodCall(name, expression, context) {
  const method = expression.callee.property

  if (method === 'clear') {
    return {
      lines: [emitStatusCheck(`ccjs_map_clear(${name})`, context)],
      expression: ''
    }
  }

  if (method === 'set') {
    reportCCollectionHashability(
      inferExpressionType(expression.args[0], context),
      'Map keys',
      expression.args[0]?.loc ?? expression.loc,
      context
    )
    const key = emitCValueExpression(expression.args[0], context)
    const value = emitCValueExpression(expression.args[1], context)

    return {
      lines: [
        ...key.lines,
        ...value.lines,
        emitStatusCheck(`ccjs_map_set(${name}, ${key.expression}, ${value.expression})`, context)
      ],
      expression: name
    }
  }

  if (method === 'get') {
    reportCCollectionHashability(
      inferExpressionType(expression.args[0], context),
      'Map keys',
      expression.args[0]?.loc ?? expression.loc,
      context
    )
    const key = emitCValueExpression(expression.args[0], context)
    const valueType = inferExpressionType(expression, context)
    const expectedTag = cRuntimeValueTag(valueType)
    const out = nextCName(context, 'ccjs_map_value')
    registerOwnedValue(context, out)

    const lines = [
      ...key.lines,
      ...emitPrepareOwnedValueWrite(out),
      emitStatusCheck(`ccjs_map_get(${name}, ${key.expression}, &${out})`, context),
      ...emitRuntimeNullableValueCheck(out, expectedTag, context)
    ]

    return {
      lines,
      expression: out
    }
  }

  if (method === 'has' || method === 'delete') {
    reportCCollectionHashability(
      inferExpressionType(expression.args[0], context),
      'Map keys',
      expression.args[0]?.loc ?? expression.loc,
      context
    )
    const key = emitCValueExpression(expression.args[0], context)
    const out = nextCName(context, `ccjs_map_${method}`)
    const helper = method === 'has' ? 'ccjs_map_has' : 'ccjs_map_delete'

    return {
      lines: [
        ...key.lines,
        `bool ${out} = false;`,
        emitStatusCheck(`${helper}(${name}, ${key.expression}, &${out})`, context)
      ],
      expression: `(${out} ? 1 : 0)`
    }
  }

  context.diagnostics.push(
    diagnostic('CCJS_C_COLLECTION', `Map.${method} is not supported by the current C backend slice`, expression.loc)
  )

  return {
    lines: [],
    expression: '0'
  }
}

function emitPreparedMapIndexGetExpression(expression, context) {
  const mapIndex = emitPreparedMapIndexReceiver(expression, context)

  if (mapIndex == null) {
    return null
  }

  reportCCollectionHashability(
    inferExpressionType(mapIndex.key, context),
    'Map keys',
    mapIndex.key.loc ?? expression.loc,
    context
  )
  const key = emitCValueExpression(mapIndex.key, context)
  const valueType = inferExpressionType(expression, context)
  const expectedTag = cRuntimeValueTag(valueType)
  const out = nextCName(context, 'ccjs_map_value')
  registerOwnedValue(context, out)

  return {
    lines: [
      ...mapIndex.receiver.lines,
      ...key.lines,
      ...emitPrepareOwnedValueWrite(out),
      emitStatusCheck(`ccjs_map_get(${mapIndex.receiver.expression}, ${key.expression}, &${out})`, context),
      ...emitRuntimeNullableValueCheck(out, expectedTag, context)
    ],
    expression: out
  }
}

function emitPreparedMapIndexAssignment(expression, context) {
  if (expression?.type !== 'AssignmentExpression') {
    return null
  }

  const mapIndex = emitPreparedMapIndexReceiver(expression.target, context)

  if (mapIndex == null) {
    return null
  }

  reportCCollectionHashability(
    inferExpressionType(mapIndex.key, context),
    'Map keys',
    mapIndex.key.loc ?? expression.target.loc,
    context
  )
  const key = emitCValueExpression(mapIndex.key, context)
  const value = emitCValueExpression(expression.value, context)

  return {
    lines: [
      ...mapIndex.receiver.lines,
      ...key.lines,
      ...value.lines,
      emitStatusCheck(`ccjs_map_set(${mapIndex.receiver.expression}, ${key.expression}, ${value.expression})`, context)
    ],
    expression: ''
  }
}

function emitPreparedMapIndexReceiver(expression, context) {
  if (expression?.type !== 'IndexExpression' || expression.collectionKind !== 'map') {
    return null
  }

  const receiver = emitPreparedCollectionReceiver(expression.object, context)

  if (receiver == null || receiver.type !== 'map') {
    return null
  }

  return {
    receiver,
    key: expression.index
  }
}

function emitPreparedSetMethodCall(name, expression, context) {
  const method = expression.callee.property

  if (method === 'clear') {
    return {
      lines: [emitStatusCheck(`ccjs_set_clear(${name})`, context)],
      expression: ''
    }
  }

  if (method === 'add') {
    reportCCollectionHashability(
      inferExpressionType(expression.args[0], context),
      'Set values',
      expression.args[0]?.loc ?? expression.loc,
      context
    )
    const value = emitCValueExpression(expression.args[0], context)

    return {
      lines: [...value.lines, emitStatusCheck(`ccjs_set_add(${name}, ${value.expression})`, context)],
      expression: name
    }
  }

  if (method === 'has' || method === 'delete') {
    reportCCollectionHashability(
      inferExpressionType(expression.args[0], context),
      'Set values',
      expression.args[0]?.loc ?? expression.loc,
      context
    )
    const value = emitCValueExpression(expression.args[0], context)
    const out = nextCName(context, `ccjs_set_${method}`)
    const helper = method === 'has' ? 'ccjs_set_has' : 'ccjs_set_delete'

    return {
      lines: [
        ...value.lines,
        `bool ${out} = false;`,
        emitStatusCheck(`${helper}(${name}, ${value.expression}, &${out})`, context)
      ],
      expression: `(${out} ? 1 : 0)`
    }
  }

  context.diagnostics.push(
    diagnostic('CCJS_C_COLLECTION', `Set.${method} is not supported by the current C backend slice`, expression.loc)
  )

  return {
    lines: [],
    expression: '0'
  }
}

function emitPreparedCollectionSizeExpression(expression, context) {
  if (expression?.type !== 'MemberExpression' || expression.property !== 'size') {
    return null
  }

  const receiver = emitPreparedCollectionReceiver(expression.object, context)

  if (receiver == null) {
    return null
  }

  const out = nextCName(context, `ccjs_${receiver.type}_size`)
  const helper = receiver.type === 'map' ? 'ccjs_map_size' : 'ccjs_set_size'

  return {
    lines: [
      ...receiver.lines,
      `size_t ${out} = 0;`,
      emitStatusCheck(`${helper}(${receiver.expression}, &${out})`, context)
    ],
    expression: out
  }
}

function cStringPredicateHelperName(method) {
  if (method === 'startsWith') {
    return 'ccjs_string_starts_with_parts'
  }

  if (method === 'endsWith') {
    return 'ccjs_string_ends_with_parts'
  }

  return 'ccjs_string_includes_parts'
}

function isStringLengthObject(expression, context) {
  if (expression == null) {
    return false
  }

  if (expression.type === 'StringLiteral') {
    return true
  }

  if (expression.type === 'TemplateLiteral') {
    return true
  }

  if (expression.type === 'Reference' && expression.path.length === 1) {
    const name = expression.path[0]

    return context.variables.get(name) === 'string' || context.runtimeStrings.has(name)
  }

  return inferExpressionType(expression, context) === 'string'
}

function isArrayLengthExpression(expression, context) {
  return (
    expression?.type === 'MemberExpression' &&
    expression.property === 'length' &&
    inferExpressionType(expression.object, context) === 'array'
  )
}

function isMemberAccessExpression(expression) {
  return expression?.type === 'MemberExpression' || expression?.type === 'OptionalMemberExpression'
}

function isIndexAccessExpression(expression) {
  return expression?.type === 'IndexExpression' || expression?.type === 'OptionalIndexExpression'
}

function resolveKnownObjectMember(expression, context) {
  if (!isMemberAccessExpression(expression)) {
    return null
  }

  const objectName = resolveCObjectExpressionName(expression.object)

  if (objectName == null) {
    return null
  }

  const fields = context.objectShapes.get(objectName)

  if (fields == null) {
    return null
  }

  const index = fields.findIndex((field) => field.name === expression.property)

  if (index === -1) {
    return null
  }

  return {
    objectName,
    index,
    valueType: fields[index].valueType,
    arrayElementType: fields[index].arrayElementType,
    mapKeyType: fields[index].mapKeyType,
    mapValueType: fields[index].mapValueType,
    setElementType: fields[index].setElementType
  }
}

function emitObjectValueReference(name, context) {
  return context.boxedVariables.has(name) && context.variables.get(name) === 'object' ? `(*${name})` : name
}

function resolveKnownObjectIndex(expression, context) {
  if (!isIndexAccessExpression(expression) || expression.index.type !== 'StringLiteral') {
    return null
  }

  const objectName = resolveCObjectExpressionName(expression.object)

  if (objectName == null) {
    return null
  }

  const fields = context.objectShapes.get(objectName)

  if (fields == null) {
    return null
  }

  const index = fields.findIndex((field) => field.name === expression.index.value)

  if (index === -1) {
    return null
  }

  return {
    objectName,
    key: expression.index.value,
    index,
    valueType: fields[index].valueType,
    arrayElementType: fields[index].arrayElementType,
    mapKeyType: fields[index].mapKeyType,
    mapValueType: fields[index].mapValueType,
    setElementType: fields[index].setElementType
  }
}

function resolveCObjectExpressionName(expression) {
  if (expression?.type === 'Reference' && expression.path.length === 1) {
    return expression.path[0]
  }

  if (expression?.type === 'ThisExpression') {
    return 'this'
  }

  return null
}

function updateKnownObjectMemberValueType(member, valueType, context) {
  if (valueType === 'unknown') {
    return
  }

  const fields = context.objectShapes.get(member.objectName)

  if (fields == null || fields[member.index] == null) {
    return
  }

  fields[member.index] = {
    ...fields[member.index],
    valueType
  }
}

function registerObjectShape(context, name, shape) {
  if (shape?.fields == null) {
    return
  }

  context.objectShapes.set(
    name,
    shape.fields.map((field) => ({
      name: field.name,
      valueType: field.valueType,
      arrayElementType: field.arrayElementType,
      mapKeyType: field.mapKeyType,
      mapValueType: field.mapValueType,
      setElementType: field.setElementType
    }))
  )
}

function resolveKnownArrayIndex(expression, context) {
  if (
    expression?.type !== 'IndexExpression' ||
    expression.object.type !== 'Reference' ||
    expression.object.path.length !== 1 ||
    expression.index.type !== 'NumberLiteral'
  ) {
    return null
  }

  const arrayName = expression.object.path[0]
  const elements = context.arrayShapes.get(arrayName)

  if (elements == null) {
    return null
  }

  const index = Number.parseInt(expression.index.value, 10)

  if (!Number.isInteger(index) || index < 0 || index >= elements.length) {
    return null
  }

  return {
    arrayName,
    index,
    valueType: elements[index].valueType
  }
}

function resolveRuntimeArrayIndex(expression, context) {
  if (expression?.type !== 'IndexExpression' || expression.index.type !== 'NumberLiteral') {
    return null
  }

  const index = Number.parseInt(expression.index.value, 10)

  if (!Number.isInteger(index) || index < 0) {
    return null
  }

  const valueType = resolveRuntimeArrayElementType(expression.object, context)

  return valueType == null
    ? null
    : {
        index,
        valueType
      }
}

function resolveOptionalRuntimeArrayIndex(expression, context) {
  if (expression?.type !== 'OptionalIndexExpression' || expression.index.type !== 'NumberLiteral') {
    return null
  }

  const index = Number.parseInt(expression.index.value, 10)

  if (!Number.isInteger(index) || index < 0) {
    return null
  }

  const valueType = resolveRuntimeArrayElementType(expression.object, context)

  return valueType == null
    ? null
    : {
        index,
        valueType
      }
}

function resolveRuntimeArrayElementType(expression, context) {
  if (expression?.type === 'Reference' && expression.path.length === 1) {
    return context.runtimeArrayElementTypes.get(expression.path[0]) ?? null
  }

  if (expression?.type === 'CallExpression') {
    const functionReturn = resolveFunctionReturnNameFromCall(expression)

    return expression.valueType === 'array'
      ? (expression.arrayElementType ??
          (functionReturn == null ? null : context.functionReturnArrayElementTypes.get(functionReturn)) ??
          'unknown')
      : null
  }

  if (expression?.type === 'MemberExpression') {
    const member = resolveKnownObjectMember(expression, context)

    return member?.valueType === 'array' ? (member.arrayElementType ?? 'unknown') : null
  }

  if (expression?.type === 'IndexExpression' && expression.index.type === 'StringLiteral') {
    const field = resolveKnownObjectIndex(expression, context)

    return field?.valueType === 'array' ? (field.arrayElementType ?? 'unknown') : null
  }

  return null
}

function resolveRuntimeSetElementType(expression, context) {
  if (expression?.type === 'Reference' && expression.path.length === 1) {
    return context.setElementTypes.get(expression.path[0]) ?? null
  }

  if (expression?.type === 'CallExpression' || expression?.type === 'NewExpression') {
    const functionReturn = expression.type === 'CallExpression' ? resolveFunctionReturnNameFromCall(expression) : null

    return expression.valueType === 'set'
      ? (expression.setElementType ??
          (functionReturn == null ? null : context.functionReturnSetElementTypes.get(functionReturn)) ??
          'unknown')
      : null
  }

  if (expression?.type === 'MemberExpression') {
    const member = resolveKnownObjectMember(expression, context)

    return member?.valueType === 'set' ? (member.setElementType ?? 'unknown') : null
  }

  if (expression?.type === 'IndexExpression' && expression.index.type === 'StringLiteral') {
    const field = resolveKnownObjectIndex(expression, context)

    return field?.valueType === 'set' ? (field.setElementType ?? 'unknown') : null
  }

  return null
}

function resolveRuntimeMapType(expression, context) {
  if (expression?.type === 'Reference' && expression.path.length === 1) {
    return context.mapTypes.get(expression.path[0]) ?? null
  }

  if (expression?.type === 'CallExpression' || expression?.type === 'NewExpression') {
    const functionReturn = expression.type === 'CallExpression' ? resolveFunctionReturnNameFromCall(expression) : null
    const functionReturnMap =
      functionReturn == null ? null : (context.functionReturnMapTypes.get(functionReturn) ?? null)

    return expression.valueType === 'map'
      ? {
          key: expression.mapKeyType ?? functionReturnMap?.key ?? 'unknown',
          value: expression.mapValueType ?? functionReturnMap?.value ?? 'unknown'
        }
      : null
  }

  if (expression?.type === 'MemberExpression') {
    const member = resolveKnownObjectMember(expression, context)

    return member?.valueType === 'map'
      ? {
          key: member.mapKeyType ?? 'unknown',
          value: member.mapValueType ?? 'unknown'
        }
      : null
  }

  if (expression?.type === 'IndexExpression' && expression.index.type === 'StringLiteral') {
    const field = resolveKnownObjectIndex(expression, context)

    return field?.valueType === 'map'
      ? {
          key: field.mapKeyType ?? 'unknown',
          value: field.mapValueType ?? 'unknown'
        }
      : null
  }

  return null
}

function resolveFunctionReturnNameFromCall(expression) {
  return expression?.type === 'CallExpression' &&
    expression.callee.type === 'Reference' &&
    expression.callee.path.length === 1
    ? expression.callee.path[0]
    : null
}

function emitPreparedRuntimeArrayIndexValue(expression, element, context, prefix = 'ccjs_array_item') {
  const array = emitCValueExpression(expression.object, context)
  const value = nextCName(context, prefix)
  registerOwnedValue(context, value)

  return {
    lines: [
      ...array.lines,
      ...emitPrepareOwnedValueWrite(value),
      emitStatusCheck(`ccjs_array_get(${array.expression}, ${element.index}, &${value})`, context)
    ],
    expression: value
  }
}

function resolveKnownArrayLength(expression, context) {
  if (expression?.type !== 'MemberExpression' || expression.property !== 'length') {
    return null
  }

  if (expression.object.type === 'ArrayLiteral') {
    return `${expression.object.elements.length}`
  }

  if (expression.object.type !== 'Reference' || expression.object.path.length !== 1) {
    return null
  }

  const elements = context.arrayShapes.get(expression.object.path[0])

  return elements == null ? null : `${elements.length}`
}

function emitPreparedArrayLengthExpression(expression, context) {
  if (expression?.type !== 'MemberExpression' || expression.property !== 'length') {
    return null
  }

  const knownLength = resolveKnownArrayLength(expression, context)

  if (knownLength != null) {
    return {
      lines: [],
      expression: knownLength
    }
  }

  if (inferExpressionType(expression.object, context) !== 'array') {
    return null
  }

  const value = emitCValueExpression(expression.object, context)
  const temp = nextCName(context, 'ccjs_array_len')

  return {
    lines: [
      ...value.lines,
      `size_t ${temp} = 0;`,
      emitStatusCheck(`ccjs_array_len(${value.expression}, &${temp})`, context)
    ],
    expression: temp
  }
}

function resolveKnownForOfArray(expression, context) {
  if (expression?.type !== 'Reference' || expression.path.length !== 1) {
    return null
  }

  const name = expression.path[0]
  const elements = context.arrayShapes.get(name)

  return elements == null
    ? null
    : {
        name,
        elements
      }
}

function resolveRuntimeForOfArray(expression, context) {
  const elementType = resolveRuntimeArrayElementType(expression, context)

  if (elementType == null) {
    return null
  }

  if (expression?.type === 'Reference' && expression.path.length === 1) {
    return {
      name: expression.path[0],
      elementType,
      lines: []
    }
  }

  const value = emitCValueExpression(expression, context)

  return {
    name: value.expression,
    elementType,
    lines: value.lines
  }
}

function resolveRuntimeForOfSet(expression, context) {
  const elementType = resolveRuntimeSetElementType(expression, context)

  if (elementType == null) {
    return null
  }

  const receiver = emitPreparedCollectionReceiver(expression, context)

  if (receiver == null || receiver.type !== 'set') {
    return null
  }

  return {
    name: receiver.expression,
    elementType,
    lines: receiver.lines
  }
}

function resolveRuntimeForOfMap(expression, context) {
  const mapType = resolveRuntimeMapType(expression, context)

  if (mapType == null) {
    return null
  }

  const receiver = emitPreparedCollectionReceiver(expression, context)

  if (receiver == null || receiver.type !== 'map') {
    return null
  }

  return {
    name: receiver.expression,
    keyType: mapType.key,
    valueType: mapType.value,
    lines: receiver.lines
  }
}

function resolveForOfElementType(elements) {
  if (elements.length === 0) {
    return 'unknown'
  }

  const [first] = elements

  if (first?.valueType == null || first.valueType === 'unknown') {
    return 'unknown'
  }

  return elements.every((element) => element.valueType === first.valueType) ? first.valueType : 'unknown'
}

function updateKnownArrayElementValueType(element, valueType, context) {
  if (valueType === 'unknown') {
    return
  }

  const elements = context.arrayShapes.get(element.arrayName)

  if (elements == null || elements[element.index] == null) {
    return
  }

  elements[element.index] = {
    ...elements[element.index],
    valueType
  }
}

function usesCJsGlobal(expression, context) {
  const root = rootReferenceName(expression)

  return root != null && isCJsGlobalRoot(root, context)
}

function cTimeRuntimeCallName(callee) {
  if (callee?.type !== 'MemberExpression' || callee.object.type !== 'Reference' || callee.object.path.length !== 1) {
    return null
  }

  if (callee.object.path[0] === 'Date' && callee.property === 'now') {
    return 'ccjs_date_now'
  }

  if (callee.object.path[0] === 'performance' && callee.property === 'now') {
    return 'ccjs_performance_now'
  }

  return null
}

function isBytesSliceCall(expression, context) {
  return (
    isBinaryRuntimeCall(expression) &&
    expression.binaryRuntimeMethod === 'slice' &&
    inferExpressionType(expression.callee.object, context) === 'bytes'
  )
}

function isBytesToStringCall(expression, context) {
  return (
    isBinaryRuntimeCall(expression) &&
    expression.binaryRuntimeMethod === 'toString' &&
    inferExpressionType(expression.callee.object, context) === 'bytes'
  )
}

function isPromiseMethodCallExpression(expression, context) {
  return (
    expression?.type === 'CallExpression' &&
    expression.callee?.type === 'MemberExpression' &&
    ['catch', 'then'].includes(expression.callee.property) &&
    inferExpressionType(expression.callee.object, context) === 'promise'
  )
}

function isCJsGlobalRoot(name, context) {
  return context.jsGlobalRoots.has(name)
}

function rootReferenceName(expression) {
  if (expression?.type === 'Reference') {
    return expression.path[0]
  }

  if (expression?.type === 'MemberExpression' || expression?.type === 'OptionalMemberExpression') {
    return rootReferenceName(expression.object)
  }

  if (expression?.type === 'IndexExpression' || expression?.type === 'OptionalIndexExpression') {
    return rootReferenceName(expression.object)
  }

  return null
}

function isCStringRuntimeMethodName(name) {
  return name === 'trim' || name === 'slice' || name === 'split' || cStringPredicateMethods.has(name)
}
