import { throwDiagnostics } from '../diagnostics.ts'
import {
  collectIrFunctionDeclarations,
  collectIrFunctionEffectsWithExternalEffects,
  collectIrFunctionNodeEntries,
  collectIrGlobalRoots,
  collectIrGlobalUsages,
  collectIrRuntimeRequirements,
  collectIrStoredFunctionEffects,
  collectIrSyntaxFeatureUsages,
  collectIrTopLevelNodesFromPrograms,
  irClassMethodEffectName,
  mergeIrFunctionEffects
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
import type {
  CAsyncTaskWrapperMap,
  CCallbackWrapperMap,
  CDgramMessageHandlerMap,
  CEmitContext,
  CHttpHandlerMap,
  CNetHandlerMap,
  CPromiseChainWrapperMap
} from './context.ts'
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
import type { ArrayLoweringDependencies } from './values/arrays.ts'
import { collectClassMethods, createClassInfos } from './values/classes.ts'
import type { ClassLoweringDependencies } from './values/classes.ts'
import type { CollectionLoweringDependencies } from './values/collections.ts'
import type { NullableLoweringDependencies } from './values/nullable.ts'
import type { StatementLoweringDependencies } from './values/statements.ts'
import type { StringLoweringDependencies } from './values/strings.ts'

export type CUnitDependencies = {
  arrayLoweringDependencies: ArrayLoweringDependencies
  asyncTaskLoweringDependencies: AsyncTaskLoweringDependencies
  callbackLoweringDependencies: CallbackLoweringDependencies
  classLoweringDependencies: ClassLoweringDependencies
  collectExternalEventLoopFunctions: (functions: AnyNode[]) => Set<string>
  collectionLoweringDependencies: CollectionLoweringDependencies
  createBaseContext(
    diagnostics: Diagnostic[],
    functionDeclarations: IrFunctionDeclaration[],
    functionEffects: IrFunctionEffect[],
    jsGlobalRoots: Set<string>,
    topLevelNodes: AnyNode[]
  ): CEmitContext
  dgramLoweringDependencies: DgramLoweringDependencies
  emitClassMethodDeclaration: (info: CClassInfo, method: AnyNode, baseContext: CEmitContext) => string[]
  emitClassMethodHead: (info: CClassInfo, method: AnyNode, context: CEmitContext) => string
  emitFunctionDeclaration: (statement: AnyNode, baseContext: CEmitContext) => string[]
  emitFunctionHead: (statement: AnyNode, context: CEmitContext) => string
  emitMainWrapper: (irPrograms: IrProgram[], baseContext: CEmitContext) => string[]
  httpLoweringDependencies: HttpLoweringDependencies
  netLoweringDependencies: NetLoweringDependencies
  nullableLoweringDependencies: NullableLoweringDependencies
  promiseChainLoweringDependencies: PromiseChainLoweringDependencies
  statementLoweringDependencies: StatementLoweringDependencies
  stringLoweringDependencies: StringLoweringDependencies
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

function collectCUnitTopLevelNodes(programs: IrProgram[]): AnyNode[] {
  const nodes: AnyNode[] = []

  for (let programIndex = 0; programIndex < programs.length; programIndex = programIndex + 1) {
    const program = programs[programIndex]

    for (let nodeIndex = 0; nodeIndex < program.body.length; nodeIndex = nodeIndex + 1) {
      nodes.push(program.body[nodeIndex])
    }
  }

  return nodes
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

function unitNodeAt(values: AnyNode[], index: number): AnyNode {
  return values[index]
}

function unitStringAt(values: string[], index: number): string {
  return values[index]
}

function pushCUnitClassMethodFunctionDeclarations(
  target: IrFunctionDeclaration[],
  classes: AnyNode[]
): void {
  for (let classIndex = 0; classIndex < classes.length; classIndex = classIndex + 1) {
    const classNode = unitNodeAt(classes, classIndex)
    const methods: AnyNode[] = classNode.methods

    for (let methodIndex = 0; methodIndex < methods.length; methodIndex = methodIndex + 1) {
      const method = unitNodeAt(methods, methodIndex)

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
  const globalUsages = collectIrGlobalUsages(irPrograms)
  const globalRoots = collectIrGlobalRoots(irPrograms)
  const runtimeRequirements = runtimeRequirementSetFromArray(collectIrRuntimeRequirements(irPrograms))
  const syntaxFeatures = collectIrSyntaxFeatureUsages(irPrograms)
  const classes = collectIrTopLevelNodesFromPrograms(irPrograms, 'class')
  pushCUnitClassMethodFunctionDeclarations(functionDeclarations, classes)
  const externalFunctionEffects: IrFunctionEffect[] = []
  const inferredFunctionEffects = collectIrFunctionEffectsWithExternalEffects(irPrograms, externalFunctionEffects, true)
  const storedFunctionEffects = collectIrStoredFunctionEffects(irPrograms)
  const functionEffects = mergeIrFunctionEffects(inferredFunctionEffects, storedFunctionEffects)
  const topLevelNodes = collectCUnitTopLevelNodes(irPrograms)
  const jsGlobalRoots = stringSetFromArray(globalRoots)
  const baseContext = deps.createBaseContext(
    diagnostics,
    functionDeclarations,
    functionEffects,
    jsGlobalRoots,
    topLevelNodes
  )
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
  baseContext.netConnectNames = collectRuntimeImportNames(
    irPrograms,
    new Set(['net', 'node:net']),
    new Set(['connect', 'createConnection'])
  )
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
  const needsRuntime: boolean = preludeRequirements.needsRuntime
  const needsTimeRuntime: boolean = preludeRequirements.needsTimeRuntime
  const needsMathRuntime: boolean = preludeRequirements.needsMathRuntime
  const needsCryptoRuntime: boolean = preludeRequirements.needsCryptoRuntime
  const needsDebugMemoryRuntime: boolean = preludeRequirements.needsDebugMemoryRuntime
  const needsAsyncRuntime: boolean = preludeRequirements.needsAsyncRuntime
  const needsCallbackRuntime: boolean = preludeRequirements.needsCallbackRuntime
  const needsStringHeader: boolean = preludeRequirements.needsStringHeader
  const needsCollectionRuntime: boolean = preludeRequirements.needsCollectionRuntime
  const needsBinaryRuntime: boolean = preludeRequirements.needsBinaryRuntime
  const needsObjectRuntime: boolean = preludeRequirements.needsObjectRuntime
  const needsChildProcessRuntime: boolean = preludeRequirements.needsChildProcessRuntime
  const needsFsRuntime: boolean = preludeRequirements.needsFsRuntime
  const needsOsRuntime: boolean = preludeRequirements.needsOsRuntime
  const needsPathRuntime: boolean = preludeRequirements.needsPathRuntime
  const needsUrlRuntime: boolean = preludeRequirements.needsUrlRuntime
  const needsProcessRuntime: boolean = preludeRequirements.needsProcessRuntime
  const needsJsonRuntime: boolean = preludeRequirements.needsJsonRuntime
  const needsTimerRuntime: boolean = preludeRequirements.needsTimerRuntime
  const needsConsoleRuntime: boolean = preludeRequirements.needsConsoleRuntime
  const needsDgramRuntime: boolean = preludeRequirements.needsDgramRuntime
  const needsFetchRuntime: boolean = preludeRequirements.needsFetchRuntime
  const needsHttpRuntime: boolean = preludeRequirements.needsHttpRuntime
  const needsNetRuntime: boolean = preludeRequirements.needsNetRuntime
  baseContext.processRuntime = needsProcessRuntime
  if (needsAsyncRuntime) {
    baseContext.unhandledRejectionFlag = 'inox_unhandled_rejection'
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
  const callbackWrappers: CCallbackWrapperMap = baseContext.callbackWrappers
  const promiseChainWrappers: CPromiseChainWrapperMap = baseContext.promiseChainWrappers
  const asyncTaskWrappers: CAsyncTaskWrapperMap = baseContext.asyncTaskWrappers
  const dgramMessageHandlers: CDgramMessageHandlerMap = baseContext.dgramMessageHandlers
  const httpHandlers: CHttpHandlerMap = baseContext.httpHandlers
  const netHandlers: CNetHandlerMap = baseContext.netHandlers

  for (const wrapper of callbackWrappers.values()) {
    if (wrapper.kind === 'arrow' && isRuntimeArrowCallbackWrapperWithContext(wrapper)) {
      arrowCallbackWrappers.push(wrapper)
    }
  }

  for (const wrapper of promiseChainWrappers.values()) {
    if (isPromiseChainCallbackWrapperWithContext(wrapper)) {
      promiseChainCallbackWrappers.push(wrapper)
    }
  }

  for (const wrapper of asyncTaskWrappers.values()) {
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

  for (const wrapper of asyncTaskWrappers.values()) {
    pushUnitLines(lines, emitAsyncTaskWrapperPrototypes(wrapper))
  }

  for (const wrapper of callbackWrappers.values()) {
    if (wrapper.kind === 'plain-arrow') {
      lines.push(`${emitPlainArrowCallbackWrapperHead(wrapper)};`)
      continue
    }

    if (wrapper.kind === 'arrow' && isRuntimeArrowCallbackWrapperWithContext(wrapper)) {
      lines.push(`static void ${wrapper.finalizerName}(void* context);`)
    }

    lines.push(`${emitRuntimeCallbackWrapperHead(wrapper)};`)
  }

  for (const wrapper of promiseChainWrappers.values()) {
    if (isPromiseChainCallbackWrapperWithContext(wrapper)) {
      lines.push(`static void ${wrapper.finalizerName}(void* context);`)
    }

    lines.push(`${emitPromiseChainCallbackWrapperHead(wrapper)};`)
  }

  for (const wrapper of dgramMessageHandlers.values()) {
    lines.push(`${emitDgramMessageHandlerHead(wrapper)};`)
  }

  for (const wrapper of httpHandlers.values()) {
    lines.push(`${emitHttpHandlerHead(wrapper)};`)
  }

  for (const wrapper of netHandlers.values()) {
    lines.push(`${emitNetHandlerHead(wrapper)};`)
  }

  if (
    functions.length > 0 ||
    classMethods.length > 0 ||
    asyncTaskWrappers.size > 0 ||
    callbackWrappers.size > 0 ||
    promiseChainWrappers.size > 0 ||
    dgramMessageHandlers.size > 0 ||
    httpHandlers.size > 0 ||
    netHandlers.size > 0
  ) {
    lines.push('')
  }

  for (const wrapper of asyncTaskWrappers.values()) {
    pushUnitLines(lines, emitAsyncTaskWrapperDeclaration(wrapper, baseContext, deps.asyncTaskLoweringDependencies))
    lines.push('')
  }

  for (const wrapper of callbackWrappers.values()) {
    if (wrapper.kind === 'plain-arrow') {
      pushUnitLines(lines, emitPlainArrowCallbackWrapperDeclaration(wrapper, baseContext, deps.callbackLoweringDependencies))
    } else {
      pushUnitLines(lines, emitRuntimeCallbackWrapperDeclaration(wrapper, baseContext, deps.callbackLoweringDependencies))
    }

    lines.push('')
  }

  for (const wrapper of promiseChainWrappers.values()) {
    pushUnitLines(lines, emitPromiseChainCallbackWrapperDeclaration(wrapper, baseContext, deps.promiseChainLoweringDependencies))
    lines.push('')
  }

  for (const wrapper of dgramMessageHandlers.values()) {
    pushUnitLines(lines, emitDgramMessageHandlerDeclaration(wrapper, baseContext, deps.dgramLoweringDependencies))
    lines.push('')
  }

  for (const wrapper of httpHandlers.values()) {
    pushUnitLines(lines, emitHttpHandlerDeclaration(wrapper, baseContext, deps.httpLoweringDependencies))
    lines.push('')
  }

  for (const wrapper of netHandlers.values()) {
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
