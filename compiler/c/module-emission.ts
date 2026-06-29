import {
  collectIrFunctionDeclarations,
  collectIrFunctionEffectsWithExternalEffects,
  collectIrFunctionNodeEntries,
  collectIrGlobalRoots,
  collectIrGlobalUsages,
  collectIrRuntimeRequirements,
  collectIrStoredFunctionEffects,
  collectIrSyntaxFeatureUsages,
  collectIrTopLevelNodes,
  irClassMethodEffectName,
  mergeIrFunctionEffects
} from '../ir.ts'
import { memberExpressionPath } from '../member-paths.ts'
import { reexportImportAliasName } from '../modules/synthetic-imports.ts'
import {
  dateConstructorRuntimeMethodNameFromPath,
  dateInstanceRuntimeMethodReturnType,
  timeRuntimeMethodNameFromPath
} from '../../stdlib/global/compiler/descriptor.ts'
import type {
  AnyNode,
  Diagnostic,
  IrFunctionDeclaration,
  IrFunctionEffect,
  IrProgram,
  IrRuntimeRequirement
} from '../types.ts'
import type { CallbackLoweringDependencies } from './async/callbacks.ts'
import {
  collectCallbackWrappers,
  collectFunctionPointerParamNames,
  emitFunctionPointerNamedParams,
  emitFunctionPointerParams,
  emitFunctionPointerReturnType,
  emitPlainArrowCallbackWrapperDeclaration,
  emitPlainArrowCallbackWrapperHead,
  emitRuntimeArrowCallbackContextType,
  emitRuntimeCallbackWrapperDeclaration,
  emitRuntimeCallbackWrapperHead,
  isNullableFunctionType,
  isPlainFunctionPointerType,
  isPromiseChainCallbackWrapperWithContext,
  isRuntimeArrowCallbackWrapperWithContext,
  isRuntimeCallbackWrapper,
  isRuntimeFunctionType
} from './async/callbacks.ts'
import type { PromiseChainLoweringDependencies } from './async/promises.ts'
import {
  collectPromiseChainWrappers,
  emitPromiseChainCallbackWrapperDeclaration,
  emitPromiseChainCallbackWrapperHead
} from './async/promises.ts'
import type { AsyncTaskLoweringDependencies } from './async/tasks.ts'
import {
  collectAsyncTaskWrappers,
  emitAsyncTaskFrameType,
  emitAsyncTaskWrapperDeclaration,
  emitAsyncTaskWrapperPrototypes
} from './async/tasks.ts'
import type { CEmitContext, CFunctionContext } from './context.ts'
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
import { reportUnsupportedCGlobalUsages, reportUnsupportedCSyntaxFeatures } from './diagnostics.ts'
import { cStringLiteral, emitCFunctionName, emitCIdentifier, emitCObjectFunctionFieldName } from './identifiers.ts'
import { relativeCIncludePath, uniqueCModuleImports } from './modules.ts'
import { emitCPrelude } from './prelude.ts'
import { addDateStringRuntimeRequirements, resolveCRuntimePreludeRequirements } from './runtime-plan.ts'
import {
  collectNodeNetworkHandlers,
  emitNodeNetworkHandlerDeclarations,
  emitNodeNetworkHandlerPrototypeLines,
  hasNodeNetworkHandlers,
  registerNodeStdlibRuntimeImportNames
} from '../stdlib/node/c.ts'
import type {
  DgramLoweringDependencies,
  HttpLoweringDependencies,
  NetLoweringDependencies
} from '../stdlib/node/c.ts'
import type {
  CCallbackWrapper,
  CClassInfo,
  CClassMethod,
  CFunctionParam,
  CFunctionPointerAdapter,
  CFunctionType,
  CModuleEmitOptions,
  CModuleImportPlan,
  CModulePlan,
  CObjectShapeField,
  CPromiseChainWrapper,
  CRuntimeArrowCallbackWrapper
} from './types.ts'
import { emitCType, isManagedRuntimeReturnType, isOpaqueRuntimeValueType, isRuntimeNullableType } from './value-types.ts'
import type { ArrayLoweringDependencies } from './values/arrays.ts'
import type { CClassMethodPrototypeMap, ClassLoweringDependencies } from './values/classes.ts'
import {
  cClassNameFromValueType,
  cClassValueTypeName,
  collectClassMethods,
  createClassInfos,
  emitCClassDescriptorDeclarations,
  emitCClassTypeName,
  emitCNativeClassDeclarations
} from './values/classes.ts'
import type { CollectionLoweringDependencies } from './values/collections.ts'
import type { NullableLoweringDependencies } from './values/nullable.ts'
import type { StatementLoweringDependencies } from './values/statements.ts'
import type { StringLoweringDependencies } from './values/strings.ts'

type CModuleValueDeclaration = {
  exported: boolean
  functionType?: CFunctionType | null
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
  moduleValueTypes: Map<string, string>
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

function pushScopedCModuleBody(target: string[], source: string[]): void {
  target.push('  {')
  pushIndentedCModuleLines(target, source)
  target.push('  }')
}

function pushIrFunctionDeclaration(target: IrFunctionDeclaration[], declaration: IrFunctionDeclaration): void {
  target.push(declaration)
}

function pushIrFunctionEffect(target: IrFunctionEffect[], effect: IrFunctionEffect): void {
  target.push(effect)
}

function pushCModuleClassMethodFunctionDeclarations(target: IrFunctionDeclaration[], programs: IrProgram[]): void {
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
        const methodReturnType = cModuleNodeReturnType(method)
        const declaration: IrFunctionDeclaration = {
          name: methodEffectName,
          exported: false,
          async: method.async === true,
          params: method.params,
          returnType: methodReturnType,
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

function cModuleNodeReturnType(node: CModuleNode): string {
  if (node.returnType !== null && typeof node.returnType !== 'undefined') {
    return node.returnType
  }

  return 'unknown'
}

function cModuleClassMethodAt(values: CClassMethod[], index: number): CClassMethod {
  return values[index]
}

function cModuleFunctionDeclarationAt(values: IrFunctionDeclaration[], index: number): IrFunctionDeclaration {
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

function cModuleValueDeclarationAt(values: CModuleValueDeclaration[], index: number): CModuleValueDeclaration {
  return values[index]
}

function cModulePromiseChainWrapperAt(values: CPromiseChainWrapper[], index: number): CPromiseChainWrapper {
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

function collectCModuleClassMethodPrototypes(
  context: CEmitContext,
  deps: CModuleEmissionDependencies
): CClassMethodPrototypeMap {
  const prototypes: CClassMethodPrototypeMap = new Map()

  for (const classMethod of collectClassMethods(context)) {
    const foundItems = prototypes.get(classMethod.info.name)
    let items: string[] = []

    if (foundItems !== null && typeof foundItems !== 'undefined') {
      items = foundItems
    }

    items.push(deps.emitClassMethodPrototype(classMethod.info, classMethod.method, context))
    prototypes.set(classMethod.info.name, items)
  }

  return prototypes
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
  emitClassConstructorDeclaration(info: CClassInfo, baseContext: CEmitContext): string[]
  emitClassMethodDeclaration(info: CClassInfo, method: AnyNode, baseContext: CEmitContext): string[]
  emitClassMethodHead(info: CClassInfo, method: AnyNode, context: CEmitContext): string
  emitClassMethodPrototype(info: CClassInfo, method: AnyNode, context: CEmitContext): string
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
  _plans: CModulePlan[],
  options: CModuleEmitOptions,
  diagnostics: Diagnostic[],
  deps: CModuleEmissionDependencies
): string {
  const irPrograms = [plan.ir]
  const functionEntries = collectCModuleFunctionNodeEntries(plan, irPrograms)
  const functions: AnyNode[] = []
  const context = createCModuleBaseContext(plan, diagnostics, deps)
  const runtimeRequirements = runtimeRequirementSetFromArray(collectIrRuntimeRequirements(irPrograms))
  const globalUsages = collectIrGlobalUsages(irPrograms)
  const syntaxFeatures = collectIrSyntaxFeatureUsages(irPrograms)
  const signatureRuntimeTypes = collectCModuleContextRuntimeTypes(context)
  const moduleValues = collectCModuleValueDeclarations(plan, context)
  addDateStringRuntimeRequirements(runtimeRequirements, irPrograms, context)
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

    if (importedModule === null || typeof importedModule === 'undefined') {
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
      prelude.needsClassDescriptorRuntime,
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
      prelude.needsRegexpRuntime,
      prelude.needsTimerRuntime,
      prelude.needsConsoleRuntime,
      prelude.needsDgramRuntime,
      prelude.needsFetchRuntime,
      prelude.needsHttpRuntime,
      prelude.needsNetRuntime,
      options
    )
  )

  pushCModuleLines(lines, emitCNativeClassDeclarations(context, collectCModuleClassMethodPrototypes(context, deps)))
  pushCModuleLines(lines, emitCClassDescriptorDeclarations(context))
  emitCModuleValueDefinitions(lines, moduleValues)
  emitCModuleValueFunctionFieldDefinitions(lines, moduleValues, context)

  const bodyLines: string[] = []

  for (const wrapper of context.asyncTaskWrappers.values()) {
    pushCModuleLines(bodyLines, emitAsyncTaskWrapperDeclaration(wrapper, context, deps.asyncTaskLoweringDependencies))
    bodyLines.push('')
  }

  for (const wrapper of context.callbackWrappers.values()) {
    if (wrapper.kind === 'plain-arrow') {
      pushCModuleLines(
        bodyLines,
        emitPlainArrowCallbackWrapperDeclaration(wrapper, context, deps.callbackLoweringDependencies)
      )
    } else {
      pushCModuleLines(
        bodyLines,
        emitRuntimeCallbackWrapperDeclaration(wrapper, context, deps.callbackLoweringDependencies)
      )
    }
    bodyLines.push('')
  }

  for (const wrapper of context.promiseChainWrappers.values()) {
    pushCModuleLines(
      bodyLines,
      emitPromiseChainCallbackWrapperDeclaration(wrapper, context, deps.promiseChainLoweringDependencies)
    )
    bodyLines.push('')
  }

  pushCModuleLines(
    bodyLines,
    emitNodeNetworkHandlerDeclarations(context, {
      dgram: deps.dgramLoweringDependencies,
      http: deps.httpLoweringDependencies,
      net: deps.netLoweringDependencies
    })
  )

  for (let functionIndex = 0; functionIndex < functions.length; functionIndex = functionIndex + 1) {
    const item = cModuleNodeAt(functions, functionIndex)

    pushCModuleLines(bodyLines, emitCModuleFunctionDeclaration(plan, item, context, deps))
    bodyLines.push('')
  }

  for (const classInfo of context.classInfos.values()) {
    pushCModuleLines(bodyLines, deps.emitClassConstructorDeclaration(classInfo, context))
    bodyLines.push('')
  }

  for (let methodIndex = 0; methodIndex < classMethods.length; methodIndex = methodIndex + 1) {
    const item = cModuleClassMethodAt(classMethods, methodIndex)
    const info = item.info
    const method = item.method

    pushCModuleLines(bodyLines, deps.emitClassMethodDeclaration(info, method, context))
    bodyLines.push('')
  }

  if (!plan.isEntry && plan.initName !== null && typeof plan.initName !== 'undefined') {
    pushCModuleLines(bodyLines, emitCModuleInitFunction(plan, context, deps))
  } else {
    pushCModuleLines(bodyLines, emitCModuleMainFunction(plan, context, deps))
  }

  emitCModuleDeclarations(lines, plan, functions, classMethods, context, deps)
  emitCModuleFunctionPointerAdapterDefinitions(lines, context)
  pushCModuleLines(lines, bodyLines)

  return joinCModuleLines(lines)
}

export function emitCModuleHeader(
  plan: CModulePlan,
  _plans: CModulePlan[],
  diagnostics: Diagnostic[],
  deps: CModuleEmissionDependencies
): string {
  const context = createCModuleBaseContext(plan, diagnostics, deps)
  const exportedFunctions = collectCModuleExportedFunctions(plan)
  const exportedValues = collectCModuleExportedValueDeclarations(plan)
  const lines: string[] = []

  lines.push(`#ifndef ${plan.headerGuard}`)
  lines.push(`#define ${plan.headerGuard}`)
  lines.push('')
  lines.push('#include "inox/value.h"')
  lines.push('#include "inox/loop.h"')
  lines.push('#include "inox/promise.h"')
  lines.push('')

  if (plan.initName !== null && typeof plan.initName !== 'undefined') {
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
  plan: CModulePlan,
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

  for (let wrapperIndex = 0; wrapperIndex < promiseChainCallbackWrappers.length; wrapperIndex = wrapperIndex + 1) {
    const wrapper = cModulePromiseChainWrapperAt(promiseChainCallbackWrappers, wrapperIndex)

    pushCModuleLines(lines, emitRuntimeArrowCallbackContextType(wrapper))
    lines.push('')
  }

  if (context.unhandledRejectionFlag !== null && typeof context.unhandledRejectionFlag !== 'undefined') {
    lines.push(`static int ${context.unhandledRejectionFlag} = 0;`)
    lines.push('')
  }

  for (let functionIndex = 0; functionIndex < functions.length; functionIndex = functionIndex + 1) {
    const item = cModuleNodeAt(functions, functionIndex)

    lines.push(emitCModuleFunctionPrototype(plan, item, context, deps))
  }

  for (let methodIndex = 0; methodIndex < classMethods.length; methodIndex = methodIndex + 1) {
    const item = cModuleClassMethodAt(classMethods, methodIndex)

    if (!item.info.native) {
      lines.push(deps.emitClassMethodPrototype(item.info, item.method, context))
    }
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

  pushCModuleLines(lines, emitNodeNetworkHandlerPrototypeLines(context))

  if (
    functions.length > 0 ||
    classMethods.length > 0 ||
    context.asyncTaskWrappers.size > 0 ||
    context.callbackWrappers.size > 0 ||
    context.promiseChainWrappers.size > 0 ||
    hasNodeNetworkHandlers(context)
  ) {
    lines.push('')
  }
}

function emitCModuleFunctionPrototype(
  plan: CModulePlan,
  statement: AnyNode,
  context: CEmitContext,
  deps: CModuleEmissionDependencies
): string {
  const head = deps.emitFunctionHead(statement, context)

  if (isCModuleExportedFunction(plan, statement.name)) {
    return `${head};`
  }

  return `static ${head};`
}

function emitCModuleFunctionDeclaration(
  plan: CModulePlan,
  statement: AnyNode,
  context: CEmitContext,
  deps: CModuleEmissionDependencies
): string[] {
  const lines = deps.emitFunctionDeclaration(statement, context)

  if (isCModuleExportedFunction(plan, statement.name)) {
    return lines
  }

  return prefixCModuleFunctionDeclarationStatic(lines)
}

function prefixCModuleFunctionDeclarationStatic(lines: string[]): string[] {
  const prefixed: string[] = []

  for (let index = 0; index < lines.length; index = index + 1) {
    const line = lines[index]

    if (index === 0 && !line.startsWith('static ')) {
      prefixed.push(`static ${line}`)
      continue
    }

    prefixed.push(line)
  }

  return prefixed
}

function isCModuleExportedFunction(plan: CModulePlan, name: string): boolean {
  for (
    let declarationIndex = 0;
    declarationIndex < plan.ir.functionDeclarations.length;
    declarationIndex = declarationIndex + 1
  ) {
    const declaration = cModuleFunctionDeclarationAt(plan.ir.functionDeclarations, declarationIndex)

    if (declaration.name === name) {
      return declaration.exported
    }
  }

  return false
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
  const targetArgs = emitFunctionPointerAdapterTargetArgs(
    adapter,
    expectedNames,
    targetNames,
    moduleObjectFunctionFields,
    targetFunctionType
  )

  for (const name of expectedNames) {
    if (!targetNameSet.has(name)) {
      lines.push(`  (void)${name};`)
    }
  }

  if (isThrowingFunctionPointerAdapterTarget(adapter, context)) {
    pushCModuleLines(lines, emitThrowingFunctionPointerAdapterTargetCall(adapter, targetArgs, targetFunctionType))
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

  if (adapter.target.startsWith('inox_mod_')) {
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

  for (const sourceName of cFunctionPointerAdapterTargetSourceNames(adapter, context)) {
    const functionType = functionPointerAdapterContextFunctionType(sourceName, context)

    if (functionType !== null) {
      return functionType
    }
  }

  return adapter.targetFunctionType
}

function functionPointerAdapterContextFunctionType(name: string, context: CEmitContext): CFunctionType | null {
  const params = context.functionParams.get(name)
  const returnType = context.functionReturnTypes.get(name)

  if (params === null || typeof params === 'undefined' || returnType === null || typeof returnType === 'undefined') {
    return null
  }

  const returnMapType = context.functionReturnMapTypes.get(name)
  let returnMapKeyType: string | null = null
  let returnMapValueType: string | null = null

  if (returnMapType !== null && typeof returnMapType !== 'undefined') {
    returnMapKeyType = returnMapType.key
    returnMapValueType = returnMapType.value
  }

  return {
    kind: 'function',
    params,
    returnArrayElementType: context.functionReturnArrayElementTypes.get(name) ?? null,
    returnMapKeyType,
    returnMapValueType,
    returnNullable: context.functionReturnNullables.get(name) === true,
    returnPromiseValueType: context.functionReturnPromiseValueTypes.get(name) ?? null,
    returnSetElementType: context.functionReturnSetElementTypes.get(name) ?? null,
    returnShape: context.functionReturnShapes.get(name) ?? null,
    returnType
  }
}

function isPlainArrowFunctionPointerAdapterTarget(adapter: CFunctionPointerAdapter, context: CEmitContext): boolean {
  for (const wrapper of context.callbackWrappers.values()) {
    if (wrapper.kind === 'plain-arrow' && wrapper.name === adapter.target) {
      return true
    }
  }

  if (adapter.target.startsWith('inox_callback_arrow_')) {
    return true
  }

  return false
}

function isThrowingFunctionPointerAdapterTarget(adapter: CFunctionPointerAdapter, context: CEmitContext): boolean {
  for (const sourceName of cFunctionPointerAdapterTargetSourceNames(adapter, context)) {
    if (context.throwingFunctions.has(sourceName)) {
      return true
    }
  }

  return false
}

function cFunctionPointerAdapterTargetSourceNames(
  adapter: CFunctionPointerAdapter,
  context: CEmitContext
): string[] {
  const names: string[] = []

  for (const name of context.functionNames.keys()) {
    const target = context.functionNames.get(name)

    if (target === adapter.target) {
      names.push(name)
    }
  }

  return names
}

function emitThrowingFunctionPointerAdapterTargetCall(
  adapter: CFunctionPointerAdapter,
  targetArgs: string[],
  targetFunctionType: CFunctionType | null | undefined
): string[] {
  const lines: string[] = []
  const callArgs: string[] = []
  const adapterReturnType = emitFunctionPointerReturnType(adapter.functionType)
  const returnType = emitFunctionPointerReturnType(targetFunctionType)

  for (const arg of targetArgs) {
    callArgs.push(arg)
  }

  if (returnType !== 'void') {
    lines.push(`${returnType} inox_adapter_result = ${cFunctionPointerAdapterDefaultReturnValue(returnType)};`)
    callArgs.push('&inox_adapter_result')
  }

  lines.push('inox_value inox_adapter_error = inox_undefined_value();')
  callArgs.push('&inox_adapter_error')
  lines.push(`inox_status inox_adapter_status = ${adapter.target}(${joinStrings(callArgs, ', ')});`)
  lines.push('if (inox_adapter_status != INOX_OK) {')
  lines.push('  inox_release(inox_adapter_error);')

  if (adapterReturnType === 'void') {
    lines.push('  return;')
  } else {
    lines.push(`  return ${throwingFunctionPointerAdapterReturnExpression(adapterReturnType, returnType)};`)
  }

  lines.push('}')
  lines.push('inox_release(inox_adapter_error);')

  if (adapterReturnType !== 'void') {
    lines.push(`return ${throwingFunctionPointerAdapterReturnExpression(adapterReturnType, returnType)};`)
  }

  return lines
}

function throwingFunctionPointerAdapterReturnExpression(adapterReturnType: string, targetReturnType: string): string {
  if (targetReturnType !== 'void') {
    return 'inox_adapter_result'
  }

  return cFunctionPointerAdapterDefaultReturnValue(adapterReturnType)
}

function cFunctionPointerAdapterDefaultReturnValue(returnType: string): string {
  if (returnType === 'inox_value') {
    return 'inox_undefined_value()'
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
  moduleObjectFunctionFields: Set<string>,
  targetFunctionType: CFunctionType | null | undefined
): string[] {
  const expectedNameSet = stringSetFromArray(expectedNames)
  const args: string[] = []

  for (const name of targetNames) {
    if (expectedNameSet.has(name)) {
      args.push(name)
      continue
    }

    const moduleObjectFunctionField = emitFunctionPointerAdapterModuleObjectFieldArg(name, moduleObjectFunctionFields)

    if (moduleObjectFunctionField !== null && typeof moduleObjectFunctionField !== 'undefined') {
      args.push(moduleObjectFunctionField)
      continue
    }

    const defaultArg = emitFunctionPointerAdapterDefaultTargetArg(name, adapter, targetFunctionType)

    if (defaultArg !== null && typeof defaultArg !== 'undefined') {
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

    if (fields !== null && typeof fields !== 'undefined') {
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

function emitFunctionPointerAdapterModuleObjectFieldArg(
  name: string,
  moduleObjectFunctionFields: Set<string>
): string | null {
  const prefix = 'inox_objfn_inox_arg_'

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

  const candidate = `inox_objfn_${name.slice(index + 1)}`

  if (moduleObjectFunctionFields.has(candidate)) {
    return candidate
  }

  return null
}

function emitFunctionPointerAdapterDefaultTargetArg(
  name: string,
  adapter: CFunctionPointerAdapter,
  targetFunctionType: CFunctionType | null | undefined
): string | null {
  if (targetFunctionType === null || typeof targetFunctionType === 'undefined') {
    return null
  }

  for (
    let index = adapter.functionType.params.length;
    index < targetFunctionType.params.length;
    index = index + 1
  ) {
    if (name !== `inox_arg_${index}`) {
      continue
    }

    const param = targetFunctionType.params[index]

    if (param.optional !== true && (param.defaultValue === null || typeof param.defaultValue === 'undefined')) {
      return null
    }

    return emitFunctionPointerAdapterDefaultParamValue(param)
  }

  return null
}

function emitFunctionPointerAdapterDefaultParamValue(param: CFunctionParam): string {
  const value = param.defaultValue

  if (value !== null && typeof value !== 'undefined') {
    if (value.type === 'NullLiteral') {
      return 'inox_null_value()'
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
    return 'inox_undefined_value()'
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
  const inferredFunctionEffects = collectIrFunctionEffectsWithExternalEffects(irPrograms, importedEffects, true)
  const storedFunctionEffects = collectIrStoredFunctionEffects(irPrograms)
  const functionEffects = mergeIrFunctionEffects(inferredFunctionEffects, storedFunctionEffects)

  for (let effectIndex = 0; effectIndex < importedEffects.length; effectIndex = effectIndex + 1) {
    const effect = cModuleFunctionEffectAt(importedEffects, effectIndex)

    pushIrFunctionEffect(functionEffects, effect)
  }

  const context = deps.createBaseContext(diagnostics, functionDeclarations, functionEffects, jsGlobalRoots, ir.body)
  context.processEntryPath = plan.record.path

  registerCModuleValueDeclarations(context, plan)
  registerImportedCModuleValueDeclarations(context, plan)

  registerNodeStdlibRuntimeImportNames(context, irPrograms)
  context.functionNames = createCModuleFunctionNames(plan)
  const classNodes = collectIrTopLevelNodes(ir, 'class')

  context.classInfos = createClassInfos(classNodes, diagnostics)
  context.externalEventLoopFunctions = deps.collectExternalEventLoopFunctions(functions)
  context.callbackWrappers = collectCallbackWrappers(irPrograms, context, deps.callbackLoweringDependencies)
  context.promiseChainWrappers = collectPromiseChainWrappers(irPrograms, context, deps.promiseChainLoweringDependencies)
  context.asyncTaskWrappers = collectAsyncTaskWrappers(functionEntries, context, deps.asyncTaskLoweringDependencies)
  collectNodeNetworkHandlers(irPrograms, context)

  return context
}

function collectCModuleContextRuntimeTypes(context: CModuleRuntimeTypeContext): Set<string> {
  const types: Set<string> = new Set()

  for (const valueType of context.functionReturnTypes.values()) {
    addCModuleRuntimeType(types, valueType)
  }

  for (const valueType of context.moduleValueTypes.values()) {
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
  if (
    valueType === 'unknown' ||
    isManagedRuntimeReturnType(valueType) ||
    isOpaqueRuntimeValueType(valueType) ||
    valueType === 'promise'
  ) {
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

  if (
    param.valueType === 'object' &&
    param.shape !== null &&
    typeof param.shape !== 'undefined' &&
    param.shape.fields !== null &&
    typeof param.shape.fields !== 'undefined'
  ) {
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

    if (
      field.valueType === 'object' &&
      field.shape !== null &&
      typeof field.shape !== 'undefined' &&
      field.shape.fields !== null &&
      typeof field.shape.fields !== 'undefined'
    ) {
      collectCModuleObjectShapeRuntimeTypes(types, field.shape.fields, seen)
    }
  }

  seen.delete(fields)
}

function registerCModuleValueDeclarations(context: CEmitContext, plan: CModulePlan): void {
  const values = collectCModuleValueDeclarations(plan, context)

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

    if (importedModule === null || typeof importedModule === 'undefined') {
      continue
    }

    const importDeclaration = item.declaration

    if (importDeclaration === null || typeof importDeclaration === 'undefined') {
      continue
    }

    const specifiersValue = importDeclaration.specifiers

    if (specifiersValue === null || typeof specifiersValue === 'undefined') {
      continue
    }

    const specifiers: CModuleNode[] = specifiersValue

    for (let specifierIndex = 0; specifierIndex < specifiers.length; specifierIndex = specifierIndex + 1) {
      const specifier = cModuleNodeAt(specifiers, specifierIndex)
      const exported = importedModule.record.exports.get(specifier.imported)

      if (exported === null || typeof exported === 'undefined' || exported.type !== 'VariableDeclaration') {
        continue
      }

      const localName = cModuleImportedBindingName(importDeclaration, specifier)
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

function collectCModuleValueDeclarations(plan: CModulePlan, context?: CEmitContext): CModuleValueDeclaration[] {
  const values: CModuleValueDeclaration[] = []
  const ir = plan.ir
  const statements = collectIrTopLevelNodes(ir, 'statement')

  for (let index = 0; index < statements.length; index = index + 1) {
    const item = cModuleNodeAt(statements, index)

    if (item.type !== 'VariableDeclaration') {
      continue
    }

    if (
      context !== null &&
      typeof context !== 'undefined' &&
      item.valueType === 'regexp' &&
      item.init !== null &&
      typeof item.init !== 'undefined'
    ) {
      context.regexpLiterals.set(item.name, item.init)
    }

    values.push({
      exported: item.exported === true,
      functionType: cModuleValueFunctionType(item),
      name: item.name,
      symbolName: emitCModuleValueName(plan, item.name),
      valueType: cModuleValueType(item, context)
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
    const functionPointerDefinition = cModuleFunctionPointerDefinition(item)

    if (functionPointerDefinition !== null && typeof functionPointerDefinition !== 'undefined') {
      lines.push(functionPointerDefinition)
      continue
    }

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

function cModuleFunctionPointerDefinition(item: CModuleValueDeclaration): string | null {
  if (item.valueType !== 'function') {
    return null
  }

  const functionType = item.functionType
  let prefix = ''

  if (item.exported !== true) {
    prefix = 'static '
  }

  return `${prefix}${emitFunctionPointerReturnType(functionType)} (*${item.symbolName})(${emitFunctionPointerParams(
    functionType,
    [],
    []
  )}) = 0;`
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

    if (fields === null || typeof fields === 'undefined') {
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
        lines.push(`static inox_value ${name};`)
        emitted = true
      }
    } else if (
      field.valueType === 'object' &&
      field.shape !== null &&
      typeof field.shape !== 'undefined' &&
      field.shape.fields !== null &&
      typeof field.shape.fields !== 'undefined'
    ) {
      if (
        field.declaredType !== null &&
        typeof field.declaredType !== 'undefined' &&
        seenTypes.includes(field.declaredType)
      ) {
        continue
      }

      let pushedType = false

      if (field.declaredType !== null && typeof field.declaredType !== 'undefined') {
        seenTypes.push(field.declaredType)
        pushedType = true
      }

      if (
        emitCModuleObjectFunctionFieldDefinitions(lines, `${objectName}_${field.name}`, field.shape.fields, seenTypes)
      ) {
        emitted = true
      }

      if (pushedType) {
        seenTypes.pop()
      }
    }
  }

  return emitted
}

function cModuleValueType(node: AnyNode, context?: CEmitContext): string {
  const valueType = node.valueType
  const timeValueType = cModuleTimeExpressionValueType(node.init)
  const classValueType = cModuleNativeClassValueType(node, context)

  if (classValueType !== null && typeof classValueType !== 'undefined') {
    return classValueType
  }

  if (
    timeValueType !== null &&
    typeof timeValueType !== 'undefined' &&
    (valueType === null ||
      typeof valueType === 'undefined' ||
      valueType === '' ||
      valueType === 'unknown' ||
      valueType === 'object' ||
      valueType === timeValueType)
  ) {
    return timeValueType
  }

  if (valueType === null || typeof valueType === 'undefined' || valueType === '') {
    return 'unknown'
  }

  if (valueType === 'function' && cModuleFunctionValueUsesRuntimeCallback(node, context)) {
    return 'unknown'
  }

  if (isUnionValueTypeName(valueType)) {
    return 'unknown'
  }

  if (node.nullable === true && isRuntimeNullableType(valueType)) {
    return 'unknown'
  }

  if (valueType === 'string' && isCModuleRuntimeStringInitializer(node.init)) {
    return 'unknown'
  }

  return valueType
}

function cModuleNativeClassValueType(node: AnyNode, context: CEmitContext | null | undefined): string | null {
  if (context === null || typeof context === 'undefined') {
    return null
  }

  let className: string | null = null

  if (node.className !== null && typeof node.className !== 'undefined') {
    className = node.className
  } else if (
    node.init !== null &&
    typeof node.init !== 'undefined' &&
    node.init.className !== null &&
    typeof node.init.className !== 'undefined'
  ) {
    className = node.init.className
  }

  if (className === null || typeof className === 'undefined') {
    return null
  }

  const info = context.classInfos.get(className)

  if (info === null || typeof info === 'undefined' || !info.native) {
    return null
  }

  return cClassValueTypeName(className)
}

function cModuleTimeExpressionValueType(expression: AnyNode | null | undefined): string | null {
  const method = cModuleTimeExpressionMethod(expression)

  if (method === null || typeof method === 'undefined') {
    return null
  }

  if (method === 'dateConstructor') {
    return 'date'
  }

  const dateReturnType = dateInstanceRuntimeMethodReturnType(method)

  if (dateReturnType !== null && typeof dateReturnType !== 'undefined') {
    return dateReturnType
  }

  return 'number'
}

function cModuleTimeExpressionMethod(expression: AnyNode | null | undefined): string | null {
  if (expression === null || typeof expression === 'undefined') {
    return null
  }

  const method = nullableString(expression.timeRuntimeMethod)

  if (method !== null && typeof method !== 'undefined') {
    return method
  }

  if (expression.type === 'NewExpression') {
    return dateConstructorRuntimeMethodNameFromPath(memberExpressionPath(expression.callee))
  }

  if (expression.type === 'CallExpression') {
    const path = memberExpressionPath(expression.callee)
    const callMethod = timeRuntimeMethodNameFromPath(path)

    if (callMethod !== null && typeof callMethod !== 'undefined') {
      return callMethod
    }

    return dateConstructorRuntimeMethodNameFromPath(path)
  }

  return null
}

function nullableString(value: string | null | undefined): string | null {
  if (value === null || typeof value === 'undefined') {
    return null
  }

  return value
}

function cModuleValueFunctionType(node: AnyNode): CFunctionType | null {
  if (node.functionType !== null && typeof node.functionType !== 'undefined') {
    return node.functionType
  }

  if (
    node.init !== null &&
    typeof node.init !== 'undefined' &&
    node.init.functionType !== null &&
    typeof node.init.functionType !== 'undefined'
  ) {
    return node.init.functionType
  }

  return null
}

function cModuleFunctionValueUsesRuntimeCallback(node: AnyNode, context?: CEmitContext): boolean {
  if (cModuleValueIsGenericFunctionDeclaration(node)) {
    return true
  }

  if (
    context !== null &&
    typeof context !== 'undefined' &&
    node.init !== null &&
    typeof node.init !== 'undefined' &&
    node.init.type === 'ArrowFunctionExpression'
  ) {
    const wrapper = context.callbackArrowWrappers.get(node.init)

    return wrapper !== null && typeof wrapper !== 'undefined' && wrapper.kind === 'arrow'
  }

  return isNullableFunctionType(node.valueType, node.nullable) || isRuntimeFunctionType(node.functionType)
}

function cModuleValueIsGenericFunctionDeclaration(node: AnyNode): boolean {
  return (
    node.declaredType === 'Function' ||
    node.declaredType === 'function' ||
    node.inferredDeclaredType === 'Function' ||
    node.inferredDeclaredType === 'function'
  )
}

function isCModuleRuntimeStringInitializer(expression: AnyNode | null | undefined): boolean {
  if (expression === null || typeof expression === 'undefined') {
    return false
  }

  if (expression.type === 'AwaitExpression') {
    return true
  }

  if (
    expression.type === 'CallExpression' &&
    expression.fsRuntimeMethod !== null &&
    typeof expression.fsRuntimeMethod !== 'undefined'
  ) {
    return true
  }

  if (
    (expression.type === 'ConditionalExpression' || expression.type === 'BinaryExpression') &&
    expression.valueType === 'string'
  ) {
    return true
  }

  return expression.type === 'TemplateLiteral' && expression.raw.includes('${')
}

function isUnionValueTypeName(valueType: string): boolean {
  return valueType.startsWith('union<')
}

function cModuleValueCType(valueType: string): string {
  const className = cClassNameFromValueType(valueType)

  if (className !== null && typeof className !== 'undefined') {
    return emitCClassTypeName(className)
  }

  if (valueType === 'string') {
    return 'char*'
  }

  if (valueType === 'unknown') {
    return 'inox_value'
  }

  return emitCType(valueType)
}

function cModuleValueGlobalInitializer(valueType: string): string {
  if (cClassNameFromValueType(valueType) !== null) {
    return ''
  }

  if (valueType === 'string') {
    return '""'
  }

  if (valueType === 'regexp') {
    return '{ 0, 0 }'
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
  context.moduleValueDeclarationScope = true
  const bodyLines: string[] = []
  pushIndentedCModuleLines(bodyLines, initCalls)
  pushIndentedCModuleLines(bodyLines, deps.emitStatementList(body, context))
  pushIndentedCModuleLines(bodyLines, emitEventLoopDrain(context))
  const lines: string[] = []

  lines.push(`void ${plan.initName}(void) {`)
  lines.push('  static bool inox_initialized = false;')
  lines.push('  if (inox_initialized) return;')
  lines.push('  inox_initialized = true;')
  pushIndentedCModuleLines(lines, emitLoopFlowDeclarations(context))
  pushIndentedCModuleLines(lines, emitReturnValueDeclarations(context))
  pushIndentedCModuleLines(lines, emitReturnFlowDeclarations(context))
  pushIndentedCModuleLines(lines, emitEventLoopDeclarations(context))
  pushIndentedCModuleLines(lines, emitOwnedValueDeclarations(context))
  pushIndentedCModuleLines(lines, emitOwnedPromiseDeclarations(context))
  pushIndentedCModuleLines(lines, emitErrorChannelDeclarations(context))
  pushIndentedCModuleLines(lines, emitBoxedValueDeclarations(context))
  pushIndentedCModuleLines(lines, emitEventLoopInit(context))
  pushScopedCModuleBody(lines, bodyLines)

  if (shouldEmitCleanupLabel(context)) {
    lines.push('inox_cleanup:')
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
  context.moduleValueDeclarationScope = true
  const bodyLines: string[] = []
  pushIndentedCModuleLines(bodyLines, initCalls)
  pushIndentedCModuleLines(bodyLines, deps.emitStatementList(body, context))
  pushIndentedCModuleLines(bodyLines, emitEventLoopDrain(context))
  const lines: string[] = []

  if (context.processRuntime) {
    lines.push('int main(int argc, char** argv) {')
  } else {
    lines.push('int main(void) {')
  }

  if (context.processRuntime) {
    lines.push(`  inox_process_init_with_entry(argc, argv, ${cStringLiteral(plan.record.path)});`)
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
  pushScopedCModuleBody(lines, bodyLines)

  if (shouldEmitCleanupLabel(context)) {
    lines.push('inox_cleanup:')
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

    if (importedModule === null || typeof importedModule === 'undefined') {
      continue
    }

    if (importedModule.initName !== null && typeof importedModule.initName !== 'undefined') {
      calls.push(`${importedModule.initName}();`)
    }
  }

  return calls
}

function collectCModuleFunctionNodeEntries(plan: CModulePlan, programs: IrProgram[]): CModuleFunctionNodeEntry[] {
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
    const importDeclaration = item.declaration

    if (importDeclaration === null || typeof importDeclaration === 'undefined') {
      continue
    }

    const specifiersValue = importDeclaration.specifiers

    if (specifiersValue === null || typeof specifiersValue === 'undefined') {
      continue
    }

    const specifiers: CModuleNode[] = specifiersValue

    for (let specifierIndex = 0; specifierIndex < specifiers.length; specifierIndex = specifierIndex + 1) {
      const specifier = cModuleNodeAt(specifiers, specifierIndex)
      const localName = cModuleImportedBindingName(importDeclaration, specifier)

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

  if (expression === null || typeof expression === 'undefined' || expression.type !== 'CallExpression') {
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

    if (importedModule === null || typeof importedModule === 'undefined') {
      continue
    }

    const importDeclaration = item.declaration

    if (importDeclaration === null || typeof importDeclaration === 'undefined') {
      continue
    }

    const specifiersValue = importDeclaration.specifiers

    if (specifiersValue === null || typeof specifiersValue === 'undefined') {
      continue
    }

    const specifiers: CModuleNode[] = specifiersValue

    for (let specifierIndex = 0; specifierIndex < specifiers.length; specifierIndex = specifierIndex + 1) {
      const specifier = cModuleNodeAt(specifiers, specifierIndex)
      const declaration = findCModuleExportedFunctionDeclaration(
        importedModule.ir.functionDeclarations,
        specifier.imported
      )

      if (declaration !== null && typeof declaration !== 'undefined') {
        const localName = cModuleImportedBindingName(importDeclaration, specifier)
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

  if (cached !== null && typeof cached !== 'undefined') {
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

    if (importedModule === null || typeof importedModule === 'undefined') {
      continue
    }

    const importDeclaration = item.declaration

    if (importDeclaration === null || typeof importDeclaration === 'undefined') {
      continue
    }

    const specifiersValue = importDeclaration.specifiers

    if (specifiersValue === null || typeof specifiersValue === 'undefined') {
      continue
    }

    const specifiers: CModuleNode[] = specifiersValue

    for (let specifierIndex = 0; specifierIndex < specifiers.length; specifierIndex = specifierIndex + 1) {
      const specifier = cModuleNodeAt(specifiers, specifierIndex)
      const sourceEffects = collectCModulePlanFunctionEffectsWithVisited(importedModule, visiting, cache)

      for (let effectIndex = 0; effectIndex < sourceEffects.length; effectIndex = effectIndex + 1) {
        const effect = cModuleFunctionEffectAt(sourceEffects, effectIndex)
        const effectName: string = effect.name
        const importedName: string = specifier.imported

        if (effectName === importedName) {
          const localName = cModuleImportedBindingName(importDeclaration, specifier)
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

  for (let functionIndex = 0; functionIndex < localFunctionNodes.length; functionIndex = functionIndex + 1) {
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

    if (importedModule === null || typeof importedModule === 'undefined') {
      continue
    }

    const importDeclaration = item.declaration

    if (importDeclaration === null || typeof importDeclaration === 'undefined') {
      continue
    }

    const specifiersValue = importDeclaration.specifiers

    if (specifiersValue === null || typeof specifiersValue === 'undefined') {
      continue
    }

    const specifiers: CModuleNode[] = specifiersValue

    for (let specifierIndex = 0; specifierIndex < specifiers.length; specifierIndex = specifierIndex + 1) {
      const specifier = cModuleNodeAt(specifiers, specifierIndex)
      const importedBindingName = cModuleImportedBindingName(importDeclaration, specifier)
      const importedFunctionName = emitCModuleFunctionName(importedModule, specifier.imported)

      if (!localNames.has(importedBindingName)) {
        names.set(importedBindingName, importedFunctionName)
      }

      if (importDeclaration.type !== 'ExportDeclaration') {
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
