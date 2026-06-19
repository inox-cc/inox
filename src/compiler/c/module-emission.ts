import {
  collectIrFunctionDeclarations,
  collectIrFunctionNodeEntries,
  collectIrGlobalRoots,
  collectIrGlobalUsages,
  collectIrFunctionEffectsWithExternalEffects,
  collectIrRuntimeRequirements,
  collectIrStoredFunctionEffects,
  collectIrSyntaxFeatureUsages,
  collectIrTopLevelNodes,
  irClassMethodEffectName,
  mergeIrFunctionEffects
} from '../ir.ts'
import { reexportImportAliasName } from '../modules/synthetic-imports.ts'
import type { AnyNode, Diagnostic, IrFunctionDeclaration, IrFunctionEffect, IrProgram, IrRuntimeRequirement } from '../types.ts'
import type {
  CCallbackWrapper,
  CFunctionParam,
  CFunctionType,
  CObjectShapeField,
  CPromiseChainWrapper,
  CRuntimeArrowCallbackWrapper
} from './types.ts'
import {
  collectCallbackWrappers,
  collectFunctionPointerParamNames,
  emitFunctionPointerParams,
  emitFunctionPointerNamedParams,
  emitFunctionPointerReturnType,
  emitPlainArrowCallbackWrapperDeclaration,
  emitPlainArrowCallbackWrapperHead,
  emitRuntimeArrowCallbackContextType,
  emitRuntimeCallbackWrapperDeclaration,
  emitRuntimeCallbackWrapperHead,
  isPlainFunctionPointerType,
  isPromiseChainCallbackWrapperWithContext,
  isRuntimeArrowCallbackWrapperWithContext,
  isRuntimeCallbackWrapper,
  isRuntimeFunctionType
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
import { emitCFunctionName, emitCIdentifier, emitCObjectFunctionFieldName } from './identifiers.ts'
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
import type { ArrayLoweringDependencies } from './values/arrays.ts'
import type { ClassLoweringDependencies } from './values/classes.ts'
import type { CollectionLoweringDependencies } from './values/collections.ts'
import type { NullableLoweringDependencies } from './values/nullable.ts'
import type { StatementLoweringDependencies } from './values/statements.ts'
import type { StringLoweringDependencies } from './values/strings.ts'
import type {
  CClassInfo,
  CClassMethod,
  CFunctionPointerAdapter,
  CModuleEmitOptions,
  CModuleImportPlan,
  CModulePlan
} from './types.ts'
import { emitCType, isManagedRuntimeReturnType, isOpaqueRuntimeValueType } from './value-types.ts'
import { collectClassMethods, createClassInfos } from './values/classes.ts'

type CModuleValueDeclaration = {
  exported: boolean
  name: string
  symbolName: string
  valueType: string
}

type CModuleFunctionNodeEntry = {
  declaration: IrFunctionDeclaration
  node: AnyNode
}

type CModuleNode = AnyNode

type CModuleFunctionEntry = {
  declaration: IrFunctionDeclaration
  node: CModuleNode
}

type CModuleRuntimeCallbackWrapperContext = {
  callbackWrappers: Map<string, CCallbackWrapper>
}

type CModuleRuntimeTypeContext = {
  functionParams: Map<string, CFunctionParam[]>
  functionReturnTypes: Map<string, string>
}

type CModuleValueFunctionFieldContext = {
  moduleObjectShapes: Map<string, CObjectShapeField[]>
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

function pushCModuleClassMethodFunctionDeclarations(
  target: IrFunctionDeclaration[],
  programs: IrProgram[]
): void {
  for (let programIndex = 0; programIndex < programs.length; programIndex = programIndex + 1) {
    const program = programs[programIndex]
    const classes = collectIrTopLevelNodes(program, 'class')

    for (let classIndex = 0; classIndex < classes.length; classIndex = classIndex + 1) {
      const classNode = cModuleNodeAt(classes, classIndex)
      const methods: CModuleNode[] = classNode.methods

      for (let methodIndex = 0; methodIndex < methods.length; methodIndex = methodIndex + 1) {
        const method = cModuleNodeAt(methods, methodIndex)

        if (method.name === 'constructor') {
          continue
        }

        const methodEffectName = irClassMethodEffectName(classNode.name, method.name)
        const declaration: IrFunctionDeclaration = {
          name: methodEffectName,
          exported: false,
          async: method.async === true,
          params: method.params,
          returnType: method.returnType,
          returnNullable: method.returnNullable === true,
          returnArrayElementType: method.returnArrayElementType,
          returnArrayElementDeclaredType: method.returnArrayElementDeclaredType,
          returnMapKeyType: method.returnMapKeyType,
          returnMapValueType: method.returnMapValueType,
          returnPromiseValueType: method.returnPromiseValueType,
          returnSetElementType: method.returnSetElementType,
          returnShape: method.returnShape,
          loc: method.loc
        }

        target.push(declaration)
      }
    }
  }
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

function cModuleHasRuntimeCallbackWrapper(context: CModuleRuntimeCallbackWrapperContext): boolean {
  for (const wrapper of context.callbackWrappers.values()) {
    if (isRuntimeCallbackWrapper(wrapper)) {
      return true
    }
  }

  return false
}

export type CModuleEmissionDependencies = {
  arrayLoweringDependencies: ArrayLoweringDependencies
  asyncTaskLoweringDependencies: AsyncTaskLoweringDependencies
  callbackLoweringDependencies: CallbackLoweringDependencies
  classLoweringDependencies: ClassLoweringDependencies
  collectExternalEventLoopFunctions(functions: AnyNode[]): Set<string>
  collectionLoweringDependencies: CollectionLoweringDependencies
  createBaseContext(
    diagnostics: Diagnostic[],
    functionDeclarations: IrFunctionDeclaration[],
    functionEffects: IrFunctionEffect[],
    jsGlobalRoots: Set<string>,
    topLevelNodes: AnyNode[]
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
  nullableLoweringDependencies: NullableLoweringDependencies
  promiseChainLoweringDependencies: PromiseChainLoweringDependencies
  statementLoweringDependencies: StatementLoweringDependencies
  stringLoweringDependencies: StringLoweringDependencies
}

export function emitCModuleSource(
  plan: CModulePlan,
  plans: CModulePlan[],
  options: CModuleEmitOptions,
  diagnostics: Diagnostic[],
  deps: CModuleEmissionDependencies
): string {
  const irPrograms = [plan.ir]
  const functionEntries = collectCModuleFunctionNodeEntries(plan, irPrograms)
  const functions: AnyNode[] = []
  const context = createCModuleBaseContext(plan, plans, diagnostics, deps)
  const runtimeRequirements = runtimeRequirementSetFromArray(collectIrRuntimeRequirements(irPrograms))
  const globalUsages = collectIrGlobalUsages(irPrograms)
  const syntaxFeatures = collectIrSyntaxFeatureUsages(irPrograms)
  const signatureRuntimeTypes = collectCModuleContextRuntimeTypes(context)
  const moduleValues = collectCModuleValueDeclarations(plan)
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

  emitCModuleValueDefinitions(lines, moduleValues)
  emitCModuleValueFunctionFieldDefinitions(lines, moduleValues, context)

  const bodyLines: string[] = []

  for (const wrapper of context.asyncTaskWrappers.values()) {
    pushCModuleLines(bodyLines, emitAsyncTaskWrapperDeclaration(wrapper, context, deps.asyncTaskLoweringDependencies))
    bodyLines.push('')
  }

  for (const wrapper of context.callbackWrappers.values()) {
    if (wrapper.kind === 'plain-arrow') {
      pushCModuleLines(bodyLines, emitPlainArrowCallbackWrapperDeclaration(wrapper, context, deps.callbackLoweringDependencies))
    } else {
      pushCModuleLines(bodyLines, emitRuntimeCallbackWrapperDeclaration(wrapper, context, deps.callbackLoweringDependencies))
    }
    bodyLines.push('')
  }

  for (const wrapper of context.promiseChainWrappers.values()) {
    pushCModuleLines(bodyLines, emitPromiseChainCallbackWrapperDeclaration(wrapper, context, deps.promiseChainLoweringDependencies))
    bodyLines.push('')
  }

  for (const wrapper of context.dgramMessageHandlers.values()) {
    pushCModuleLines(bodyLines, emitDgramMessageHandlerDeclaration(wrapper, context, deps.dgramLoweringDependencies))
    bodyLines.push('')
  }

  for (const wrapper of context.httpHandlers.values()) {
    pushCModuleLines(bodyLines, emitHttpHandlerDeclaration(wrapper, context, deps.httpLoweringDependencies))
    bodyLines.push('')
  }

  for (const wrapper of context.netHandlers.values()) {
    pushCModuleLines(bodyLines, emitNetHandlerDeclaration(wrapper, context, deps.netLoweringDependencies))
    bodyLines.push('')
  }

  for (let functionIndex = 0; functionIndex < functions.length; functionIndex = functionIndex + 1) {
    const item = cModuleNodeAt(functions, functionIndex)

    pushCModuleLines(bodyLines, deps.emitFunctionDeclaration(item, context))
    bodyLines.push('')
  }

  for (let methodIndex = 0; methodIndex < classMethods.length; methodIndex = methodIndex + 1) {
    const item = cModuleClassMethodAt(classMethods, methodIndex)
    const info = item.info
    const method = item.method

    pushCModuleLines(bodyLines, deps.emitClassMethodDeclaration(info, method, context))
    bodyLines.push('')
  }

  if (!plan.isEntry && plan.initName != null) {
    pushCModuleLines(bodyLines, emitCModuleInitFunction(plan, context, deps))
  } else {
    pushCModuleLines(bodyLines, emitCModuleMainFunction(plan, context, deps))
  }

  emitCModuleDeclarations(lines, functions, classMethods, context, deps)
  emitCModuleFunctionPointerAdapterDefinitions(lines, context)
  pushCModuleLines(lines, bodyLines)

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

function joinStrings(values: string[], separator: string): string {
  let result = ''

  for (let index = 0; index < values.length; index = index + 1) {
    if (index > 0) {
      result = result + separator
    }

    result = result + values[index]
  }

  return result
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

function emitCModuleFunctionPointerAdapterDefinitions(lines: string[], context: CEmitContext): void {
  if (context.functionPointerAdapters.length === 0) {
    return
  }

  const moduleObjectFunctionFields = collectCModuleObjectFunctionFieldNames(context)

  for (const adapter of context.functionPointerAdapters) {
    pushCModuleLines(lines, emitCModuleFunctionPointerAdapterDefinition(adapter, context, moduleObjectFunctionFields))
    lines.push('')
  }
}

function emitCModuleFunctionPointerAdapterDefinition(
  adapter: CFunctionPointerAdapter,
  context: CEmitContext,
  moduleObjectFunctionFields: Set<string>
): string[] {
  const lines = [`${emitCModuleFunctionPointerAdapterHead(adapter)} {`]
  const expectedNames = collectFunctionPointerParamNames(adapter.functionType, adapter.seenTypes)
  const targetFunctionType = functionPointerAdapterTargetFunctionType(adapter, context)
  const targetSeenTypes = functionPointerAdapterTargetSeenTypes(adapter, context)
  const targetNames = collectFunctionPointerParamNames(targetFunctionType, targetSeenTypes)
  const targetNameSet = stringSetFromArray(targetNames)
  const targetArgs = emitFunctionPointerAdapterTargetArgs(adapter, expectedNames, targetNames, moduleObjectFunctionFields)

  for (const name of expectedNames) {
    if (!targetNameSet.has(name)) {
      lines.push(`  (void)${name};`)
    }
  }

  if (isThrowingFunctionPointerAdapterTarget(adapter, context)) {
    pushCModuleLines(lines, emitThrowingFunctionPointerAdapterTargetCall(adapter, targetArgs))
    lines.push('}')

    return lines
  }

  const call = `${adapter.target}(${joinStrings(targetArgs, ', ')})`

  if (emitFunctionPointerReturnType(adapter.functionType) === 'void') {
    lines.push(`  ${call};`)
  } else {
    lines.push(`  return ${call};`)
  }

  lines.push('}')

  return lines
}

function functionPointerAdapterTargetSeenTypes(adapter: CFunctionPointerAdapter, context: CEmitContext): string[] {
  if (isPlainArrowFunctionPointerAdapterTarget(adapter, context)) {
    return []
  }

  return adapter.targetSeenTypes
}

function functionPointerAdapterTargetFunctionType(
  adapter: CFunctionPointerAdapter,
  context: CEmitContext
): CFunctionType | null | undefined {
  for (const wrapper of context.callbackWrappers.values()) {
    if (wrapper.kind === 'plain-arrow' && wrapper.name === adapter.target) {
      return wrapper.functionType
    }
  }

  return adapter.targetFunctionType
}

function isPlainArrowFunctionPointerAdapterTarget(adapter: CFunctionPointerAdapter, context: CEmitContext): boolean {
  for (const wrapper of context.callbackWrappers.values()) {
    if (wrapper.kind === 'plain-arrow' && wrapper.name === adapter.target) {
      return true
    }
  }

  if (adapter.target.startsWith('ccjs_callback_arrow_')) {
    return true
  }

  return false
}

function isThrowingFunctionPointerAdapterTarget(adapter: CFunctionPointerAdapter, context: CEmitContext): boolean {
  const sourceName = cFunctionPointerAdapterTargetSourceName(adapter, context)

  return sourceName != null && context.throwingFunctions.has(sourceName)
}

function cFunctionPointerAdapterTargetSourceName(adapter: CFunctionPointerAdapter, context: CEmitContext): string | null {
  for (const name of context.functionNames.keys()) {
    const target = context.functionNames.get(name)

    if (target === adapter.target) {
      return name
    }
  }

  return null
}

function emitThrowingFunctionPointerAdapterTargetCall(adapter: CFunctionPointerAdapter, targetArgs: string[]): string[] {
  const lines: string[] = []
  const callArgs: string[] = []
  const adapterReturnType = emitFunctionPointerReturnType(adapter.functionType)
  const returnType = emitFunctionPointerReturnType(adapter.targetFunctionType)

  for (const arg of targetArgs) {
    callArgs.push(arg)
  }

  if (returnType !== 'void') {
    lines.push(`${returnType} ccjs_adapter_result = ${cFunctionPointerAdapterDefaultReturnValue(returnType)};`)
    callArgs.push('&ccjs_adapter_result')
  }

  lines.push('ccjs_value ccjs_adapter_error = ccjs_undefined_value();')
  callArgs.push('&ccjs_adapter_error')
  lines.push(`ccjs_status ccjs_adapter_status = ${adapter.target}(${joinStrings(callArgs, ', ')});`)
  lines.push('if (ccjs_adapter_status != CCJS_OK) {')
  lines.push('  ccjs_release(ccjs_adapter_error);')

  if (adapterReturnType === 'void') {
    lines.push('  return;')
  } else {
    lines.push(`  return ${throwingFunctionPointerAdapterReturnExpression(adapterReturnType, returnType)};`)
  }

  lines.push('}')
  lines.push('ccjs_release(ccjs_adapter_error);')

  if (adapterReturnType !== 'void') {
    lines.push(`return ${throwingFunctionPointerAdapterReturnExpression(adapterReturnType, returnType)};`)
  }

  return lines
}

function throwingFunctionPointerAdapterReturnExpression(adapterReturnType: string, targetReturnType: string): string {
  if (targetReturnType !== 'void') {
    return 'ccjs_adapter_result'
  }

  return cFunctionPointerAdapterDefaultReturnValue(adapterReturnType)
}

function cFunctionPointerAdapterDefaultReturnValue(returnType: string): string {
  if (returnType === 'ccjs_value') {
    return 'ccjs_undefined_value()'
  }

  if (returnType.includes('*')) {
    return '0'
  }

  return '0'
}

function emitFunctionPointerAdapterTargetArgs(
  adapter: CFunctionPointerAdapter,
  expectedNames: string[],
  targetNames: string[],
  moduleObjectFunctionFields: Set<string>
): string[] {
  const expectedNameSet = stringSetFromArray(expectedNames)
  const args: string[] = []

  for (const name of targetNames) {
    if (expectedNameSet.has(name)) {
      args.push(name)
      continue
    }

    const moduleObjectFunctionField = emitFunctionPointerAdapterModuleObjectFieldArg(name, moduleObjectFunctionFields)

    if (moduleObjectFunctionField != null) {
      args.push(moduleObjectFunctionField)
      continue
    }

    const defaultArg = emitFunctionPointerAdapterDefaultTargetArg(name, adapter)

    if (defaultArg != null) {
      args.push(defaultArg)
      continue
    }

    args.push(name)
  }

  return args
}

function collectCModuleObjectFunctionFieldNames(context: CEmitContext): Set<string> {
  const names: Set<string> = new Set()

  for (const objectName of context.moduleObjectShapes.keys()) {
    const fields = context.moduleObjectShapes.get(objectName)

    if (fields != null) {
      collectCModuleObjectFunctionFieldNamesFromShape(names, objectName, fields)
    }
  }

  return names
}

function collectCModuleObjectFunctionFieldNamesFromShape(
  names: Set<string>,
  objectName: string,
  fields: CObjectShapeField[]
): void {
  for (const field of fields) {
    if (field.valueType === 'function') {
      if (isPlainFunctionPointerType(field.functionType) || isRuntimeFunctionType(field.functionType)) {
        names.add(emitCObjectFunctionFieldName(objectName, field.name))
      }
    }
  }
}

function emitFunctionPointerAdapterModuleObjectFieldArg(name: string, moduleObjectFunctionFields: Set<string>): string | null {
  const prefix = 'ccjs_objfn_ccjs_arg_'

  if (!name.startsWith(prefix)) {
    return null
  }

  let index = prefix.length

  while (index < name.length) {
    const code = name.charCodeAt(index)

    if (code < 48 || code > 57) {
      break
    }

    index = index + 1
  }

  if (index === prefix.length || name[index] !== '_') {
    return null
  }

  const candidate = `ccjs_objfn_${name.slice(index + 1)}`

  if (moduleObjectFunctionFields.has(candidate)) {
    return candidate
  }

  return null
}

function emitFunctionPointerAdapterDefaultTargetArg(
  name: string,
  adapter: CFunctionPointerAdapter
): string | null {
  for (let index = adapter.functionType.params.length; index < adapter.targetFunctionType.params.length; index = index + 1) {
    if (name !== `ccjs_arg_${index}`) {
      continue
    }

    const param = adapter.targetFunctionType.params[index]

    if (param.optional !== true && param.defaultValue == null) {
      return null
    }

    return emitFunctionPointerAdapterDefaultParamValue(param)
  }

  return null
}

function emitFunctionPointerAdapterDefaultParamValue(param: CFunctionParam): string {
  const value = param.defaultValue

  if (value != null) {
    if (value.type === 'NullLiteral') {
      return 'ccjs_null_value()'
    }

    if (value.type === 'BooleanLiteral') {
      if (value.value === true) {
        return '1'
      }

      return '0'
    }

    if (value.type === 'NumberLiteral') {
      return `${value.value}`
    }
  }

  if (
    param.nullable === true ||
    param.valueType === 'unknown' ||
    isManagedRuntimeReturnType(param.valueType) ||
    isOpaqueRuntimeValueType(param.valueType)
  ) {
    return 'ccjs_undefined_value()'
  }

  return '0'
}

function emitCModuleFunctionPointerAdapterHead(adapter: CFunctionPointerAdapter): string {
  return `static ${emitFunctionPointerReturnType(adapter.functionType)} ${adapter.name}(${emitFunctionPointerNamedParams(
    adapter.functionType,
    adapter.seenTypes
  )})`
}

function createCModuleBaseContext(
  plan: CModulePlan,
  plans: CModulePlan[],
  diagnostics: Diagnostic[],
  deps: CModuleEmissionDependencies
): CEmitContext {
  const ir = plan.ir
  const irPrograms = [ir]
  const importedDeclarations = collectCModuleImportedFunctionDeclarations(plan)
  const functionEntries = collectCModuleFunctionNodeEntries(plan, irPrograms)
  const functions: AnyNode[] = []
  const functionDeclarations = collectIrFunctionDeclarations(irPrograms)
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

  pushCModuleClassMethodFunctionDeclarations(functionDeclarations, irPrograms)

  const importedEffects = collectImportedCModuleFunctionEffects(plan)
  const inferredFunctionEffects = collectIrFunctionEffectsWithExternalEffects(
    irPrograms,
    importedEffects,
    true
  )
  const storedFunctionEffects = collectIrStoredFunctionEffects(irPrograms)
  const functionEffects = mergeIrFunctionEffects(inferredFunctionEffects, storedFunctionEffects)

  for (let effectIndex = 0; effectIndex < importedEffects.length; effectIndex = effectIndex + 1) {
    const effect = cModuleFunctionEffectAt(importedEffects, effectIndex)

    pushIrFunctionEffect(functionEffects, effect)
  }

  const context = deps.createBaseContext(
    diagnostics,
    functionDeclarations,
    functionEffects,
    jsGlobalRoots,
    ir.body
  )

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
  const classNodes = collectIrTopLevelNodes(ir, 'class')

  context.classInfos = createClassInfos(classNodes, diagnostics)
  context.externalEventLoopFunctions = deps.collectExternalEventLoopFunctions(functions)
  context.callbackWrappers = collectCallbackWrappers(irPrograms, context, deps.callbackLoweringDependencies)
  context.promiseChainWrappers = collectPromiseChainWrappers(irPrograms, context, deps.promiseChainLoweringDependencies)
  context.asyncTaskWrappers = collectAsyncTaskWrappers(functionEntries, context, deps.asyncTaskLoweringDependencies)
  context.dgramMessageHandlers = collectDgramMessageHandlers(irPrograms, context)
  context.httpHandlers = collectHttpHandlers(irPrograms, context)
  context.netHandlers = collectNetHandlers(irPrograms, context)

  return context
}

function collectCModuleContextRuntimeTypes(context: CModuleRuntimeTypeContext): Set<string> {
  const types: Set<string> = new Set()

  for (const valueType of context.functionReturnTypes.values()) {
    addCModuleRuntimeType(types, valueType)
  }

  for (const params of context.functionParams.values()) {
    for (let paramIndex = 0; paramIndex < params.length; paramIndex = paramIndex + 1) {
      const param = cModuleFunctionParamAt(params, paramIndex)

      collectCModuleFunctionParamRuntimeTypes(types, param, new Set())
    }
  }

  return types
}

function addCModuleRuntimeType(types: Set<string>, valueType: string): void {
  if (isManagedRuntimeReturnType(valueType) || isOpaqueRuntimeValueType(valueType) || valueType === 'promise') {
    types.add(valueType)
  }
}

function collectCModuleFunctionParamRuntimeTypes(
  types: Set<string>,
  param: CFunctionParam,
  seen: Set<CObjectShapeField[]>
): void {
  addCModuleRuntimeType(types, param.valueType)

  if (
    param.valueType === 'function' &&
    !isPlainFunctionPointerType(param.functionType) &&
    isRuntimeFunctionType(param.functionType)
  ) {
    types.add('function')
  }

  if (param.valueType === 'object' && param.shape != null && param.shape.fields != null) {
    collectCModuleObjectShapeRuntimeTypes(types, param.shape.fields, seen)
  }
}

function collectCModuleObjectShapeRuntimeTypes(
  types: Set<string>,
  fields: CObjectShapeField[],
  seen: Set<CObjectShapeField[]>
): void {
  if (seen.has(fields)) {
    return
  }

  seen.add(fields)

  for (let index = 0; index < fields.length; index = index + 1) {
    const field = fields[index]

    addCModuleRuntimeType(types, field.valueType)

    if (
      field.valueType === 'function' &&
      !isPlainFunctionPointerType(field.functionType) &&
      isRuntimeFunctionType(field.functionType)
    ) {
      types.add('function')
    }

    if (field.valueType === 'object' && field.shape != null && field.shape.fields != null) {
      collectCModuleObjectShapeRuntimeTypes(types, field.shape.fields, seen)
    }
  }

  seen.delete(fields)
}

function registerCModuleValueDeclarations(context: CEmitContext, plan: CModulePlan): void {
  const values = collectCModuleValueDeclarations(plan)

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

      const localName = cModuleImportedBindingName(item.declaration, specifier)
      context.moduleValueNames.set(localName, emitCModuleValueName(importedModule, specifier.imported))
      context.moduleValueTypes.set(localName, cModuleValueType(exported))
    }
  }
}

function collectCModuleExportedValueDeclarations(plan: CModulePlan): CModuleValueDeclaration[] {
  const values = collectCModuleValueDeclarations(plan)
  const exported: CModuleValueDeclaration[] = []

  for (let index = 0; index < values.length; index = index + 1) {
    const item = cModuleValueDeclarationAt(values, index)

    if (item.exported === true) {
      exported.push(item)
    }
  }

  return exported
}

function collectCModuleValueDeclarations(plan: CModulePlan): CModuleValueDeclaration[] {
  const values: CModuleValueDeclaration[] = []
  const ir = plan.ir
  const statements = collectIrTopLevelNodes(ir, 'statement')

  for (let index = 0; index < statements.length; index = index + 1) {
    const item = cModuleNodeAt(statements, index)

    if (item.type !== 'VariableDeclaration') {
      continue
    }

    values.push({
      exported: item.exported === true,
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
    let prefix = ''

    if (item.exported !== true) {
      prefix = 'static '
    }

    if (initializer === '') {
      lines.push(`${prefix}${cType} ${item.symbolName};`)
    } else {
      lines.push(`${prefix}${cType} ${item.symbolName} = ${initializer};`)
    }
  }

  lines.push('')
}

function emitCModuleValueFunctionFieldDefinitions(
  lines: string[],
  values: CModuleValueDeclaration[],
  context: CModuleValueFunctionFieldContext
): void {
  let emitted = false

  for (let index = 0; index < values.length; index = index + 1) {
    const item = cModuleValueDeclarationAt(values, index)
    const fields = context.moduleObjectShapes.get(item.name)

    if (fields == null) {
      continue
    }

    if (emitCModuleObjectFunctionFieldDefinitions(lines, item.name, fields, cModuleObjectFunctionFieldSeenTypes())) {
      emitted = true
    }
  }

  if (emitted) {
    lines.push('')
  }
}

function cModuleObjectFunctionFieldSeenTypes(): string[] {
  return ['CFunctionContext']
}

function emitCModuleObjectFunctionFieldDefinitions(
  lines: string[],
  objectName: string,
  fields: CObjectShapeField[],
  seenTypes: string[]
): boolean {
  let emitted = false

  for (const field of fields) {
    if (field.valueType === 'function') {
      const name = emitCObjectFunctionFieldName(objectName, field.name)

      if (isPlainFunctionPointerType(field.functionType)) {
        lines.push(
          `static ${emitFunctionPointerReturnType(field.functionType)} (*${name})(${emitFunctionPointerParams(
            field.functionType,
            [],
            seenTypes
          )}) = 0;`
        )
        emitted = true
      } else if (isRuntimeFunctionType(field.functionType)) {
        lines.push(`static ccjs_value ${name};`)
        emitted = true
      }
    } else if (field.valueType === 'object' && field.shape != null && field.shape.fields != null) {
      if (field.declaredType != null && seenTypes.includes(field.declaredType)) {
        continue
      }

      let pushedType = false

      if (field.declaredType != null) {
        seenTypes.push(field.declaredType)
        pushedType = true
      }

      if (emitCModuleObjectFunctionFieldDefinitions(lines, `${objectName}_${field.name}`, field.shape.fields, seenTypes)) {
        emitted = true
      }

      if (pushedType) {
        seenTypes.pop()
      }
    }
  }

  return emitted
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
  const ir = plan.ir
  const body = collectIrTopLevelNodes(ir, 'statement')
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
  const ir = plan.ir
  const body = collectIrTopLevelNodes(ir, 'statement')
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

function collectCModuleFunctionNodeEntries(
  plan: CModulePlan,
  programs: IrProgram[]
): CModuleFunctionNodeEntry[] {
  const entries = collectIrFunctionNodeEntries(programs)
  const filtered: CModuleFunctionNodeEntry[] = []

  for (let index = 0; index < entries.length; index = index + 1) {
    const entry = cModuleFunctionEntryAt(entries, index)

    if (!isCModuleImportFunctionWrapper(plan, entry.node)) {
      filtered.push(entry)
    }
  }

  return filtered
}

function isCModuleImportFunctionWrapper(plan: CModulePlan, node: AnyNode): boolean {
  if (node.type !== 'FunctionDeclaration') {
    return false
  }

  for (let importIndex = 0; importIndex < plan.imports.length; importIndex = importIndex + 1) {
    const item = cModuleImportPlanAt(plan.imports, importIndex)

    const specifiers = item.declaration.specifiers

    for (let specifierIndex = 0; specifierIndex < specifiers.length; specifierIndex = specifierIndex + 1) {
      const specifier = cModuleNodeAt(specifiers, specifierIndex)
      const localName = cModuleImportedBindingName(item.declaration, specifier)

      if (node.name === localName && isCModuleImportFunctionWrapperBody(node, specifier.imported)) {
        return true
      }
    }
  }

  return false
}

function isCModuleImportFunctionWrapperBody(node: AnyNode, importedName: string): boolean {
  if (node.body.length !== 1) {
    return false
  }

  const statement = cModuleNodeAt(node.body, 0)
  let expression: AnyNode | null = null

  if (statement.type === 'ReturnStatement') {
    expression = statement.argument
  } else if (statement.type === 'ExpressionStatement') {
    expression = statement.expression
  }

  if (expression == null || expression.type !== 'CallExpression') {
    return false
  }

  const callee = expression.callee

  if (callee.type !== 'Reference' || callee.path.length !== 1) {
    return false
  }

  let calleeName = ''
  const path: string[] = callee.path

  for (const segment of path) {
    const pathSegment: string = segment
    calleeName = pathSegment
    break
  }

  return calleeName === importedName
}

function collectCModuleExportedFunctions(plan: CModulePlan): AnyNode[] {
  const exportedNames: Set<string> = new Set()
  const functions: AnyNode[] = []
  const ir = plan.ir

  for (
    let declarationIndex = 0;
    declarationIndex < ir.functionDeclarations.length;
    declarationIndex = declarationIndex + 1
  ) {
    const declaration = cModuleFunctionDeclarationAt(ir.functionDeclarations, declarationIndex)

    if (declaration.exported) {
      exportedNames.add(declaration.name)
    }
  }

  const nodes = collectIrTopLevelNodes(ir, 'function')

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
        const localName = cModuleImportedBindingName(item.declaration, specifier)
        declarations.push(cloneImportedCModuleFunctionDeclaration(declaration, localName))
      }
    }
  }

  return declarations
}

function collectImportedCModuleFunctionEffects(plan: CModulePlan): IrFunctionEffect[] {
  const visiting: Set<string> = new Set()
  const cache: Map<string, IrFunctionEffect[]> = new Map()
  return collectImportedCModuleFunctionEffectsWithVisited(plan, visiting, cache)
}

function collectCModulePlanFunctionEffectsWithVisited(
  plan: CModulePlan,
  visiting: Set<string>,
  cache: Map<string, IrFunctionEffect[]>
): IrFunctionEffect[] {
  const cached = cache.get(plan.record.path)

  if (cached != null) {
    return cached
  }

  if (visiting.has(plan.record.path)) {
    return []
  }

  visiting.add(plan.record.path)

  const irPrograms: IrProgram[] = []
  irPrograms.push(plan.ir)

  const importedEffects = collectImportedCModuleFunctionEffectsWithVisited(plan, visiting, cache)
  const inferredEffects = collectIrFunctionEffectsWithExternalEffects(irPrograms, importedEffects, true)
  const storedEffects = collectIrStoredFunctionEffects(irPrograms)
  const effects = mergeIrFunctionEffects(inferredEffects, storedEffects)

  for (let effectIndex = 0; effectIndex < importedEffects.length; effectIndex = effectIndex + 1) {
    const effect = cModuleFunctionEffectAt(importedEffects, effectIndex)

    pushIrFunctionEffect(effects, effect)
  }

  visiting.delete(plan.record.path)
  cache.set(plan.record.path, effects)

  return effects
}

function collectImportedCModuleFunctionEffectsWithVisited(
  plan: CModulePlan,
  visiting: Set<string>,
  cache: Map<string, IrFunctionEffect[]>
): IrFunctionEffect[] {
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
      const sourceEffects = collectCModulePlanFunctionEffectsWithVisited(importedModule, visiting, cache)

      for (let effectIndex = 0; effectIndex < sourceEffects.length; effectIndex = effectIndex + 1) {
        const effect = cModuleFunctionEffectAt(sourceEffects, effectIndex)
        const effectName: string = effect.name
        const importedName: string = specifier.imported

        if (effectName === importedName) {
          const localName = cModuleImportedBindingName(item.declaration, specifier)
          effects.push(cloneImportedCModuleFunctionEffect(effect, localName))
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
    declaredReturnType: declaration.declaredReturnType,
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
  const localFunctionNodes = collectIrTopLevelNodes(plan.ir, 'function')

  for (
    let functionIndex = 0;
    functionIndex < localFunctionNodes.length;
    functionIndex = functionIndex + 1
  ) {
    const node = cModuleNodeAt(localFunctionNodes, functionIndex)

    if (!isCModuleImportFunctionWrapper(plan, node)) {
      localNames.add(node.name)
    }
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
      const importedBindingName = cModuleImportedBindingName(item.declaration, specifier)
      const importedFunctionName = emitCModuleFunctionName(importedModule, specifier.imported)

      if (!localNames.has(importedBindingName)) {
        names.set(importedBindingName, importedFunctionName)
      }

      if (item.declaration.type !== 'ExportDeclaration') {
        if (!localNames.has(specifier.imported)) {
          names.set(specifier.imported, importedFunctionName)
        }

        if (!localNames.has(specifier.local)) {
          names.set(specifier.local, importedFunctionName)
        }
      }
    }
  }

  return names
}

function emitCModuleFunctionName(plan: CModulePlan, name: string): string {
  return `${plan.symbolPrefix}_${emitCFunctionName(name)}`
}

function cModuleImportedBindingName(declaration: AnyNode, specifier: AnyNode): string {
  if (declaration.type === 'ExportDeclaration') {
    return reexportImportAliasName(specifier.local)
  }

  return specifier.local
}

function emitCModuleValueName(plan: CModulePlan, name: string): string {
  return `${plan.symbolPrefix}_${emitCIdentifier(name)}`
}
