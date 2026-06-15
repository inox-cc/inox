import {
  collectIrFunctionDeclarations,
  collectIrFunctionNodeEntries,
  collectIrGlobalRoots,
  collectIrGlobalUsages,
  collectIrRuntimeRequirements,
  collectIrStoredFunctionEffects,
  collectIrSyntaxFeatureUsages,
  collectIrTopLevelNodes
} from '../ir.ts'
import type { AnyNode, Diagnostic, IrFunctionDeclaration, IrFunctionEffect } from '../types.ts'
import {
  collectCallbackWrappers,
  emitPlainArrowCallbackWrapperDeclaration,
  emitPlainArrowCallbackWrapperHead,
  emitRuntimeArrowCallbackContextType,
  emitRuntimeCallbackWrapperDeclaration,
  emitRuntimeCallbackWrapperHead,
  isPromiseChainCallbackWrapperWithContext,
  isRuntimeArrowCallbackWrapperWithContext,
  isRuntimeCallbackWrapper,
  type CallbackLoweringDependencies
} from './async/callbacks.ts'
import {
  collectPromiseChainWrappers,
  emitPromiseChainCallbackWrapperDeclaration,
  emitPromiseChainCallbackWrapperHead,
  type PromiseChainLoweringDependencies
} from './async/promises.ts'
import {
  collectAsyncTaskWrappers,
  emitAsyncTaskFrameType,
  emitAsyncTaskWrapperDeclaration,
  emitAsyncTaskWrapperPrototypes,
  type AsyncTaskLoweringDependencies
} from './async/tasks.ts'
import {
  createFunctionContext,
  emitBoxedValueCleanup,
  emitBoxedValueDeclarations,
  emitErrorChannelDeclarations,
  emitEventLoopCleanup,
  emitEventLoopDeclarations,
  emitEventLoopDrain,
  emitEventLoopInit,
  emitLoopFlowDeclarations,
  emitOwnedPromiseCleanup,
  emitOwnedPromiseDeclarations,
  emitOwnedValueCleanup,
  emitOwnedValueDeclarations,
  emitReturnFlowDeclarations,
  emitReturnValueDeclarations,
  shouldEmitCleanupLabel,
  type CEmitContext,
  type CFunctionContext
} from './context.ts'
import { reportUnsupportedCGlobalUsages, reportUnsupportedCSyntaxFeatures } from './diagnostics.ts'
import { emitCFunctionName } from './identifiers.ts'
import { relativeCIncludePath, uniqueCModuleImports } from './modules.ts'
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
  emitDgramMessageHandlerHead,
  type DgramLoweringDependencies
} from './stdlib/dgram.ts'
import {
  collectHttpHandlers,
  emitHttpHandlerDeclaration,
  emitHttpHandlerHead,
  type HttpLoweringDependencies
} from './stdlib/http.ts'
import {
  collectNetHandlers,
  emitNetHandlerDeclaration,
  emitNetHandlerHead,
  type NetLoweringDependencies
} from './stdlib/net.ts'
import type { CModuleEmitOptions, CModulePlan } from './types.ts'
import { isManagedRuntimeReturnType } from './value-types.ts'
import { collectClassMethods, createClassInfos } from './values/classes.ts'

export type CModuleEmissionDependencies = {
  asyncTaskLoweringDependencies: AsyncTaskLoweringDependencies
  callbackLoweringDependencies: CallbackLoweringDependencies
  collectExternalEventLoopFunctions: (functions: AnyNode[]) => Set<any>
  createBaseContext: (
    diagnostics: Diagnostic[],
    functionDeclarations: IrFunctionDeclaration[],
    functionEffects: IrFunctionEffect[],
    jsGlobalRoots: Set<string>
  ) => CEmitContext
  dgramLoweringDependencies: DgramLoweringDependencies
  emitClassMethodDeclaration: (info: any, method: any, baseContext: CEmitContext) => string[]
  emitClassMethodHead: (info: any, method: any, context: CEmitContext) => string
  emitFunctionDeclaration: (statement: AnyNode, baseContext: CEmitContext) => string[]
  emitFunctionHead: (statement: AnyNode, context: CEmitContext) => string
  emitMainReturnExpression: (context: CFunctionContext) => string
  emitStatementList: (body: AnyNode[], context: CFunctionContext) => string[]
  httpLoweringDependencies: HttpLoweringDependencies
  netLoweringDependencies: NetLoweringDependencies
  promiseChainLoweringDependencies: PromiseChainLoweringDependencies
}

export function emitCModuleSource(
  plan: CModulePlan,
  plans: CModulePlan[],
  options: CModuleEmitOptions,
  diagnostics: Diagnostic[],
  deps: CModuleEmissionDependencies
): string {
  const irPrograms = [plan.ir]
  const functionEntries = collectIrFunctionNodeEntries(irPrograms)
  const functions = functionEntries.map((entry) => entry.node)
  const context = createCModuleBaseContext(plan, plans, diagnostics, deps)
  const runtimeRequirements = new Set(collectIrRuntimeRequirements(irPrograms))
  const globalUsages = collectIrGlobalUsages(irPrograms)
  const syntaxFeatures = collectIrSyntaxFeatureUsages(irPrograms)
  const signatureRuntimeTypes = collectCModuleContextRuntimeTypes(context)
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
    classInfoCount: context.classInfos.size,
    cryptoContext: context,
    globalUsages,
    hasRuntimeCallbackWrapper: [...context.callbackWrappers.values()].some(isRuntimeCallbackWrapper),
    irPrograms,
    runtimeRequirements,
    signatureRuntimeTypes,
    throwingFunctionCount: context.throwingFunctions.size
  })
  const classMethods = collectClassMethods(context)

  context.processRuntime = needsProcessRuntime
  context.unhandledRejectionFlag = needsAsyncRuntime ? `${plan.symbolPrefix}_unhandled_rejection` : null
  reportUnsupportedCSyntaxFeatures(syntaxFeatures, diagnostics)
  reportUnsupportedCGlobalUsages(globalUsages, diagnostics, context)

  const lines = [
    `#include "${relativeCIncludePath(plan.sourcePath, plan.headerPath, options.host)}"`,
    ...uniqueCModuleImports(plan.imports)
      .filter((item) => item.module.headerPath !== plan.headerPath)
      .map((item) => `#include "${relativeCIncludePath(plan.sourcePath, item.module.headerPath, options.host)}"`),
    ''
  ]

  lines.push(
    ...emitCPrelude(
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
  )

  emitCModuleDeclarations(lines, functions, classMethods, context, deps)

  for (const wrapper of context.asyncTaskWrappers.values()) {
    lines.push(...emitAsyncTaskWrapperDeclaration(wrapper, context, deps.asyncTaskLoweringDependencies))
    lines.push('')
  }

  for (const wrapper of context.callbackWrappers.values()) {
    lines.push(
      ...(wrapper.kind === 'plain-arrow'
        ? emitPlainArrowCallbackWrapperDeclaration(wrapper, context, deps.callbackLoweringDependencies)
        : emitRuntimeCallbackWrapperDeclaration(wrapper, context, deps.callbackLoweringDependencies))
    )
    lines.push('')
  }

  for (const wrapper of context.promiseChainWrappers.values()) {
    lines.push(
      ...emitPromiseChainCallbackWrapperDeclaration(wrapper, context, deps.promiseChainLoweringDependencies)
    )
    lines.push('')
  }

  for (const wrapper of context.dgramMessageHandlers.values()) {
    lines.push(...emitDgramMessageHandlerDeclaration(wrapper, context, deps.dgramLoweringDependencies))
    lines.push('')
  }

  for (const wrapper of context.httpHandlers.values()) {
    lines.push(...emitHttpHandlerDeclaration(wrapper, context, deps.httpLoweringDependencies))
    lines.push('')
  }

  for (const wrapper of context.netHandlers.values()) {
    lines.push(...emitNetHandlerDeclaration(wrapper, context, deps.netLoweringDependencies))
    lines.push('')
  }

  for (const item of functions) {
    lines.push(...deps.emitFunctionDeclaration(item, context))
    lines.push('')
  }

  for (const { info, method } of classMethods) {
    lines.push(...deps.emitClassMethodDeclaration(info, method, context))
    lines.push('')
  }

  if (!plan.isEntry && plan.initName != null) {
    lines.push(...emitCModuleInitFunction(plan, context, deps))
  } else {
    lines.push(...emitCModuleMainFunction(plan, context, deps))
  }

  return `${lines.join('\n')}\n`
}

export function emitCModuleHeader(
  plan: CModulePlan,
  plans: CModulePlan[],
  diagnostics: Diagnostic[],
  deps: CModuleEmissionDependencies
): string {
  const context = createCModuleBaseContext(plan, plans, diagnostics, deps)
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
    lines.push(`${deps.emitFunctionHead(item, context)};`)
  }

  lines.push('')
  lines.push(`#endif`)

  return `${lines.join('\n')}\n`
}

function emitCModuleDeclarations(
  lines: string[],
  functions: AnyNode[],
  classMethods: any[],
  context: CEmitContext,
  deps: CModuleEmissionDependencies
): void {
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
    lines.push(`${deps.emitFunctionHead(item, context)};`)
  }

  for (const { info, method } of classMethods) {
    lines.push(`${deps.emitClassMethodHead(info, method, context)};`)
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

function createCModuleBaseContext(
  plan: CModulePlan,
  plans: CModulePlan[],
  diagnostics: Diagnostic[],
  deps: CModuleEmissionDependencies
): CEmitContext {
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
  const context = deps.createBaseContext(diagnostics, functionDeclarations, functionEffects, jsGlobalRoots)

  context.dgramImportNames = collectRuntimeImportNames(
    irPrograms,
    new Set(['dgram', 'node:dgram']),
    new Set(['default', 'dgram'])
  )
  context.dgramCreateSocketNames = collectRuntimeNamedImportNames(
    irPrograms,
    new Set(['dgram', 'node:dgram']),
    'createSocket'
  )
  context.cryptoImportNames = collectRuntimeImportNames(
    irPrograms,
    new Set(['node:crypto']),
    new Set(['default', 'crypto'])
  )
  context.httpImportNames = collectHttpRuntimeImportNames(irPrograms)
  context.httpCreateServerNames = collectHttpRuntimeCreateServerNames(irPrograms)
  context.netImportNames = collectRuntimeImportNames(
    irPrograms,
    new Set(['net', 'node:net']),
    new Set(['default', 'net'])
  )
  context.netCreateServerNames = collectRuntimeNamedImportNames(
    irPrograms,
    new Set(['net', 'node:net']),
    'createServer'
  )
  context.netConnectNames = collectRuntimeNamedImportNames(irPrograms, new Set(['net', 'node:net']), 'connect')
  for (const name of collectRuntimeNamedImportNames(irPrograms, new Set(['net', 'node:net']), 'createConnection')) {
    context.netConnectNames.add(name)
  }
  context.functionNames = createCModuleFunctionNames(plan)
  context.classInfos = createClassInfos(collectIrTopLevelNodes(plan.ir, 'class'), diagnostics)
  context.externalEventLoopFunctions = deps.collectExternalEventLoopFunctions(functions)
  context.callbackWrappers = collectCallbackWrappers(irPrograms, context, deps.callbackLoweringDependencies)
  context.promiseChainWrappers = collectPromiseChainWrappers(irPrograms, context, deps.promiseChainLoweringDependencies)
  context.asyncTaskWrappers = collectAsyncTaskWrappers(functionEntries, context, deps.asyncTaskLoweringDependencies)
  context.dgramMessageHandlers = collectDgramMessageHandlers(irPrograms, context)
  context.httpHandlers = collectHttpHandlers(irPrograms, context)
  context.netHandlers = collectNetHandlers(irPrograms, context)

  return context
}

function collectCModuleContextRuntimeTypes(context: CEmitContext): Set<string> {
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

function emitCModuleInitFunction(
  plan: CModulePlan,
  baseContext: CEmitContext,
  deps: CModuleEmissionDependencies
): string[] {
  const context = createFunctionContext(baseContext, 'void')
  const body = collectIrTopLevelNodes(plan.ir, 'statement')
  const initCalls = emitCModuleImportInitCalls(plan)
  const bodyLines = deps.emitStatementList(body, context)
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

function emitCModuleMainFunction(
  plan: CModulePlan,
  baseContext: CEmitContext,
  deps: CModuleEmissionDependencies
): string[] {
  const context = createFunctionContext(baseContext, 'number')
  const body = collectIrTopLevelNodes(plan.ir, 'statement')
  const initCalls = emitCModuleImportInitCalls(plan)
  const bodyLines = deps.emitStatementList(body, context)
  const lines = [context.processRuntime ? 'int main(int argc, char** argv) {' : 'int main(void) {']

  if (context.processRuntime) {
    lines.push('  ccjs_process_init(argc, argv);')
  }
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

  lines.push(`  return ${deps.emitMainReturnExpression(context)};`)
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
