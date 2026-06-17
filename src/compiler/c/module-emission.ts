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
import type { AnyNode, Diagnostic, IrFunctionDeclaration, IrFunctionEffect, IrRuntimeRequirement } from '../types.ts'
import type { CFunctionParam, CPromiseChainWrapper, CRuntimeArrowCallbackWrapper } from './types.ts'
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
  shouldEmitCleanupLabel
} from './context.ts'
import type { CEmitContext, CFunctionContext } from './context.ts'
import { reportUnsupportedCGlobalUsages, reportUnsupportedCSyntaxFeatures } from './diagnostics.ts'
import { emitCFunctionName, emitCIdentifier } from './identifiers.ts'
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
import type { CClassInfo, CClassMethod, CModuleEmitOptions, CModuleImportPlan, CModulePlan } from './types.ts'
import { emitCType, isManagedRuntimeReturnType, isOpaqueRuntimeValueType } from './value-types.ts'
import { collectClassMethods, createClassInfos } from './values/classes.ts'

type CModuleValueDeclaration = {
  name: string
  symbolName: string
  valueType: string
}

type CModuleNode = AnyNode

type CModuleFunctionEntry = {
  declaration: IrFunctionDeclaration
  node: CModuleNode
}

function pushCModuleLines(target: string[], source: string[]): void {
  for (let index = 0; index < source.length; index = index + 1) {
    target.push(source[index])
  }
}

function pushIndentedCModuleLines(target: string[], source: string[]): void {
  for (let index = 0; index < source.length; index = index + 1) {
    target.push(`  ${source[index]}`)
  }
}

function pushIrFunctionDeclaration(target: IrFunctionDeclaration[], declaration: IrFunctionDeclaration): void {
  target.push(declaration)
}

function pushIrFunctionEffect(target: IrFunctionEffect[], effect: IrFunctionEffect): void {
  target.push(effect)
}

function cModuleClassMethodAt(values: CClassMethod[], index: number): CClassMethod {
  return values[index]
}

function cModuleFunctionDeclarationAt(
  values: IrFunctionDeclaration[],
  index: number
): IrFunctionDeclaration {
  return values[index]
}

function cModuleFunctionEffectAt(values: IrFunctionEffect[], index: number): IrFunctionEffect {
  return values[index]
}

function cModuleFunctionEntryAt(values: CModuleFunctionEntry[], index: number): CModuleFunctionEntry {
  return values[index]
}

function cModuleFunctionParamAt(values: CFunctionParam[], index: number): CFunctionParam {
  return values[index]
}

function cModuleImportPlanAt(values: CModuleImportPlan[], index: number): CModuleImportPlan {
  return values[index]
}

function cModuleNodeAt(values: CModuleNode[], index: number): CModuleNode {
  return values[index]
}

function cModuleValueDeclarationAt(
  values: CModuleValueDeclaration[],
  index: number
): CModuleValueDeclaration {
  return values[index]
}

function cModulePromiseChainWrapperAt(
  values: CPromiseChainWrapper[],
  index: number
): CPromiseChainWrapper {
  return values[index]
}

function cModuleRuntimeArrowWrapperAt(
  values: CRuntimeArrowCallbackWrapper[],
  index: number
): CRuntimeArrowCallbackWrapper {
  return values[index]
}

function irRuntimeRequirementAt(values: IrRuntimeRequirement[], index: number): IrRuntimeRequirement {
  return values[index]
}

function stringAt(values: string[], index: number): string {
  return values[index]
}

function runtimeRequirementSetFromArray(values: IrRuntimeRequirement[]): Set<IrRuntimeRequirement> {
  const result: Set<IrRuntimeRequirement> = new Set()

  for (let index = 0; index < values.length; index = index + 1) {
    result.add(irRuntimeRequirementAt(values, index))
  }

  return result
}

function stringSetFromArray(values: string[]): Set<string> {
  const result: Set<string> = new Set()

  for (let index = 0; index < values.length; index = index + 1) {
    result.add(stringAt(values, index))
  }

  return result
}

function cModuleHasRuntimeCallbackWrapper(context: CEmitContext): boolean {
  for (const wrapper of context.callbackWrappers.values()) {
    if (isRuntimeCallbackWrapper(wrapper)) {
      return true
    }
  }

  return false
}

export type CModuleEmissionDependencies = {
  asyncTaskLoweringDependencies: AsyncTaskLoweringDependencies
  callbackLoweringDependencies: CallbackLoweringDependencies
  collectExternalEventLoopFunctions(functions: AnyNode[]): Set<string>
  createBaseContext(
    diagnostics: Diagnostic[],
    functionDeclarations: IrFunctionDeclaration[],
    functionEffects: IrFunctionEffect[],
    jsGlobalRoots: Set<string>
  ): CEmitContext
  dgramLoweringDependencies: DgramLoweringDependencies
  emitClassMethodDeclaration(info: CClassInfo, method: AnyNode, baseContext: CEmitContext): string[]
  emitClassMethodHead(info: CClassInfo, method: AnyNode, context: CEmitContext): string
  emitFunctionDeclaration(statement: AnyNode, baseContext: CEmitContext): string[]
  emitFunctionHead(statement: AnyNode, context: CEmitContext): string
  emitMainReturnExpression(context: CFunctionContext): string
  emitStatementList(body: AnyNode[], context: CFunctionContext): string[]
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
  const functions: AnyNode[] = []
  const context = createCModuleBaseContext(plan, plans, diagnostics, deps)
  const runtimeRequirements = runtimeRequirementSetFromArray(collectIrRuntimeRequirements(irPrograms))
  const globalUsages = collectIrGlobalUsages(irPrograms)
  const syntaxFeatures = collectIrSyntaxFeatureUsages(irPrograms)
  const signatureRuntimeTypes = collectCModuleContextRuntimeTypes(context)
  const exportedValues = collectCModuleExportedValueDeclarations(plan)
  const prelude = resolveCRuntimePreludeRequirements({
    classInfoCount: context.classInfos.size,
    cryptoContext: context,
    globalUsages,
    hasRuntimeCallbackWrapper: cModuleHasRuntimeCallbackWrapper(context),
    irPrograms,
    runtimeRequirements,
    signatureRuntimeTypes,
    throwingFunctionCount: context.throwingFunctions.size
  })
  const classMethods = collectClassMethods(context)

  for (let entryIndex = 0; entryIndex < functionEntries.length; entryIndex = entryIndex + 1) {
    const entry = cModuleFunctionEntryAt(functionEntries, entryIndex)

    functions.push(entry.node)
  }

  context.processRuntime = prelude.needsProcessRuntime
  if (prelude.needsAsyncRuntime) {
    context.unhandledRejectionFlag = `${plan.symbolPrefix}_unhandled_rejection`
  } else {
    context.unhandledRejectionFlag = null
  }
  reportUnsupportedCSyntaxFeatures(syntaxFeatures, diagnostics)
  reportUnsupportedCGlobalUsages(globalUsages, diagnostics, context)

  const lines: string[] = []
  lines.push(`#include "${relativeCIncludePath(plan.sourcePath, plan.headerPath, options.host)}"`)

  const imports = uniqueCModuleImports(plan.imports)

  for (let importIndex = 0; importIndex < imports.length; importIndex = importIndex + 1) {
    const item = cModuleImportPlanAt(imports, importIndex)
    const importedModule = item.module

    if (importedModule == null) {
      continue
    }

    if (importedModule.headerPath !== plan.headerPath) {
      lines.push(`#include "${relativeCIncludePath(plan.sourcePath, importedModule.headerPath, options.host)}"`)
    }
  }

  lines.push('')

  pushCModuleLines(
    lines,
    emitCPrelude(
      prelude.needsRuntime,
      prelude.needsTimeRuntime,
      prelude.needsMathRuntime,
      prelude.needsCryptoRuntime,
      prelude.needsDebugMemoryRuntime,
      prelude.needsAsyncRuntime,
      prelude.needsCallbackRuntime,
      prelude.needsStringHeader,
      prelude.needsCollectionRuntime,
      prelude.needsBinaryRuntime,
      prelude.needsObjectRuntime,
      prelude.needsChildProcessRuntime,
      prelude.needsFsRuntime,
      prelude.needsOsRuntime,
      prelude.needsPathRuntime,
      prelude.needsUrlRuntime,
      prelude.needsProcessRuntime,
      prelude.needsJsonRuntime,
      prelude.needsTimerRuntime,
      prelude.needsConsoleRuntime,
      prelude.needsDgramRuntime,
      prelude.needsFetchRuntime,
      prelude.needsHttpRuntime,
      prelude.needsNetRuntime,
      options
    )
  )

  emitCModuleValueDefinitions(lines, exportedValues)
  emitCModuleDeclarations(lines, functions, classMethods, context, deps)

  for (const wrapper of context.asyncTaskWrappers.values()) {
    pushCModuleLines(lines, emitAsyncTaskWrapperDeclaration(wrapper, context, deps.asyncTaskLoweringDependencies))
    lines.push('')
  }

  for (const wrapper of context.callbackWrappers.values()) {
    if (wrapper.kind === 'plain-arrow') {
      pushCModuleLines(lines, emitPlainArrowCallbackWrapperDeclaration(wrapper, context, deps.callbackLoweringDependencies))
    } else {
      pushCModuleLines(lines, emitRuntimeCallbackWrapperDeclaration(wrapper, context, deps.callbackLoweringDependencies))
    }
    lines.push('')
  }

  for (const wrapper of context.promiseChainWrappers.values()) {
    pushCModuleLines(lines, emitPromiseChainCallbackWrapperDeclaration(wrapper, context, deps.promiseChainLoweringDependencies))
    lines.push('')
  }

  for (const wrapper of context.dgramMessageHandlers.values()) {
    pushCModuleLines(lines, emitDgramMessageHandlerDeclaration(wrapper, context, deps.dgramLoweringDependencies))
    lines.push('')
  }

  for (const wrapper of context.httpHandlers.values()) {
    pushCModuleLines(lines, emitHttpHandlerDeclaration(wrapper, context, deps.httpLoweringDependencies))
    lines.push('')
  }

  for (const wrapper of context.netHandlers.values()) {
    pushCModuleLines(lines, emitNetHandlerDeclaration(wrapper, context, deps.netLoweringDependencies))
    lines.push('')
  }

  for (let functionIndex = 0; functionIndex < functions.length; functionIndex = functionIndex + 1) {
    const item = cModuleNodeAt(functions, functionIndex)

    pushCModuleLines(lines, deps.emitFunctionDeclaration(item, context))
    lines.push('')
  }

  for (let methodIndex = 0; methodIndex < classMethods.length; methodIndex = methodIndex + 1) {
    const item = cModuleClassMethodAt(classMethods, methodIndex)

    pushCModuleLines(lines, deps.emitClassMethodDeclaration(item.info, item.method, context))
    lines.push('')
  }

  if (!plan.isEntry && plan.initName != null) {
    pushCModuleLines(lines, emitCModuleInitFunction(plan, context, deps))
  } else {
    pushCModuleLines(lines, emitCModuleMainFunction(plan, context, deps))
  }

  return joinCModuleLines(lines)
}

export function emitCModuleHeader(
  plan: CModulePlan,
  plans: CModulePlan[],
  diagnostics: Diagnostic[],
  deps: CModuleEmissionDependencies
): string {
  const context = createCModuleBaseContext(plan, plans, diagnostics, deps)
  const exportedFunctions = collectCModuleExportedFunctions(plan)
  const exportedValues = collectCModuleExportedValueDeclarations(plan)
  const lines: string[] = []

  lines.push(`#ifndef ${plan.headerGuard}`)
  lines.push(`#define ${plan.headerGuard}`)
  lines.push('')
  lines.push('#include "ccjs/value.h"')
  lines.push('#include "ccjs/loop.h"')
  lines.push('#include "ccjs/promise.h"')
  lines.push('')

  if (plan.initName != null) {
    lines.push(`void ${plan.initName}(void);`)
  }

  for (let functionIndex = 0; functionIndex < exportedFunctions.length; functionIndex = functionIndex + 1) {
    const item = cModuleNodeAt(exportedFunctions, functionIndex)

    lines.push(`${deps.emitFunctionHead(item, context)};`)
  }

  for (let valueIndex = 0; valueIndex < exportedValues.length; valueIndex = valueIndex + 1) {
    const item = cModuleValueDeclarationAt(exportedValues, valueIndex)

    lines.push(`extern ${cModuleValueCType(item.valueType)} ${item.symbolName};`)
  }

  lines.push('')
  lines.push(`#endif`)

  return joinCModuleLines(lines)
}

function joinCModuleLines(lines: string[]): string {
  let result = ''

  for (let index = 0; index < lines.length; index = index + 1) {
    if (index > 0) {
      result = `${result}\n`
    }

    result = `${result}${lines[index]}`
  }

  return `${result}\n`
}

function emitCModuleDeclarations(
  lines: string[],
  functions: AnyNode[],
  classMethods: CClassMethod[],
  context: CEmitContext,
  deps: CModuleEmissionDependencies
): void {
  const arrowCallbackWrappers: CRuntimeArrowCallbackWrapper[] = []
  const promiseChainCallbackWrappers: CPromiseChainWrapper[] = []

  for (const wrapper of context.callbackWrappers.values()) {
    if (wrapper.kind === 'arrow' && isRuntimeArrowCallbackWrapperWithContext(wrapper)) {
      arrowCallbackWrappers.push(wrapper)
    }
  }

  for (const wrapper of context.promiseChainWrappers.values()) {
    if (isPromiseChainCallbackWrapperWithContext(wrapper)) {
      promiseChainCallbackWrappers.push(wrapper)
    }
  }

  for (const wrapper of context.asyncTaskWrappers.values()) {
    pushCModuleLines(lines, emitAsyncTaskFrameType(wrapper))
    lines.push('')
  }

  for (let wrapperIndex = 0; wrapperIndex < arrowCallbackWrappers.length; wrapperIndex = wrapperIndex + 1) {
    const wrapper = cModuleRuntimeArrowWrapperAt(arrowCallbackWrappers, wrapperIndex)

    pushCModuleLines(lines, emitRuntimeArrowCallbackContextType(wrapper))
    lines.push('')
  }

  for (
    let wrapperIndex = 0;
    wrapperIndex < promiseChainCallbackWrappers.length;
    wrapperIndex = wrapperIndex + 1
  ) {
    const wrapper = cModulePromiseChainWrapperAt(promiseChainCallbackWrappers, wrapperIndex)

    pushCModuleLines(lines, emitRuntimeArrowCallbackContextType(wrapper))
    lines.push('')
  }

  if (context.unhandledRejectionFlag != null) {
    lines.push(`static int ${context.unhandledRejectionFlag} = 0;`)
    lines.push('')
  }

  for (let functionIndex = 0; functionIndex < functions.length; functionIndex = functionIndex + 1) {
    const item = cModuleNodeAt(functions, functionIndex)

    lines.push(`${deps.emitFunctionHead(item, context)};`)
  }

  for (let methodIndex = 0; methodIndex < classMethods.length; methodIndex = methodIndex + 1) {
    const item = cModuleClassMethodAt(classMethods, methodIndex)

    lines.push(`${deps.emitClassMethodHead(item.info, item.method, context)};`)
  }

  for (const wrapper of context.asyncTaskWrappers.values()) {
    pushCModuleLines(lines, emitAsyncTaskWrapperPrototypes(wrapper))
  }

  for (const wrapper of context.callbackWrappers.values()) {
    if (wrapper.kind === 'plain-arrow') {
      lines.push(`${emitPlainArrowCallbackWrapperHead(wrapper)};`)
      continue
    }

    if (wrapper.kind === 'arrow' && isRuntimeArrowCallbackWrapperWithContext(wrapper)) {
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
  const functions: AnyNode[] = []
  const functionDeclarations = collectIrFunctionDeclarations(irPrograms)
  const functionEffects = collectIrStoredFunctionEffects(irPrograms)
  const globalRoots = collectIrGlobalRoots(irPrograms)
  const jsGlobalRoots = stringSetFromArray(globalRoots)

  for (let entryIndex = 0; entryIndex < functionEntries.length; entryIndex = entryIndex + 1) {
    const entry = cModuleFunctionEntryAt(functionEntries, entryIndex)

    functions.push(entry.node)
  }

  for (
    let declarationIndex = 0;
    declarationIndex < importedDeclarations.length;
    declarationIndex = declarationIndex + 1
  ) {
    const declaration = cModuleFunctionDeclarationAt(importedDeclarations, declarationIndex)

    pushIrFunctionDeclaration(functionDeclarations, declaration)
  }

  const importedEffects = collectImportedCModuleFunctionEffects(plan)

  for (let effectIndex = 0; effectIndex < importedEffects.length; effectIndex = effectIndex + 1) {
    const effect = cModuleFunctionEffectAt(importedEffects, effectIndex)

    pushIrFunctionEffect(functionEffects, effect)
  }

  const context = deps.createBaseContext(diagnostics, functionDeclarations, functionEffects, jsGlobalRoots)

  registerCModuleValueDeclarations(context, plan)
  registerImportedCModuleValueDeclarations(context, plan)

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
  context.netConnectNames = collectRuntimeImportNames(
    irPrograms,
    new Set(['net', 'node:net']),
    new Set(['connect', 'createConnection'])
  )
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
  const types: Set<string> = new Set()

  for (const valueType of context.functionReturnTypes.values()) {
    if (isManagedRuntimeReturnType(valueType) || isOpaqueRuntimeValueType(valueType) || valueType === 'promise') {
      types.add(valueType)
    }
  }

  for (const params of context.functionParams.values()) {
    for (let paramIndex = 0; paramIndex < params.length; paramIndex = paramIndex + 1) {
      const param = cModuleFunctionParamAt(params, paramIndex)

      if (isManagedRuntimeReturnType(param.valueType) || isOpaqueRuntimeValueType(param.valueType) || param.valueType === 'promise') {
        types.add(param.valueType)
      }
    }
  }

  return types
}

function registerCModuleValueDeclarations(context: CEmitContext, plan: CModulePlan): void {
  const values = collectCModuleExportedValueDeclarations(plan)

  for (let index = 0; index < values.length; index = index + 1) {
    const item = cModuleValueDeclarationAt(values, index)

    context.moduleValueNames.set(item.name, item.symbolName)
    context.moduleValueTypes.set(item.name, item.valueType)
  }
}

function registerImportedCModuleValueDeclarations(context: CEmitContext, plan: CModulePlan): void {
  for (let importIndex = 0; importIndex < plan.imports.length; importIndex = importIndex + 1) {
    const item = cModuleImportPlanAt(plan.imports, importIndex)
    const importedModule = item.module

    if (importedModule == null) {
      continue
    }

    const specifiers = item.declaration.specifiers

    for (let specifierIndex = 0; specifierIndex < specifiers.length; specifierIndex = specifierIndex + 1) {
      const specifier = cModuleNodeAt(specifiers, specifierIndex)
      const exported = importedModule.record.exports.get(specifier.imported)

      if (exported == null || exported.type !== 'VariableDeclaration') {
        continue
      }

      context.moduleValueNames.set(specifier.local, emitCModuleValueName(importedModule, specifier.imported))
      context.moduleValueTypes.set(specifier.local, cModuleValueType(exported))
    }
  }
}

function collectCModuleExportedValueDeclarations(plan: CModulePlan): CModuleValueDeclaration[] {
  const values: CModuleValueDeclaration[] = []
  const statements = collectIrTopLevelNodes(plan.ir, 'statement')

  for (let index = 0; index < statements.length; index = index + 1) {
    const item = cModuleNodeAt(statements, index)

    if (item.type !== 'VariableDeclaration' || item.exported !== true) {
      continue
    }

    values.push({
      name: item.name,
      symbolName: emitCModuleValueName(plan, item.name),
      valueType: cModuleValueType(item)
    })
  }

  return values
}

function emitCModuleValueDefinitions(lines: string[], values: CModuleValueDeclaration[]): void {
  if (values.length === 0) {
    return
  }

  for (let index = 0; index < values.length; index = index + 1) {
    const item = cModuleValueDeclarationAt(values, index)
    const cType = cModuleValueCType(item.valueType)
    const initializer = cModuleValueGlobalInitializer(item.valueType)

    if (initializer === '') {
      lines.push(`${cType} ${item.symbolName};`)
    } else {
      lines.push(`${cType} ${item.symbolName} = ${initializer};`)
    }
  }

  lines.push('')
}

function cModuleValueType(node: AnyNode): string {
  const valueType = node.valueType

  if (valueType == null || valueType === '') {
    return 'unknown'
  }

  return valueType
}

function cModuleValueCType(valueType: string): string {
  if (valueType === 'string') {
    return 'char*'
  }

  if (valueType === 'unknown') {
    return 'ccjs_value'
  }

  return emitCType(valueType)
}

function cModuleValueGlobalInitializer(valueType: string): string {
  if (valueType === 'string') {
    return '""'
  }

  if (valueType === 'unknown' || isManagedRuntimeReturnType(valueType) || isOpaqueRuntimeValueType(valueType)) {
    return ''
  }

  return '0'
}

function emitCModuleInitFunction(
  plan: CModulePlan,
  baseContext: CEmitContext,
  deps: CModuleEmissionDependencies
): string[] {
  const context = createFunctionContext(baseContext, 'void', false)
  const body = collectIrTopLevelNodes(plan.ir, 'statement')
  const initCalls = emitCModuleImportInitCalls(plan)
  const bodyLines = deps.emitStatementList(body, context)
  const lines: string[] = []

  lines.push(`void ${plan.initName}(void) {`)
  lines.push('  static bool ccjs_initialized = false;')
  lines.push('  if (ccjs_initialized) return;')
  lines.push('  ccjs_initialized = true;')
  pushIndentedCModuleLines(lines, initCalls)
  pushIndentedCModuleLines(lines, emitLoopFlowDeclarations(context))
  pushIndentedCModuleLines(lines, emitReturnValueDeclarations(context))
  pushIndentedCModuleLines(lines, emitReturnFlowDeclarations(context))
  pushIndentedCModuleLines(lines, emitEventLoopDeclarations(context))
  pushIndentedCModuleLines(lines, emitOwnedValueDeclarations(context))
  pushIndentedCModuleLines(lines, emitOwnedPromiseDeclarations(context))
  pushIndentedCModuleLines(lines, emitErrorChannelDeclarations(context))
  pushIndentedCModuleLines(lines, emitBoxedValueDeclarations(context))
  pushIndentedCModuleLines(lines, emitEventLoopInit(context))
  pushIndentedCModuleLines(lines, bodyLines)
  pushIndentedCModuleLines(lines, emitEventLoopDrain(context))

  if (shouldEmitCleanupLabel(context)) {
    lines.push('ccjs_cleanup:')
    pushIndentedCModuleLines(lines, emitOwnedValueCleanup(context))
    pushIndentedCModuleLines(lines, emitOwnedPromiseCleanup(context))
    pushIndentedCModuleLines(lines, emitEventLoopCleanup(context))
    pushIndentedCModuleLines(lines, emitBoxedValueCleanup(context))
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
  const context = createFunctionContext(baseContext, 'number', false)
  const body = collectIrTopLevelNodes(plan.ir, 'statement')
  const initCalls = emitCModuleImportInitCalls(plan)
  const bodyLines = deps.emitStatementList(body, context)
  const lines: string[] = []

  if (context.processRuntime) {
    lines.push('int main(int argc, char** argv) {')
  } else {
    lines.push('int main(void) {')
  }

  if (context.processRuntime) {
    lines.push('  ccjs_process_init(argc, argv);')
  }
  pushIndentedCModuleLines(lines, emitLoopFlowDeclarations(context))
  pushIndentedCModuleLines(lines, emitReturnValueDeclarations(context))
  pushIndentedCModuleLines(lines, emitReturnFlowDeclarations(context))
  pushIndentedCModuleLines(lines, emitEventLoopDeclarations(context))
  pushIndentedCModuleLines(lines, emitOwnedValueDeclarations(context))
  pushIndentedCModuleLines(lines, emitOwnedPromiseDeclarations(context))
  pushIndentedCModuleLines(lines, emitErrorChannelDeclarations(context))
  pushIndentedCModuleLines(lines, emitBoxedValueDeclarations(context))
  pushIndentedCModuleLines(lines, emitEventLoopInit(context))
  pushIndentedCModuleLines(lines, initCalls)
  pushIndentedCModuleLines(lines, bodyLines)
  pushIndentedCModuleLines(lines, emitEventLoopDrain(context))

  if (shouldEmitCleanupLabel(context)) {
    lines.push('ccjs_cleanup:')
    pushIndentedCModuleLines(lines, emitOwnedValueCleanup(context))
    pushIndentedCModuleLines(lines, emitOwnedPromiseCleanup(context))
    pushIndentedCModuleLines(lines, emitEventLoopCleanup(context))
    pushIndentedCModuleLines(lines, emitBoxedValueCleanup(context))
  }

  lines.push(`  return ${deps.emitMainReturnExpression(context)};`)
  lines.push('}')

  return lines
}

function emitCModuleImportInitCalls(plan: CModulePlan): string[] {
  const calls: string[] = []

  for (let index = 0; index < plan.imports.length; index = index + 1) {
    const item = cModuleImportPlanAt(plan.imports, index)
    const importedModule = item.module

    if (importedModule == null) {
      continue
    }

    if (importedModule.initName != null) {
      calls.push(`${importedModule.initName}();`)
    }
  }

  return calls
}

function collectCModuleExportedFunctions(plan: CModulePlan): AnyNode[] {
  const exportedNames: Set<string> = new Set()
  const functions: AnyNode[] = []

  for (
    let declarationIndex = 0;
    declarationIndex < plan.ir.functionDeclarations.length;
    declarationIndex = declarationIndex + 1
  ) {
    const declaration = cModuleFunctionDeclarationAt(plan.ir.functionDeclarations, declarationIndex)

    if (declaration.exported) {
      exportedNames.add(declaration.name)
    }
  }

  const nodes = collectIrTopLevelNodes(plan.ir, 'function')

  for (let index = 0; index < nodes.length; index = index + 1) {
    const item = cModuleNodeAt(nodes, index)

    if (exportedNames.has(item.name)) {
      functions.push(item)
    }
  }

  return functions
}

function collectCModuleImportedFunctionDeclarations(plan: CModulePlan): IrFunctionDeclaration[] {
  const declarations: IrFunctionDeclaration[] = []

  for (let importIndex = 0; importIndex < plan.imports.length; importIndex = importIndex + 1) {
    const item = cModuleImportPlanAt(plan.imports, importIndex)
    const importedModule = item.module

    if (importedModule == null) {
      continue
    }

    const specifiers = item.declaration.specifiers

    for (let specifierIndex = 0; specifierIndex < specifiers.length; specifierIndex = specifierIndex + 1) {
      const specifier = cModuleNodeAt(specifiers, specifierIndex)
      const declaration = findCModuleExportedFunctionDeclaration(
        importedModule.ir.functionDeclarations,
        specifier.imported
      )

      if (declaration != null) {
        declarations.push(cloneImportedCModuleFunctionDeclaration(declaration, specifier.local))
      }
    }
  }

  return declarations
}

function collectImportedCModuleFunctionEffects(plan: CModulePlan): IrFunctionEffect[] {
  const effects: IrFunctionEffect[] = []

  for (let importIndex = 0; importIndex < plan.imports.length; importIndex = importIndex + 1) {
    const item = cModuleImportPlanAt(plan.imports, importIndex)
    const importedModule = item.module

    if (importedModule == null) {
      continue
    }

    const specifiers = item.declaration.specifiers

    for (let specifierIndex = 0; specifierIndex < specifiers.length; specifierIndex = specifierIndex + 1) {
      const specifier = cModuleNodeAt(specifiers, specifierIndex)
      const sourceEffects = importedModule.ir.functionEffects

      for (let effectIndex = 0; effectIndex < sourceEffects.length; effectIndex = effectIndex + 1) {
        const effect = cModuleFunctionEffectAt(sourceEffects, effectIndex)

        if (effect.name === specifier.imported) {
          effects.push(cloneImportedCModuleFunctionEffect(effect, specifier.local))
        }
      }
    }
  }

  return effects
}

function findCModuleExportedFunctionDeclaration(
  declarations: IrFunctionDeclaration[],
  name: string
): IrFunctionDeclaration | null {
  for (let index = 0; index < declarations.length; index = index + 1) {
    const declaration = cModuleFunctionDeclarationAt(declarations, index)

    if (declaration.name === name && declaration.exported) {
      return declaration
    }
  }

  return null
}

function cloneImportedCModuleFunctionDeclaration(
  declaration: IrFunctionDeclaration,
  name: string
): IrFunctionDeclaration {
  return {
    name,
    exported: declaration.exported,
    async: declaration.async,
    params: declaration.params,
    returnType: declaration.returnType,
    returnNullable: declaration.returnNullable,
    returnArrayElementType: declaration.returnArrayElementType,
    returnArrayElementDeclaredType: declaration.returnArrayElementDeclaredType,
    returnMapKeyType: declaration.returnMapKeyType,
    returnMapValueType: declaration.returnMapValueType,
    returnPromiseValueType: declaration.returnPromiseValueType,
    returnSetElementType: declaration.returnSetElementType,
    returnShape: declaration.returnShape,
    loc: declaration.loc
  }
}

function cloneImportedCModuleFunctionEffect(effect: IrFunctionEffect, name: string): IrFunctionEffect {
  return {
    name,
    throws: effect.throws,
    throwValueTypes: effect.throwValueTypes
  }
}

function createCModuleFunctionNames(plan: CModulePlan): Map<string, string> {
  const names: Map<string, string> = new Map()
  const localNames: Set<string> = new Set()

  for (
    let declarationIndex = 0;
    declarationIndex < plan.ir.functionDeclarations.length;
    declarationIndex = declarationIndex + 1
  ) {
    const declaration = cModuleFunctionDeclarationAt(plan.ir.functionDeclarations, declarationIndex)

    localNames.add(declaration.name)
  }

  for (
    let declarationIndex = 0;
    declarationIndex < plan.ir.functionDeclarations.length;
    declarationIndex = declarationIndex + 1
  ) {
    const declaration = cModuleFunctionDeclarationAt(plan.ir.functionDeclarations, declarationIndex)

    names.set(declaration.name, emitCModuleFunctionName(plan, declaration.name))
  }

  for (let importIndex = 0; importIndex < plan.imports.length; importIndex = importIndex + 1) {
    const item = cModuleImportPlanAt(plan.imports, importIndex)
    const importedModule = item.module

    if (importedModule == null) {
      continue
    }

    const specifiers = item.declaration.specifiers

    for (let specifierIndex = 0; specifierIndex < specifiers.length; specifierIndex = specifierIndex + 1) {
      const specifier = cModuleNodeAt(specifiers, specifierIndex)

      names.set(specifier.imported, emitCModuleFunctionName(importedModule, specifier.imported))

      if (!localNames.has(specifier.local)) {
        names.set(specifier.local, emitCModuleFunctionName(importedModule, specifier.imported))
      }
    }
  }

  return names
}

function emitCModuleFunctionName(plan: CModulePlan, name: string): string {
  return `${plan.symbolPrefix}_${emitCFunctionName(name)}`
}

function emitCModuleValueName(plan: CModulePlan, name: string): string {
  return `${plan.symbolPrefix}_${emitCIdentifier(name)}`
}
