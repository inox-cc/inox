import { diagnostic } from '../../diagnostics.ts'
import {
  cloneCFunctionReturnMapTypeMap,
  cloneCObjectShapeFieldMap,
  cloneCStringMap,
  cloneCStringSet,
  emitPrepareOwnedValueWrite,
  emitRuntimeTypeCheck,
  nextCName
} from '../context.ts'
import { cStringLiteral, emitCIdentifier, utf8ByteLength } from '../identifiers.ts'
import { emitRuntimeValueCheck } from '../runtime-values.ts'
import { cFetchRuntimeExpressionMethod, isAsyncFetchRuntimeCallExpression } from '../stdlib/fetch.ts'
import { cFsRuntimeExpressionMethod, isAsyncFsRuntimeCallExpression } from '../stdlib/fs.ts'
import { cRuntimeValueTag, emitCType, isManagedRuntimeReturnType } from '../value-types.ts'
import {
  cPromiseRuntimeCallName,
  isAsyncFunctionCallee,
  isPromiseReturningFunctionCallee,
  resolveCAsyncFunctionAwaitValueType
} from './promises.ts'
import { isPromiseChainCallbackWrapperWithContext } from './callbacks.ts'
import type { AnyNode, Diagnostic, IrFunctionDeclaration, SourceLocation } from '../../types.ts'
import type {
  CArrayElementInfo,
  CAsyncTaskPhase,
  CAsyncTaskAwaitFrameLocal,
  CAsyncTaskAwaitStep,
  CAsyncTaskFrameLocal,
  CAsyncTaskFrameLocalKind,
  CAsyncTaskParam,
  CAsyncTaskPrefixFrameLocal,
  CAsyncTaskPrefixLocal,
  CAsyncTaskSuccessPhaseKind,
  CAsyncTaskTryHandlerPlan,
  CAsyncTaskTryPhaseKind,
  CAsyncTaskWrapper,
  CCallbackWrapper,
  CFunctionParam,
  CFunctionReturnMapType,
  CFunctionType,
  CObjectShape,
  CObjectShapeField,
  CPromiseChainWrapper,
  CPromiseConstructorHandler,
  CKnownArrayElement,
  CKnownObjectField,
  CKnownObjectIndexField,
  CRuntimeArrayElement,
  CRuntimeArrowCapture
} from '../types.ts'
import type {
  CPreparedCallArgs,
  CPreparedExpression as PreparedExpression,
  CPreparedStringBytesOperand
} from '../types.ts'

type AsyncTaskAstNode = AnyNode
type AsyncTaskLoopFlowTarget = {
  label: string
  throughFinally: boolean
}
type AsyncTaskAnyNodeSet = Set<AsyncTaskAstNode | null | undefined>
type AsyncTaskArrayShapeMap = Map<string, CArrayElementInfo[]>
type AsyncTaskAsyncWrapperMap = Map<string, CAsyncTaskWrapper>
type AsyncTaskBooleanMap = Map<string, boolean>
type AsyncTaskCallbackArrowWrapperMap = Map<AsyncTaskAstNode, CCallbackWrapper>
type AsyncTaskCallbackWrapperMap = Map<string, CCallbackWrapper>
type AsyncTaskFunctionParamMap = Map<string, CFunctionParam[]>
type AsyncTaskFunctionTypeMap = Map<string, CFunctionType>
type AsyncTaskMapTypeMap = Map<string, CFunctionReturnMapType>
type AsyncTaskObjectShapeFieldMap = Map<string, CObjectShapeField[]>
type AsyncTaskPromiseChainWrapperMap = Map<AsyncTaskAstNode, CPromiseChainWrapper>
type AsyncTaskPromiseConstructorHandlerMap = Map<string, CPromiseConstructorHandler>
type AsyncTaskStringMap = Map<string, string>
type AsyncTaskStringNullableMap = Map<string, string | null>
type AsyncTaskStringSet = Set<string>

type AsyncTaskEmitContext = {
  asyncTaskLoweringDependencies: AsyncTaskLoweringDependencies
  asyncTaskWrappers: AsyncTaskAsyncWrapperMap
  boxedMutableCaptureDeclarations: AsyncTaskAnyNodeSet
  callbackArrowWrappers: AsyncTaskCallbackArrowWrapperMap
  callbackWrappers: AsyncTaskCallbackWrapperMap
  diagnostics: Diagnostic[]
  externalEventLoopFunctions: AsyncTaskStringSet
  forceRuntimeStringDeclarations?: AsyncTaskStringSet
  functionAsyncFlags: AsyncTaskBooleanMap
  functionNames: AsyncTaskStringMap
  functionParams: AsyncTaskFunctionParamMap
  functionReturnPromiseValueTypes: AsyncTaskStringNullableMap
  functionReturnTypes: AsyncTaskStringMap
  jsGlobalRoots: AsyncTaskStringSet
  nextId: number
  promiseChainArrowWrappers: AsyncTaskPromiseChainWrapperMap
  runtimeFunctionParams: AsyncTaskFunctionTypeMap
}

type AsyncTaskFunctionContext = AsyncTaskEmitContext & {
  arrayShapes: AsyncTaskArrayShapeMap
  breakFlowUsed: boolean
  breakTargets: AsyncTaskLoopFlowTarget[]
  boxedValueTypes: AsyncTaskStringMap
  boxedValues: string[]
  boxedVariables: AsyncTaskStringSet
  classInstanceTypes: AsyncTaskStringMap
  cleanupEnabled: boolean
  continueFlowUsed: boolean
  continueTargets: AsyncTaskLoopFlowTarget[]
  dgramBoundSockets: AsyncTaskStringSet
  dgramMessageSockets: AsyncTaskStringSet
  dgramReuseAddrSockets: AsyncTaskStringSet
  errorChannelUsed: boolean
  errorObjectNames: AsyncTaskStringSet
  errorTargets: string[]
  eventLoopUsed: boolean
  externalEventLoop: boolean
  failureStatement?: string | null
  failureStatementUsed?: boolean
  functionErrorOut: string | null
  functionReturnOut: string | null
  functionTypes: AsyncTaskFunctionTypeMap
  mapTypes: AsyncTaskMapTypeMap
  narrowedNullableScalars: AsyncTaskStringSet
  netReadingSockets: AsyncTaskStringSet
  nullableVariables: AsyncTaskStringSet
  objectShapes: AsyncTaskObjectShapeFieldMap
  ownedCryptoHashes: string[]
  ownedCryptoHmacs: string[]
  ownedPromises: string[]
  ownedValues: string[]
  promiseConstructorHandlers: AsyncTaskPromiseConstructorHandlerMap
  promiseRejectionValueTypes: AsyncTaskStringMap
  promiseValueTypes: AsyncTaskStringMap
  returnFlowUsed: boolean
  returnNullable: boolean
  returnShape?: CObjectShape | null
  returnTargets: string[]
  returnType: string
  runtimeArrayElementTypes: AsyncTaskStringMap
  runtimeCallbackCleanupLabel?: string
  runtimeCallbackReturnOut?: string
  runtimeCallbackReturnShape?: CObjectShape | null
  runtimeCallbackReturnType?: string
  runtimeCallbacks: AsyncTaskStringSet
  runtimeStrings: AsyncTaskStringSet
  setElementTypes: AsyncTaskStringMap
  statusReturn: boolean
  throwingFunction: boolean
  usedCleanupGoto: boolean
  usedRuntimeCallbackCleanupGoto?: boolean
  variables: AsyncTaskStringMap
}

type AsyncTaskVariableScopeSnapshot = {
  arrayShapes: AsyncTaskArrayShapeMap
  boxedVariables: AsyncTaskStringSet
  classInstanceTypes: AsyncTaskStringMap
  errorObjectNames: AsyncTaskStringSet
  functionTypes: AsyncTaskFunctionTypeMap
  mapTypes: AsyncTaskMapTypeMap
  narrowedNullableScalars: AsyncTaskStringSet
  nullableVariables: AsyncTaskStringSet
  objectShapes: AsyncTaskObjectShapeFieldMap
  promiseConstructorHandlers: AsyncTaskPromiseConstructorHandlerMap
  promiseRejectionValueTypes: AsyncTaskStringMap
  promiseValueTypes: AsyncTaskStringMap
  runtimeArrayElementTypes: AsyncTaskStringMap
  runtimeCallbacks: AsyncTaskStringSet
  runtimeStrings: AsyncTaskStringSet
  setElementTypes: AsyncTaskStringMap
  variables: AsyncTaskStringMap
}

type AsyncTaskFunctionNodeEntry = {
  declaration: IrFunctionDeclaration
  node: AsyncTaskAstNode
}


export type AsyncTaskLoweringDependencies = {
  createFunctionContext(
    baseContext: AsyncTaskEmitContext,
    returnType: string,
    returnNullable: boolean
  ): AsyncTaskFunctionContext
  emitCallee(callee: AsyncTaskAstNode, context: AsyncTaskFunctionContext): string
  emitCValueExpression(expression: AsyncTaskAstNode, context: AsyncTaskFunctionContext): PreparedExpression
  emitFunctionHead(statement: AsyncTaskAstNode, context: AsyncTaskFunctionContext): string
  emitFsBooleanFlag(expression: AsyncTaskAstNode, field: string): string
  emitOwnedValueCleanup(context: AsyncTaskFunctionContext): string[]
  emitOwnedValueDeclarations(context: AsyncTaskFunctionContext): string[]
  emitPreparedCallArgs(
    expression: AsyncTaskAstNode,
    params: CFunctionParam[],
    context: AsyncTaskFunctionContext
  ): CPreparedCallArgs
  emitPreparedCallExpression(expression: AsyncTaskAstNode, context: AsyncTaskFunctionContext): PreparedExpression
  emitPreparedFetchInitOperand(expression: AsyncTaskAstNode, context: AsyncTaskFunctionContext): PreparedExpression
  emitPreparedFsAccessModeExpression(expression: AsyncTaskAstNode, context: AsyncTaskFunctionContext): PreparedExpression
  emitPreparedNumberExpression(expression: AsyncTaskAstNode, context: AsyncTaskFunctionContext): PreparedExpression
  emitPreparedStringBytesOperand(
    expression: AsyncTaskAstNode,
    context: AsyncTaskFunctionContext,
    prefix: string
  ): CPreparedStringBytesOperand
  emitRuntimeArrowCaptureStoreLines(
    capture: CRuntimeArrowCapture,
    contextName: string,
    context: AsyncTaskFunctionContext
  ): string[]
  emitStatementList(statements: AsyncTaskAstNode[], context: AsyncTaskFunctionContext): string[]
  inferExpressionType(expression: AsyncTaskAstNode, context: AsyncTaskFunctionContext): string
  isIndexAccessExpression(expression: AsyncTaskAstNode): boolean
  isMemberAccessExpression(expression: AsyncTaskAstNode): boolean
  isRuntimeProducedStringExpression(expression: AsyncTaskAstNode, context: AsyncTaskFunctionContext): boolean
  isThrowingFunctionCallee(callee: AsyncTaskAstNode, context: AsyncTaskFunctionContext): boolean
  isThrowingFunctionName(name: string, context: AsyncTaskEmitContext): boolean
  pushVariableScope(context: AsyncTaskFunctionContext): AsyncTaskVariableScopeSnapshot
  registerObjectShape(context: AsyncTaskFunctionContext, name: string, shape: CObjectShape | null | undefined): void
  registerRuntimeValueMetadata(
    name: string,
    valueType: string,
    declaration: AsyncTaskAstNode,
    expression: AsyncTaskAstNode,
    context: AsyncTaskFunctionContext
  ): void
  resolveFunctionDeclarationParams(name: string, fallback: CFunctionParam[], context: AsyncTaskEmitContext): CFunctionParam[]
  resolveFunctionParams(callee: AsyncTaskAstNode, context: AsyncTaskFunctionContext): CFunctionParam[] | null
  resolveKnownArrayIndex(expression: AsyncTaskAstNode, context: AsyncTaskFunctionContext): CKnownArrayElement | null
  resolveKnownObjectIndex(expression: AsyncTaskAstNode, context: AsyncTaskFunctionContext): CKnownObjectIndexField | null
  resolveKnownObjectMember(expression: AsyncTaskAstNode, context: AsyncTaskFunctionContext): CKnownObjectField | null
  resolveRuntimeArrayElementType(expression: AsyncTaskAstNode, context: AsyncTaskFunctionContext): string | null
  resolveRuntimeArrayIndex(expression: AsyncTaskAstNode, context: AsyncTaskFunctionContext): CRuntimeArrayElement | null
  resolveRuntimeMapType(expression: AsyncTaskAstNode, context: AsyncTaskFunctionContext): CAsyncTaskRuntimeMapType | null
  resolveRuntimeSetElementType(expression: AsyncTaskAstNode, context: AsyncTaskFunctionContext): string | null
  resolveRuntimeStringReference(expression: AsyncTaskAstNode, context: AsyncTaskFunctionContext): string | null
  restoreVariableScope(context: AsyncTaskFunctionContext, snapshot: AsyncTaskVariableScopeSnapshot): void
}

export type CAsyncTaskRuntimeMapType = {
  key: string
  value: string
}

function asyncTaskDeps(context: AsyncTaskEmitContext): AsyncTaskLoweringDependencies {
  return context.asyncTaskLoweringDependencies
}

type AsyncTaskTryRegionDraft = {
  handler: CAsyncTaskTryHandlerPlan | null
  preHandlerFinalizerStatements: AsyncTaskAstNode[]
  successFinalizerStatements: AsyncTaskAstNode[]
  handlerFinalizerStatements: AsyncTaskAstNode[]
}

type AsyncTaskBodyDraft = {
  awaits: CAsyncTaskAwaitStep[]
  prefixStatements: AsyncTaskAstNode[]
  prefixLocals: CAsyncTaskPrefixLocal[]
  successPreFinalizerStatements: AsyncTaskAstNode[]
  successPrefixFinalizerStatements: AsyncTaskAstNode[]
  successStatements: AsyncTaskAstNode[]
  returnExpression: AsyncTaskAstNode | null
  returnType: string
  tryRegion: AsyncTaskTryRegionDraft | null
}

type AsyncTaskBodyPlan = {
  awaits: CAsyncTaskAwaitStep[]
  prefixStatements: AsyncTaskAstNode[]
  frameLocals: CAsyncTaskFrameLocal[]
  successPhases: CAsyncTaskPhase[]
  tryPhases: CAsyncTaskPhase[]
  returnExpression: AsyncTaskAstNode | null
  returnType: string
  hasTryRegion: boolean
  tryHandler: CAsyncTaskTryHandlerPlan | null
}

type AsyncTaskAwaitStepsResult = {
  awaits: CAsyncTaskAwaitStep[]
  trailingStatements: AsyncTaskAstNode[]
}

type AsyncTaskLiveAcrossSuspensionInput = {
  awaits: CAsyncTaskAwaitStep[]
  returnExpression: AsyncTaskAstNode | null
  successPhases: CAsyncTaskPhase[]
  tryHandler: CAsyncTaskTryHandlerPlan | null
  tryPhases: CAsyncTaskPhase[]
}

type AsyncTaskChildValue = AsyncTaskAstNode | AsyncTaskAstNode[] | string | number | boolean | null | undefined

type AsyncTaskPlannerContext = AsyncTaskFunctionContext

type AsyncTaskScheduleOptions = {
  cleanup: 'resume' | 'start'
  final: boolean
  cleanupLines?: string[]
}

type PreparedAsyncTaskPromise = {
  lines: string[]
}

type AsyncTaskPromiseChainCallbackContext = {
  lines: string[]
  expression: string
  finalizer: string
}

type AsyncTaskVisibleLocalReadOptions = {
  includePrefixLocals: boolean
}

type AsyncTaskLeadingPrefixSplit = {
  prefixStatements: AsyncTaskAstNode[]
  awaitStatements: AsyncTaskAstNode[]
}

type AsyncTaskNestedTryChain = {
  chain: AsyncTaskAstNode[]
  prefixStatements: AsyncTaskAstNode[]
  postNestedStatements: AsyncTaskAstNode[]
  postNestedOwnerIndex: number
}

type AsyncTaskPrefixLocalsResult = {
  context: AsyncTaskPlannerContext
  locals: CAsyncTaskPrefixLocal[]
}

function asAsyncTaskPlannerContext(context: AsyncTaskEmitContext): AsyncTaskPlannerContext {
  return context as AsyncTaskPlannerContext
}

export function collectAsyncTaskWrappers(
  functions: AsyncTaskFunctionNodeEntry[],
  context: AsyncTaskEmitContext,
  dependencies: AsyncTaskLoweringDependencies
): Map<string, CAsyncTaskWrapper> {
  context.asyncTaskLoweringDependencies = dependencies
  const plannerContext = asAsyncTaskPlannerContext(context)
  const wrappers: Map<string, CAsyncTaskWrapper> = new Map()

  for (const entry of functions) {
    const declaration = entry.declaration
    const item = entry.node
    const params = resolveAsyncTaskWrapperParams(declaration, plannerContext)

    if (params == null) {
      continue
    }

    const wrapperParams = asyncTaskParamsOrEmpty(params)
    const wrapper = createAsyncTaskWrapperFromBodyPlan(item, declaration, plannerContext, wrapperParams)

    if (wrapper != null) {
      wrappers.set(declaration.name, wrapper)
    }
  }

  return wrappers
}

function createAsyncTaskWrapperFromBodyPlan(
  item: AsyncTaskAstNode,
  declaration: IrFunctionDeclaration,
  context: AsyncTaskPlannerContext,
  params: CAsyncTaskParam[]
): CAsyncTaskWrapper | null {
  const bodyPlan = resolveAsyncTaskBodyPlan(item, declaration, context, params)

  if (bodyPlan != null) {
    const cName = emitCIdentifier(declaration.name)

    return {
      key: declaration.name,
      functionName: declaration.name,
      frameTypeName: `ccjs_async_task_${cName}_frame`,
      startName: `ccjs_async_task_${cName}_start`,
      resumeName: `ccjs_async_task_${cName}_resume`,
      rejectName: `ccjs_async_task_${cName}_reject`,
      finalizerName: `ccjs_async_task_${cName}_finalize`,
      params,
      awaits: bodyPlan.awaits,
      prefixStatements: bodyPlan.prefixStatements,
      frameLocals: bodyPlan.frameLocals,
      successPhases: bodyPlan.successPhases,
      tryPhases: bodyPlan.tryPhases,
      returnExpression: bodyPlan.returnExpression,
      returnType: bodyPlan.returnType,
      hasTryRegion: bodyPlan.hasTryRegion,
      tryHandler: bodyPlan.tryHandler
    }
  }

  return null
}

function asyncTaskParamsOrEmpty(params: CAsyncTaskParam[] | null): CAsyncTaskParam[] {
  if (params != null) {
    return params
  }

  return []
}

function asyncTaskNodeAt(nodes: AsyncTaskAstNode[], index: number): AsyncTaskAstNode {
  return nodes[index]
}

function maybeAsyncTaskNodeAt(nodes: AsyncTaskAstNode[], index: number): AsyncTaskAstNode | null {
  if (index >= nodes.length) {
    return null
  }

  return asyncTaskNodeAt(nodes, index)
}

function asyncTaskAwaitStepAt(steps: CAsyncTaskAwaitStep[], index: number): CAsyncTaskAwaitStep {
  return steps[index]
}

function asyncTaskPrefixFrameLocalAt(
  locals: CAsyncTaskPrefixFrameLocal[],
  index: number
): CAsyncTaskPrefixFrameLocal {
  return locals[index]
}

function asyncTaskAwaitFrameLocalAt(
  locals: CAsyncTaskAwaitFrameLocal[],
  index: number
): CAsyncTaskAwaitFrameLocal {
  return locals[index]
}

function asyncTaskFrameLocalAt(locals: CAsyncTaskFrameLocal[], index: number): CAsyncTaskFrameLocal {
  return locals[index]
}

function asyncTaskPathSegmentAt(path: string[], index: number): string {
  return path[index]
}

function asyncTaskStatementsBeforeLast(statements: AsyncTaskAstNode[]): AsyncTaskAstNode[] {
  const out: AsyncTaskAstNode[] = []

  for (let index = 0; index < statements.length - 1; index = index + 1) {
    out.push(asyncTaskNodeAt(statements, index))
  }

  return out
}

function createAsyncTaskBodyPlan(body: AsyncTaskBodyDraft): AsyncTaskBodyPlan {
  const successPhases = createAsyncTaskSuccessPhases(body)
  const awaits = body.awaits
  const prefixLocals = body.prefixLocals
  const tryRegion = body.tryRegion

  const tryPhases = createAsyncTaskTryPhases(tryRegion, successPhases)
  let tryHandler: CAsyncTaskTryHandlerPlan | null = null

  if (tryRegion != null) {
    tryHandler = tryRegion.handler
  }

  const livePrefixLocalNames = collectAsyncTaskLiveAcrossSuspensionNames({
    awaits: awaits,
    successPhases: successPhases,
    tryPhases: tryPhases,
    returnExpression: body.returnExpression,
    tryHandler: tryHandler
  })

  return {
    awaits: awaits,
    prefixStatements: body.prefixStatements,
    frameLocals: createAsyncTaskFrameLocals(prefixLocals, awaits, livePrefixLocalNames),
    successPhases: successPhases,
    tryPhases: tryPhases,
    returnExpression: body.returnExpression,
    returnType: body.returnType,
    hasTryRegion: tryRegion != null,
    tryHandler: tryHandler
  }
}

function createAsyncTaskFrameLocals(
  prefixLocals: CAsyncTaskPrefixLocal[],
  awaits: CAsyncTaskAwaitStep[],
  livePrefixLocalNames: AsyncTaskStringSet
): CAsyncTaskFrameLocal[] {
  const frameLocals: CAsyncTaskFrameLocal[] = []

  for (const local of prefixLocals) {
    if (!livePrefixLocalNames.has(local.name)) {
      continue
    }

    frameLocals.push({
      name: local.name,
      type: local.type,
      fieldName: local.fieldName,
      arrayElementType: local.arrayElementType,
      forceRuntimeStringDeclaration: local.forceRuntimeStringDeclaration,
      mapKeyType: local.mapKeyType,
      mapValueType: local.mapValueType,
      setElementType: local.setElementType,
      shape: local.shape,
      kind: 'prefix'
    })
  }

  for (const item of awaits) {
    if (item.fieldName == null || item.name == null) {
      continue
    }

    frameLocals.push({
      index: item.index,
      name: item.name,
      type: item.type,
      fieldName: item.fieldName,
      arrayElementType: item.arrayElementType,
      awaitedExpression: item.awaitedExpression,
      awaitedPromiseExpression: item.awaitedPromiseExpression,
      mapKeyType: item.mapKeyType,
      mapValueType: item.mapValueType,
      setElementType: item.setElementType,
      shape: item.shape,
      kind: 'await'
    })
  }

  return frameLocals
}

function collectAsyncTaskLiveAcrossSuspensionNames(input: AsyncTaskLiveAcrossSuspensionInput): AsyncTaskStringSet {
  const nodes: AsyncTaskAstNode[] = []

  for (let index = 1; index < input.awaits.length; index = index + 1) {
    const item = asyncTaskAwaitStepAt(input.awaits, index)
    const awaitedExpression = item.awaitedExpression
    const awaitedPromiseExpression = item.awaitedPromiseExpression

    if (awaitedExpression != null) {
      nodes.push(awaitedExpression)
    }

    if (awaitedPromiseExpression != null) {
      nodes.push(awaitedPromiseExpression)
    }
  }

  const successPhases: CAsyncTaskPhase[] = input.successPhases

  for (const phase of successPhases) {
    const statements: AsyncTaskAstNode[] = phase.statements

    for (const statement of statements) {
      nodes.push(statement)
    }
  }

  const tryPhases: CAsyncTaskPhase[] = input.tryPhases

  for (const phase of tryPhases) {
    const statements: AsyncTaskAstNode[] = phase.statements

    for (const statement of statements) {
      nodes.push(statement)
    }
  }

  appendAsyncTaskNodeIfPresent(nodes, input.returnExpression)

  appendAsyncTaskTryHandlerReferencedNodes(nodes, input.tryHandler)

  return collectAsyncTaskReferencedNames(nodes)
}

function appendAsyncTaskTryHandlerReferencedNodes(
  nodes: AsyncTaskAstNode[],
  handler: CAsyncTaskTryHandlerPlan | null
): void {
  if (handler != null) {
    const statements: AsyncTaskAstNode[] = handler.statements

    for (const statement of statements) {
      nodes.push(statement)
    }

    appendAsyncTaskNodeIfPresent(nodes, handler.returnExpression)
  }
}

function appendAsyncTaskNodeIfPresent(nodes: AsyncTaskAstNode[], node: AsyncTaskAstNode | null): void {
  if (node != null) {
    nodes.push(node)
  }
}

function collectAsyncTaskReferencedNames(nodes: AsyncTaskAstNode[]): AsyncTaskStringSet {
  const names: AsyncTaskStringSet = new Set()

  const source: AsyncTaskAstNode[] = nodes

  for (const node of source) {
    visitAsyncTaskReferencedValue(node, names)
  }

  return names
}

function visitAsyncTaskReferencedValue(value: AsyncTaskChildValue, names: AsyncTaskStringSet): void {
  if (value == null) {
    return
  }

  if (Array.isArray(value)) {
    visitAsyncTaskReferencedNodeArray(value, names)

    return
  }

  if (typeof value !== 'object') {
    return
  }

  const current = value as AsyncTaskAstNode

  if (current.type === 'Reference') {
    if (current.path.length === 1) {
      names.add(asyncTaskPathSegmentAt(current.path, 0))
    }

    return
  }

  visitAsyncTaskReferencedChildren(current, names)
}

function visitAsyncTaskReferencedNodeArray(nodes: AsyncTaskAstNode[], names: AsyncTaskStringSet): void {
  const source: AsyncTaskAstNode[] = nodes

  for (const item of source) {
    visitAsyncTaskReferencedValue(item, names)
  }
}

function visitAsyncTaskReferencedChildValue(value: AsyncTaskChildValue, names: AsyncTaskStringSet): void {
  if (value == null || typeof value !== 'object') {
    return
  }

  visitAsyncTaskReferencedValue(value, names)
}

function visitAsyncTaskReferencedChildren(current: AsyncTaskAstNode, names: AsyncTaskStringSet): void {
  visitAsyncTaskReferencedChildValue(current.body, names)
  visitAsyncTaskReferencedChildValue(current.params, names)
  visitAsyncTaskReferencedChildValue(current.fields, names)
  visitAsyncTaskReferencedChildValue(current.methods, names)
  visitAsyncTaskReferencedChildValue(current.init, names)
  visitAsyncTaskReferencedChildValue(current.condition, names)
  visitAsyncTaskReferencedChildValue(current.consequent, names)
  visitAsyncTaskReferencedChildValue(current.alternate, names)
  visitAsyncTaskReferencedChildValue(current.test, names)
  visitAsyncTaskReferencedChildValue(current.update, names)
  visitAsyncTaskReferencedChildValue(current.iterable, names)
  visitAsyncTaskReferencedChildValue(current.discriminant, names)
  visitAsyncTaskReferencedChildValue(current.cases, names)
  visitAsyncTaskReferencedChildValue(current.block, names)
  visitAsyncTaskReferencedChildValue(current.handler, names)
  visitAsyncTaskReferencedChildValue(current.finalizer, names)
  visitAsyncTaskReferencedChildValue(current.argument, names)
  visitAsyncTaskReferencedChildValue(current.args, names)
  visitAsyncTaskReferencedChildValue(current.callee, names)
  visitAsyncTaskReferencedChildValue(current.object, names)
  visitAsyncTaskReferencedChildValue(current.index, names)
  visitAsyncTaskReferencedChildValue(current.target, names)
  visitAsyncTaskReferencedChildValue(current.value, names)
  visitAsyncTaskReferencedChildValue(current.valueType, names)
  visitAsyncTaskReferencedChildValue(current.functionType, names)
  visitAsyncTaskReferencedChildValue(current.returnShape, names)
  visitAsyncTaskReferencedChildValue(current.left, names)
  visitAsyncTaskReferencedChildValue(current.right, names)
  visitAsyncTaskReferencedChildValue(current.elements, names)
  visitAsyncTaskReferencedChildValue(current.properties, names)
  visitAsyncTaskReferencedChildValue(current.expression, names)
}

function createAsyncTaskSuccessPhases(body: AsyncTaskBodyDraft): CAsyncTaskPhase[] {
  const phases: CAsyncTaskPhase[] = []

  appendAsyncTaskSuccessPhase(phases, 'pre-finalizer', body.successPreFinalizerStatements)
  appendAsyncTaskSuccessPhase(phases, 'prefix-finalizer', body.successPrefixFinalizerStatements)
  appendAsyncTaskSuccessPhase(phases, 'body', body.successStatements)

  return phases
}

function appendAsyncTaskSuccessPhase(
  phases: CAsyncTaskPhase[],
  kind: CAsyncTaskSuccessPhaseKind,
  statements: AsyncTaskAstNode[]
): void {
  if (statements.length === 0) {
    return
  }

  phases.push({
    kind: kind,
    statements: statements
  })
}

function createAsyncTaskTryPhases(
  tryRegion: AsyncTaskTryRegionDraft | null,
  successPhases: CAsyncTaskPhase[]
): CAsyncTaskPhase[] {
  if (tryRegion != null) {
    return createAsyncTaskTryPhasesForRegion(tryRegion, successPhases)
  }

  return []
}

function createAsyncTaskTryPhasesForRegion(
  tryRegion: AsyncTaskTryRegionDraft,
  successPhases: CAsyncTaskPhase[]
): CAsyncTaskPhase[] {
  const phases: CAsyncTaskPhase[] = []
  const successPrefixFinalizerStatements: AsyncTaskAstNode[] = []
  const successFinalizerStatements: AsyncTaskAstNode[] = []
  const rejectFinalizerStatements: AsyncTaskAstNode[] = []

  for (const phase of successPhases) {
    if (phase.kind !== 'prefix-finalizer') {
      continue
    }

    appendAsyncTaskNodes(successPrefixFinalizerStatements, phase.statements)
  }

  if (successPrefixFinalizerStatements.length === 0) {
    appendAsyncTaskNodes(successFinalizerStatements, tryRegion.preHandlerFinalizerStatements)
  }

  appendAsyncTaskNodes(successFinalizerStatements, tryRegion.successFinalizerStatements)
  appendAsyncTaskNodes(rejectFinalizerStatements, successPrefixFinalizerStatements)
  appendAsyncTaskNodes(rejectFinalizerStatements, tryRegion.preHandlerFinalizerStatements)
  appendAsyncTaskNodes(rejectFinalizerStatements, tryRegion.successFinalizerStatements)

  appendAsyncTaskTryPhase(phases, 'success-finalizer', successFinalizerStatements)
  appendAsyncTaskTryPhase(phases, 'reject-finalizer', rejectFinalizerStatements)
  appendAsyncTaskTryPhase(phases, 'handler-prelude', tryRegion.preHandlerFinalizerStatements)
  appendAsyncTaskTryPhase(phases, 'handler-finalizer', tryRegion.handlerFinalizerStatements)

  return phases
}

function appendAsyncTaskTryPhase(
  phases: CAsyncTaskPhase[],
  kind: CAsyncTaskTryPhaseKind,
  statements: AsyncTaskAstNode[]
): void {
  if (statements.length === 0) {
    return
  }

  phases.push({
    kind: kind,
    statements: statements
  })
}

function appendAsyncTaskNodes(target: AsyncTaskAstNode[], source: AsyncTaskAstNode[]): void {
  for (const item of source) {
    target.push(item)
  }
}

function asyncTaskSuccessPhaseKindAt(
  values: CAsyncTaskSuccessPhaseKind[],
  index: number
): CAsyncTaskSuccessPhaseKind {
  return values[index]
}

function asyncTaskSuccessPhaseKindSetFromArray(
  values: CAsyncTaskSuccessPhaseKind[]
): Set<CAsyncTaskSuccessPhaseKind> {
  const result: Set<CAsyncTaskSuccessPhaseKind> = new Set()

  for (let index = 0; index < values.length; index = index + 1) {
    result.add(asyncTaskSuccessPhaseKindAt(values, index))
  }

  return result
}

function cloneOptionalAsyncTaskStringMap(
  values: AsyncTaskStringMap | null | undefined
): AsyncTaskStringMap {
  if (values == null) {
    return new Map()
  }

  return cloneCStringMap(values)
}

function cloneOptionalAsyncTaskStringSet(
  values: AsyncTaskStringSet | null | undefined
): AsyncTaskStringSet {
  if (values == null) {
    return new Set()
  }

  return cloneCStringSet(values)
}

function appendAsyncTaskLines(target: string[], source: string[]): void {
  for (const line of source) {
    target.push(line)
  }
}

function appendIndentedAsyncTaskLines(target: string[], source: string[], indent: string): void {
  for (const line of source) {
    target.push(`${indent}${line}`)
  }
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

function appendAsyncTaskFrameLocals(
  target: Array<CAsyncTaskAwaitStep | CAsyncTaskPrefixLocal>,
  source: Array<CAsyncTaskAwaitStep | CAsyncTaskPrefixLocal>
): void {
  for (const item of source) {
    target.push(item)
  }
}

function getAsyncTaskBlockStatements(block: AsyncTaskAstNode | null | undefined): AsyncTaskAstNode[] {
  if (block == null || block.body == null) {
    return []
  }

  return block.body
}

function getAsyncTaskLastStatement(statements: AsyncTaskAstNode[]): AsyncTaskAstNode | null {
  if (statements.length === 0) {
    return null
  }

  return statements[statements.length - 1]
}

function getAsyncTaskReturnArgument(statement: AsyncTaskAstNode): AsyncTaskAstNode | null {
  const argument = statement.argument

  if (argument == null) {
    return null
  }

  return argument
}

function getAsyncTaskStatementsBeforeLast(statements: AsyncTaskAstNode[]): AsyncTaskAstNode[] {
  if (statements.length === 0) {
    return []
  }

  return asyncTaskStatementsBeforeLast(statements)
}

function resolveAsyncTaskWrapperParams(
  declaration: IrFunctionDeclaration,
  context: AsyncTaskPlannerContext
): CAsyncTaskParam[] | null {
  if (
    declaration.async !== true ||
    declaration.returnType !== 'promise' ||
    asyncTaskDeps(context).isThrowingFunctionName(declaration.name, context)
  ) {
    return null
  }

  const params = asyncTaskDeps(context).resolveFunctionDeclarationParams(
    declaration.name,
    declaration.params as CFunctionParam[],
    context
  )

  for (const param of params) {
    if (param.nullable === true || !isSupportedAsyncTaskParamType(param.valueType)) {
      return null
    }
  }

  const result: CAsyncTaskParam[] = []

  for (const param of params) {
    result.push({
      name: param.name,
      valueType: param.valueType,
      nullable: param.nullable,
      fieldName: `param_${emitCIdentifier(param.name)}`,
      argName: `ccjs_arg_${emitCIdentifier(param.name)}`
    })
  }

  return result
}

function isSupportedAsyncTaskParamType(valueType: string): boolean {
  return valueType === 'number' || valueType === 'boolean' || valueType === 'string' || valueType === 'bytes'
}

function isSupportedAsyncTaskValueType(valueType: string): boolean {
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

function resolveAsyncTaskBodyPlan(
  statement: AsyncTaskAstNode,
  declaration: IrFunctionDeclaration,
  context: AsyncTaskPlannerContext,
  params: CAsyncTaskParam[]
): AsyncTaskBodyPlan | null {
  if (
    declaration.async !== true ||
    declaration.returnType !== 'promise' ||
    asyncTaskDeps(context).isThrowingFunctionName(declaration.name, context)
  ) {
    return null
  }

  const returnType = resolveAsyncTaskDeclarationReturnType(declaration, context)

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

  const returnStatement = getAsyncTaskLastStatement(statement.body)

  if (returnStatement == null || returnStatement.type !== 'ReturnStatement') {
    return null
  }

  const awaits = resolveAsyncTaskAwaitSteps(getAsyncTaskStatementsBeforeLast(statement.body), context)

  if (awaits == null) {
    return null
  }

  const resolvedAwaits = asyncTaskAwaitStepsOrEmpty(awaits)
  const returnContext = createAsyncTaskExpressionContext(context, params, resolvedAwaits)
  const returnExpression = resolveAsyncTaskReturnValueExpression(
    getAsyncTaskReturnArgument(returnStatement),
    returnType,
    returnContext
  )

  if (returnType !== 'void' && returnExpression == null) {
    return null
  }

  return createAsyncTaskBodyPlan({
    awaits: resolvedAwaits,
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

function resolveAsyncTaskDeclarationReturnType(
  declaration: IrFunctionDeclaration,
  context: AsyncTaskPlannerContext
): string {
  const declarationType = declaration.returnPromiseValueType

  if (declarationType != null) {
    return declarationType
  }

  const mappedType = context.functionReturnPromiseValueTypes.get(declaration.name)

  if (mappedType != null) {
    return mappedType
  }

  return 'unknown'
}

function asyncTaskAwaitStepsOrEmpty(steps: CAsyncTaskAwaitStep[] | null): CAsyncTaskAwaitStep[] {
  if (steps != null) {
    return steps
  }

  return []
}

function resolveAsyncTaskTryBodyPlan(
  statement: AsyncTaskAstNode,
  context: AsyncTaskPlannerContext,
  params: CAsyncTaskParam[],
  returnType: string
): AsyncTaskBodyPlan | null {
  if (statement.body.length !== 1) {
    return null
  }

  const tryStatement = statement.body[0]

  if (tryStatement.type !== 'TryStatement') {
    return null
  }

  const nestedTryFinallyBody = resolveAsyncTaskNestedTryBodyPlan(tryStatement, context, params, returnType)

  if (nestedTryFinallyBody != null) {
    return nestedTryFinallyBody
  }

  const tryStatements = getAsyncTaskBlockStatements(tryStatement.block)
  const returnStatement = getAsyncTaskLastStatement(tryStatements)

  if (returnStatement == null || returnStatement.type !== 'ReturnStatement') {
    return null
  }

  if (tryStatement.handler == null && tryStatement.finalizer == null) {
    return null
  }

  const awaits = resolveAsyncTaskAwaitSteps(getAsyncTaskStatementsBeforeLast(tryStatements), context)

  if (awaits == null) {
    return null
  }

  const resolvedAwaits = asyncTaskAwaitStepsOrEmpty(awaits)
  const returnContext = createAsyncTaskExpressionContext(context, params, resolvedAwaits)
  const returnExpression = resolveAsyncTaskReturnValueExpression(
    getAsyncTaskReturnArgument(returnStatement),
    returnType,
    returnContext
  )

  if (returnType !== 'void' && returnExpression == null) {
    return null
  }

  const handler = resolveAsyncTaskTryHandler(tryStatement.handler, context, params, returnType)
  const finalizerStatements = getAsyncTaskBlockStatements(tryStatement.finalizer)

  if ((tryStatement.handler != null && handler == null) || hasUnsupportedAsyncTaskTryControlFlow(finalizerStatements)) {
    return null
  }

  return createAsyncTaskBodyPlan({
    awaits: resolvedAwaits,
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

function resolveAsyncTaskNestedTryBodyPlan(
  tryStatement: AsyncTaskAstNode,
  context: AsyncTaskPlannerContext,
  params: CAsyncTaskParam[],
  returnType: string
): AsyncTaskBodyPlan | null {
  const tryChainResultOrNull = collectAsyncTaskNestedTryChain(tryStatement)

  if (tryChainResultOrNull == null || tryChainResultOrNull.chain.length < 2) {
    return null
  }

  const tryChainResult = asyncTaskNestedTryChainOrEmpty(tryChainResultOrNull)
  const tryChain = tryChainResult.chain
  const innerTry = tryChain[tryChain.length - 1]
  const innerTryStatements = getAsyncTaskBlockStatements(innerTry.block)
  const postNestedStatements = tryChainResult.postNestedStatements
  const hasPostNestedStatements = postNestedStatements.length > 0
  let returnStatement: AsyncTaskAstNode | null = null
  let innerAwaitStatements: AsyncTaskAstNode[] = []

  if (hasPostNestedStatements) {
    returnStatement = getAsyncTaskLastStatement(postNestedStatements)
    innerAwaitStatements = innerTryStatements
  } else {
    returnStatement = getAsyncTaskLastStatement(innerTryStatements)
    innerAwaitStatements = getAsyncTaskStatementsBeforeLast(innerTryStatements)
  }

  const innerPrefixResult = splitAsyncTaskLeadingPrefixStatements(innerAwaitStatements)

  if (returnStatement == null || returnStatement.type !== 'ReturnStatement') {
    return null
  }

  const prefixStatements: AsyncTaskAstNode[] = []
  appendAsyncTaskNodes(prefixStatements, tryChainResult.prefixStatements)
  appendAsyncTaskNodes(prefixStatements, innerPrefixResult.prefixStatements)
  const prefixResultOrNull = resolveAsyncTaskPrefixLocals(context, params, prefixStatements)

  if (prefixResultOrNull == null) {
    return null
  }

  const prefixResult = asyncTaskPrefixLocalsResultOrEmpty(prefixResultOrNull, context)
  const prefixContext = prefixResult.context
  const awaitResultOrNull = resolveAsyncTaskAwaitStepsAndTrailingStatements(innerPrefixResult.awaitStatements, prefixContext)

  if (awaitResultOrNull == null) {
    return null
  }

  const awaitResult = asyncTaskAwaitStepsResultOrEmpty(awaitResultOrNull)
  const awaits = awaitResult.awaits
  const successPreFinalizerStatements: AsyncTaskAstNode[] = []
  let successStatements: AsyncTaskAstNode[] = []
  const returnContextLocals: Array<CAsyncTaskAwaitStep | CAsyncTaskPrefixLocal> = []

  if (hasPostNestedStatements) {
    appendAsyncTaskNodes(successPreFinalizerStatements, awaitResult.trailingStatements)
    successStatements = getAsyncTaskStatementsBeforeLast(postNestedStatements)
    appendAsyncTaskFrameLocals(returnContextLocals, prefixResult.locals)
  } else {
    successStatements = awaitResult.trailingStatements
    appendAsyncTaskFrameLocals(returnContextLocals, prefixResult.locals)
    appendAsyncTaskFrameLocals(returnContextLocals, awaits)
  }

  const returnContext = createAsyncTaskExpressionContext(context, params, returnContextLocals)
  const finalizers = collectAsyncTaskTryFinalizers(tryChain)
  const handlerIndex = findAsyncTaskNearestTryHandlerIndex(tryChain)
  let handlerSource: AsyncTaskAstNode | null = null

  if (handlerIndex >= 0) {
    handlerSource = asyncTaskNodeAt(tryChain, handlerIndex).handler
  }

  const handler = resolveAsyncTaskTryHandler(handlerSource, context, params, returnType)
  registerAsyncTaskStatementListLocals(returnContext, successStatements)
  const returnExpression = resolveAsyncTaskReturnValueExpression(
    getAsyncTaskReturnArgument(returnStatement),
    returnType,
    returnContext
  )

  if (returnType !== 'void' && returnExpression == null) {
    return null
  }

  let successFinalizerStatements: AsyncTaskAstNode[] = []

  if (hasPostNestedStatements) {
    successFinalizerStatements = collectAsyncTaskTryFinalizerStatements(finalizers, tryChainResult.postNestedOwnerIndex, 0)
  } else if (handlerIndex < 0) {
    successFinalizerStatements = collectAsyncTaskTryFinalizerStatements(finalizers, finalizers.length - 1, 0)
  } else {
    successFinalizerStatements = collectAsyncTaskTryFinalizerStatements(finalizers, handlerIndex, 0)
  }

  let handlerFinalizerStatements: AsyncTaskAstNode[] = []

  if (handlerIndex >= 0) {
    if (hasPostNestedStatements) {
      handlerFinalizerStatements = collectAsyncTaskTryFinalizerStatements(finalizers, handlerIndex, 0)
    } else {
      handlerFinalizerStatements = successFinalizerStatements
    }
  }
  let finalizersUnsupported = false

  for (const statements of finalizers) {
    if (hasUnsupportedAsyncTaskTryControlFlow(statements)) {
      finalizersUnsupported = true
    }
  }

  if (
    (handlerSource != null && handler == null) ||
    hasUnsupportedAsyncTaskTryControlFlow(prefixStatements) ||
    hasUnsupportedAsyncTaskTryControlFlow(successPreFinalizerStatements) ||
    hasUnsupportedAsyncTaskTryControlFlow(successStatements) ||
    finalizersUnsupported
  ) {
    return null
  }

  let successPrefixFinalizerStatements: AsyncTaskAstNode[] = []

  if (hasPostNestedStatements) {
    successPrefixFinalizerStatements = collectAsyncTaskTryFinalizerStatements(
      finalizers,
      finalizers.length - 1,
      tryChainResult.postNestedOwnerIndex + 1
    )
  }

  let preHandlerFinalizerStatements: AsyncTaskAstNode[] = []

  if (handlerIndex >= 0) {
    preHandlerFinalizerStatements = collectAsyncTaskTryFinalizerStatements(finalizers, finalizers.length - 1, handlerIndex + 1)
  }

  return createAsyncTaskBodyPlan({
    awaits: awaits,
    prefixStatements: prefixStatements,
    prefixLocals: prefixResult.locals,
    successPreFinalizerStatements: successPreFinalizerStatements,
    successPrefixFinalizerStatements: successPrefixFinalizerStatements,
    successStatements: successStatements,
    returnExpression: returnExpression,
    returnType: returnType,
    tryRegion: {
      handler: handler,
      preHandlerFinalizerStatements: preHandlerFinalizerStatements,
      successFinalizerStatements: successFinalizerStatements,
      handlerFinalizerStatements: handlerFinalizerStatements
    }
  })
}

function asyncTaskNestedTryChainOrEmpty(result: AsyncTaskNestedTryChain | null): AsyncTaskNestedTryChain {
  if (result != null) {
    return result
  }

  return {
    chain: [],
    prefixStatements: [],
    postNestedStatements: [],
    postNestedOwnerIndex: -1
  }
}

function asyncTaskPrefixLocalsResultOrEmpty(
  result: AsyncTaskPrefixLocalsResult | null,
  context: AsyncTaskPlannerContext
): AsyncTaskPrefixLocalsResult {
  if (result != null) {
    return result
  }

  return {
    context: context,
    locals: []
  }
}

function asyncTaskAwaitStepsResultOrEmpty(result: AsyncTaskAwaitStepsResult | null): AsyncTaskAwaitStepsResult {
  if (result != null) {
    return result
  }

  return {
    awaits: [],
    trailingStatements: []
  }
}

function splitAsyncTaskLeadingPrefixStatements(statements: AsyncTaskAstNode[]): AsyncTaskLeadingPrefixSplit {
  const prefixStatements: AsyncTaskAstNode[] = []
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
    index = index + 1
  }

  return {
    prefixStatements: prefixStatements,
    awaitStatements: statements.slice(index)
  }
}

function isAsyncTaskDirectAwaitStatementShape(statement: AsyncTaskAstNode | null | undefined): boolean {
  if (statement == null || statement.type !== 'VariableDeclaration' || statement.init == null) {
    return false
  }

  return statement.init.type === 'AwaitExpression'
}

function isAsyncTaskStatementAwaitShape(statement: AsyncTaskAstNode | null | undefined): boolean {
  if (statement == null || statement.type !== 'ExpressionStatement' || statement.expression == null) {
    return false
  }

  return statement.expression.type === 'AwaitExpression'
}

function isAsyncTaskLocalPromiseAwaitShape(
  promiseStatement: AsyncTaskAstNode | null | undefined,
  awaitStatement: AsyncTaskAstNode | null | undefined
): boolean {
  if (promiseStatement == null || promiseStatement.type !== 'VariableDeclaration' || promiseStatement.init == null) {
    return false
  }

  if (awaitStatement == null || awaitStatement.type !== 'VariableDeclaration' || awaitStatement.init == null) {
    return false
  }

  return promiseStatement.init.valueType === 'promise' && awaitStatement.init.type === 'AwaitExpression'
}

function collectAsyncTaskNestedTryChain(tryStatement: AsyncTaskAstNode): AsyncTaskNestedTryChain | null {
  const chain: AsyncTaskAstNode[] = []
  const prefixStatements: AsyncTaskAstNode[] = []
  const postNestedStatements: AsyncTaskAstNode[] = []
  let postNestedOwnerIndex = -1
  let current: AsyncTaskAstNode | null = tryStatement

  while (current != null && current.type === 'TryStatement') {
    if (current.handler == null && current.finalizer == null) {
      return null
    }

    chain.push(current)

    const body = getAsyncTaskBlockStatements(current.block)
    const nestedTryIndexes: number[] = []

    for (let index = 0; index < body.length; index = index + 1) {
      const item = body[index]

      if (item.type === 'TryStatement') {
        nestedTryIndexes.push(index)
      }
    }

    if (nestedTryIndexes.length === 1) {
      const nestedTryIndex = nestedTryIndexes[0]
      const suffixStatements = body.slice(nestedTryIndex + 1)

      if (suffixStatements.length > 0) {
        if (postNestedStatements.length > 0) {
          return null
        }

        appendAsyncTaskNodes(postNestedStatements, suffixStatements)
        postNestedOwnerIndex = chain.length - 1
      }

      appendAsyncTaskNodes(prefixStatements, body.slice(0, nestedTryIndex))
      current = body[nestedTryIndex]
      continue
    }

    return {
      chain: chain,
      prefixStatements: prefixStatements,
      postNestedStatements: postNestedStatements,
      postNestedOwnerIndex: postNestedOwnerIndex
    }
  }

  return null
}

function collectAsyncTaskTryFinalizers(tryChain: AsyncTaskAstNode[]): AsyncTaskAstNode[][] {
  const finalizers: AsyncTaskAstNode[][] = []

  for (const item of tryChain) {
    finalizers.push(getAsyncTaskBlockStatements(item.finalizer))
  }

  return finalizers
}

function findAsyncTaskNearestTryHandlerIndex(tryChain: AsyncTaskAstNode[]): number {
  for (let index = tryChain.length - 1; index >= 0; index = index - 1) {
    if (tryChain[index].handler != null) {
      return index
    }
  }

  return -1
}

function collectAsyncTaskTryFinalizerStatements(
  finalizers: AsyncTaskAstNode[][],
  fromIndex: number,
  toIndex: number
): AsyncTaskAstNode[] {
  const statements: AsyncTaskAstNode[] = []

  for (let index = fromIndex; index >= toIndex; index = index - 1) {
    appendAsyncTaskNodes(statements, finalizers[index])
  }

  return statements
}

function resolveAsyncTaskPrefixLocals(
  context: AsyncTaskPlannerContext,
  params: CAsyncTaskParam[],
  prefixStatements: AsyncTaskAstNode[]
): AsyncTaskPrefixLocalsResult | null {
  const result = createAsyncTaskExpressionContext(context, params, [])
  const locals: CAsyncTaskPrefixLocal[] = []

  for (const statement of prefixStatements) {
    if (statement.type !== 'VariableDeclaration') {
      continue
    }

    let valueType = statement.valueType

    if (valueType == null) {
      valueType = asyncTaskDeps(context).inferExpressionType(statement.init, result)
    }

    if (!isSupportedAsyncTaskPrefixLocalType(valueType)) {
      return null
    }

    asyncTaskDeps(context).registerRuntimeValueMetadata(statement.name, valueType, statement, statement.init, result)

    if (valueType === 'string' && isRuntimeStringPrefixLocalDeclaration(statement, result)) {
      result.runtimeStrings.add(statement.name)
    }

    if (isSupportedAsyncTaskFramePrefixLocal(statement, valueType, result)) {
      let shape: CObjectShape | null = null
      let arrayElementType: string | null = null
      let mapKeyType: string | null = null
      let mapValueType: string | null = null
      let setElementType: string | null = null

      if (valueType === 'object') {
        if (statement.shape != null) {
          shape = statement.shape
        } else if (statement.init != null && statement.init.shape != null) {
          shape = statement.init.shape
        } else {
          shape = null
        }
      }

      if (valueType === 'array') {
        if (statement.arrayElementType != null) {
          arrayElementType = statement.arrayElementType
        } else if (statement.init != null && statement.init.arrayElementType != null) {
          arrayElementType = statement.init.arrayElementType
        } else {
          const resolvedArrayElementType = asyncTaskDeps(context).resolveRuntimeArrayElementType(statement.init, result)

          if (resolvedArrayElementType != null) {
            arrayElementType = resolvedArrayElementType
          } else {
            arrayElementType = 'unknown'
          }
        }
      }

      if (valueType === 'map') {
        const resolvedMapType = asyncTaskDeps(context).resolveRuntimeMapType(statement.init, result)

        if (statement.mapKeyType != null) {
          mapKeyType = statement.mapKeyType
        } else if (resolvedMapType != null) {
          mapKeyType = resolvedMapType.key
        } else if (statement.init != null && statement.init.mapKeyType != null) {
          mapKeyType = statement.init.mapKeyType
        } else {
          mapKeyType = 'unknown'
        }

        if (statement.mapValueType != null) {
          mapValueType = statement.mapValueType
        } else if (resolvedMapType != null) {
          mapValueType = resolvedMapType.value
        } else if (statement.init != null && statement.init.mapValueType != null) {
          mapValueType = statement.init.mapValueType
        } else {
          mapValueType = 'unknown'
        }
      }

      if (valueType === 'set') {
        if (statement.setElementType != null) {
          setElementType = statement.setElementType
        } else {
          const resolvedSetElementType = asyncTaskDeps(context).resolveRuntimeSetElementType(statement.init, result)

          if (resolvedSetElementType != null) {
            setElementType = resolvedSetElementType
          } else if (statement.init != null && statement.init.setElementType != null) {
            setElementType = statement.init.setElementType
          } else {
            setElementType = 'unknown'
          }
        }
      }

      locals.push({
        name: statement.name,
        type: valueType,
        shape: shape,
        arrayElementType: arrayElementType,
        mapKeyType: mapKeyType,
        mapValueType: mapValueType,
        setElementType: setElementType,
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

function registerAsyncTaskStatementListLocals(context: AsyncTaskPlannerContext, statements: AsyncTaskAstNode[]): void {
  for (const statement of statements) {
    if (statement.type !== 'VariableDeclaration') {
      continue
    }

    let valueType = statement.valueType

    if (valueType == null) {
      valueType = asyncTaskDeps(context).inferExpressionType(statement.init, context)
    }

    asyncTaskDeps(context).registerRuntimeValueMetadata(statement.name, valueType, statement, statement.init, context)

    if (valueType === 'string' && isRuntimeStringPrefixLocalDeclaration(statement, context)) {
      context.runtimeStrings.add(statement.name)
    }
  }
}

function isSupportedAsyncTaskPrefixLocalType(valueType: string): boolean {
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

function isSupportedAsyncTaskFramePrefixLocalType(valueType: string): boolean {
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

function isSupportedAsyncTaskFramePrefixLocal(
  statement: AsyncTaskAstNode,
  valueType: string,
  context: AsyncTaskPlannerContext
): boolean {
  if (!isSupportedAsyncTaskFramePrefixLocalType(valueType)) {
    return false
  }

  return valueType !== 'string' || isRuntimeStringPrefixLocalDeclaration(statement, context)
}

function isRuntimeStringPrefixLocalDeclaration(statement: AsyncTaskAstNode, context: AsyncTaskPlannerContext): boolean {
  const expression = statement.init

  if (
    asyncTaskDeps(context).resolveRuntimeStringReference(expression, context) != null ||
    asyncTaskDeps(context).isRuntimeProducedStringExpression(expression, context) ||
    isRawStringLiteralExpression(expression)
  ) {
    return true
  }

  if (asyncTaskDeps(context).isMemberAccessExpression(expression)) {
    const member = asyncTaskDeps(context).resolveKnownObjectMember(expression, context)

    return member != null && member.valueType === 'string'
  }

  if (asyncTaskDeps(context).isIndexAccessExpression(expression)) {
    const element = asyncTaskDeps(context).resolveKnownArrayIndex(expression, context)
    const field = asyncTaskDeps(context).resolveKnownObjectIndex(expression, context)
    const runtimeElement = asyncTaskDeps(context).resolveRuntimeArrayIndex(expression, context)

    if (element != null && element.valueType === 'string') {
      return true
    }

    if (field != null && field.valueType === 'string') {
      return true
    }

    return runtimeElement != null && runtimeElement.valueType === 'string'
  }

  return false
}

function isRawStringLiteralExpression(expression: AsyncTaskAstNode | null | undefined): boolean {
  if (expression == null) {
    return false
  }

  if (expression.type === 'StringLiteral') {
    return true
  }

  return expression.type === 'TemplateLiteral' && !expression.raw.includes('${')
}

function resolveAsyncTaskTryHandler(
  handler: AsyncTaskAstNode | null | undefined,
  context: AsyncTaskPlannerContext,
  params: CAsyncTaskParam[],
  returnType: string
): CAsyncTaskTryHandlerPlan | null {
  if (handler == null) {
    return null
  }

  const statements = getAsyncTaskBlockStatements(handler.body)
  const returnStatement = getAsyncTaskLastStatement(statements)
  const handlerStatements = getAsyncTaskStatementsBeforeLast(statements)

  if (returnStatement == null || returnStatement.type !== 'ReturnStatement' || hasUnsupportedAsyncTaskTryControlFlow(handlerStatements)) {
    return null
  }

  const catchContext = createAsyncTaskExpressionContext(context, params, [])

  if (handler.param != null) {
    catchContext.variables.set(handler.param, 'string')
    catchContext.runtimeStrings.add(handler.param)
  }

  registerAsyncTaskStatementListLocals(catchContext, handlerStatements)
  const returnExpression = resolveAsyncTaskReturnValueExpression(
    getAsyncTaskReturnArgument(returnStatement),
    returnType,
    catchContext
  )

  if (returnExpression == null) {
    return null
  }

  let handlerParam: string | null = null

  if (handler.param != null) {
    handlerParam = handler.param
  }

  return {
    param: handlerParam,
    statements: handlerStatements,
    returnExpression: returnExpression
  }
}

function createAsyncTaskExpressionContext(
  context: AsyncTaskPlannerContext,
  params: CAsyncTaskParam[],
  awaits: Array<CAsyncTaskAwaitStep | CAsyncTaskPrefixLocal>
): AsyncTaskPlannerContext {
  const result = asyncTaskDeps(context).createFunctionContext(context, context.returnType, context.returnNullable)

  result.arrayShapes = context.arrayShapes
  result.breakFlowUsed = context.breakFlowUsed
  result.breakTargets = context.breakTargets
  result.boxedValueTypes = context.boxedValueTypes
  result.boxedValues = context.boxedValues
  result.boxedVariables = context.boxedVariables
  result.classInstanceTypes = context.classInstanceTypes
  result.cleanupEnabled = context.cleanupEnabled
  result.continueFlowUsed = context.continueFlowUsed
  result.continueTargets = context.continueTargets
  result.dgramBoundSockets = context.dgramBoundSockets
  result.dgramMessageSockets = context.dgramMessageSockets
  result.dgramReuseAddrSockets = context.dgramReuseAddrSockets
  result.errorChannelUsed = context.errorChannelUsed
  result.errorObjectNames = context.errorObjectNames
  result.errorTargets = context.errorTargets
  result.eventLoopUsed = context.eventLoopUsed
  result.externalEventLoop = context.externalEventLoop
  result.failureStatement = context.failureStatement
  result.failureStatementUsed = context.failureStatementUsed === true
  result.functionErrorOut = context.functionErrorOut
  result.functionReturnOut = context.functionReturnOut
  result.functionTypes = context.functionTypes
  result.mapTypes = cloneCFunctionReturnMapTypeMap(context.mapTypes)
  result.narrowedNullableScalars = context.narrowedNullableScalars
  result.netReadingSockets = context.netReadingSockets
  result.nullableVariables = context.nullableVariables
  result.objectShapes = cloneCObjectShapeFieldMap(context.objectShapes)
  result.ownedCryptoHashes = context.ownedCryptoHashes
  result.ownedCryptoHmacs = context.ownedCryptoHmacs
  result.ownedPromises = context.ownedPromises
  result.ownedValues = context.ownedValues
  result.promiseConstructorHandlers = context.promiseConstructorHandlers
  result.promiseRejectionValueTypes = context.promiseRejectionValueTypes
  result.promiseValueTypes = context.promiseValueTypes
  result.returnFlowUsed = context.returnFlowUsed
  result.returnShape = context.returnShape
  result.returnTargets = context.returnTargets
  result.runtimeArrayElementTypes = cloneOptionalAsyncTaskStringMap(context.runtimeArrayElementTypes)
  const runtimeCallbackCleanupLabel = context.runtimeCallbackCleanupLabel
  if (runtimeCallbackCleanupLabel != null) {
    result.runtimeCallbackCleanupLabel = runtimeCallbackCleanupLabel
  }
  const runtimeCallbackReturnOut = context.runtimeCallbackReturnOut
  if (runtimeCallbackReturnOut != null) {
    result.runtimeCallbackReturnOut = runtimeCallbackReturnOut
  }
  result.runtimeCallbackReturnShape = context.runtimeCallbackReturnShape
  const runtimeCallbackReturnType = context.runtimeCallbackReturnType
  if (runtimeCallbackReturnType != null) {
    result.runtimeCallbackReturnType = runtimeCallbackReturnType
  }
  result.runtimeCallbacks = context.runtimeCallbacks
  result.runtimeStrings = cloneOptionalAsyncTaskStringSet(context.runtimeStrings)
  result.setElementTypes = cloneOptionalAsyncTaskStringMap(context.setElementTypes)
  result.statusReturn = context.statusReturn
  result.throwingFunction = context.throwingFunction
  result.usedCleanupGoto = context.usedCleanupGoto
  result.usedRuntimeCallbackCleanupGoto = context.usedRuntimeCallbackCleanupGoto === true
  result.variables = cloneOptionalAsyncTaskStringMap(context.variables)

  for (const param of params) {
    registerAsyncTaskLocalMetadata(param.name, param.valueType, param, result)
  }

  for (const item of awaits) {
    if (item.name != null) {
      registerAsyncTaskLocalMetadata(item.name, item.type, item, result)
    }
  }

  return result
}

function hasUnsupportedAsyncTaskTryControlFlow(value: AsyncTaskChildValue): boolean {
  if (value == null) {
    return false
  }

  if (Array.isArray(value)) {
    return hasUnsupportedAsyncTaskTryControlFlowArray(value)
  }

  if (typeof value !== 'object') {
    return false
  }

  const current = value as AsyncTaskAstNode

  if (current.type != null && isUnsupportedAsyncTaskTryControlFlowType(current.type)) {
    return true
  }

  return hasUnsupportedAsyncTaskTryControlFlowChildren(current)
}

function hasUnsupportedAsyncTaskTryControlFlowArray(values: AsyncTaskAstNode[]): boolean {
  for (let index = 0; index < values.length; index = index + 1) {
    if (hasUnsupportedAsyncTaskTryControlFlow(asyncTaskNodeAt(values, index))) {
      return true
    }
  }

  return false
}

function hasUnsupportedAsyncTaskTryControlFlowChild(value: AsyncTaskChildValue): boolean {
  if (value == null || typeof value !== 'object') {
    return false
  }

  return hasUnsupportedAsyncTaskTryControlFlow(value)
}

function hasUnsupportedAsyncTaskTryControlFlowChildren(current: AsyncTaskAstNode): boolean {
  if (hasUnsupportedAsyncTaskTryControlFlowChild(current.body)) return true
  if (hasUnsupportedAsyncTaskTryControlFlowChild(current.params)) return true
  if (hasUnsupportedAsyncTaskTryControlFlowChild(current.fields)) return true
  if (hasUnsupportedAsyncTaskTryControlFlowChild(current.methods)) return true
  if (hasUnsupportedAsyncTaskTryControlFlowChild(current.init)) return true
  if (hasUnsupportedAsyncTaskTryControlFlowChild(current.condition)) return true
  if (hasUnsupportedAsyncTaskTryControlFlowChild(current.consequent)) return true
  if (hasUnsupportedAsyncTaskTryControlFlowChild(current.alternate)) return true
  if (hasUnsupportedAsyncTaskTryControlFlowChild(current.test)) return true
  if (hasUnsupportedAsyncTaskTryControlFlowChild(current.update)) return true
  if (hasUnsupportedAsyncTaskTryControlFlowChild(current.iterable)) return true
  if (hasUnsupportedAsyncTaskTryControlFlowChild(current.discriminant)) return true
  if (hasUnsupportedAsyncTaskTryControlFlowChild(current.cases)) return true
  if (hasUnsupportedAsyncTaskTryControlFlowChild(current.block)) return true
  if (hasUnsupportedAsyncTaskTryControlFlowChild(current.handler)) return true
  if (hasUnsupportedAsyncTaskTryControlFlowChild(current.finalizer)) return true
  if (hasUnsupportedAsyncTaskTryControlFlowChild(current.argument)) return true
  if (hasUnsupportedAsyncTaskTryControlFlowChild(current.args)) return true
  if (hasUnsupportedAsyncTaskTryControlFlowChild(current.callee)) return true
  if (hasUnsupportedAsyncTaskTryControlFlowChild(current.object)) return true
  if (hasUnsupportedAsyncTaskTryControlFlowChild(current.index)) return true
  if (hasUnsupportedAsyncTaskTryControlFlowChild(current.target)) return true
  if (hasUnsupportedAsyncTaskTryControlFlowChild(current.value)) return true
  if (hasUnsupportedAsyncTaskTryControlFlowChild(current.valueType)) return true
  if (hasUnsupportedAsyncTaskTryControlFlowChild(current.functionType)) return true
  if (hasUnsupportedAsyncTaskTryControlFlowChild(current.returnShape)) return true
  if (hasUnsupportedAsyncTaskTryControlFlowChild(current.left)) return true
  if (hasUnsupportedAsyncTaskTryControlFlowChild(current.right)) return true
  if (hasUnsupportedAsyncTaskTryControlFlowChild(current.elements)) return true
  if (hasUnsupportedAsyncTaskTryControlFlowChild(current.properties)) return true
  if (hasUnsupportedAsyncTaskTryControlFlowChild(current.expression)) return true

  return false
}

function isUnsupportedAsyncTaskTryControlFlowType(nodeType: string): boolean {
  return (
    nodeType === 'AwaitExpression' ||
    nodeType === 'ReturnStatement' ||
    nodeType === 'ThrowStatement' ||
    nodeType === 'TryStatement' ||
    nodeType === 'BreakStatement' ||
    nodeType === 'ContinueStatement'
  )
}

function resolveAsyncTaskAwaitSteps(
  statements: AsyncTaskAstNode[],
  context: AsyncTaskPlannerContext
): CAsyncTaskAwaitStep[] | null {
  const result = resolveAsyncTaskAwaitStepsAndTrailingStatements(statements, context)

  if (result != null && result.trailingStatements.length === 0) {
    return result.awaits
  }

  return null
}

function resolveAsyncTaskAwaitStepsAndTrailingStatements(
  statements: AsyncTaskAstNode[],
  context: AsyncTaskPlannerContext
): AsyncTaskAwaitStepsResult | null {
  const awaits: CAsyncTaskAwaitStep[] = []

  for (let index = 0; index < statements.length; ) {
    const statement = statements[index]
    const nextStatement = statements[index + 1]
    const directAwait = resolveAsyncTaskDirectAwaitStep(statement, context, awaits.length)

    if (directAwait != null) {
      awaits.push(directAwait)
      index = index + 1
      continue
    }

    const statementAwait = resolveAsyncTaskStatementAwaitStep(statement, context, awaits.length)

    if (statementAwait != null) {
      awaits.push(statementAwait)
      index = index + 1
      continue
    }

    const localPromiseAwait = resolveAsyncTaskLocalPromiseAwaitStep(statement, nextStatement, context, awaits.length)

    if (localPromiseAwait != null) {
      awaits.push(localPromiseAwait)
      index = index + 2
      continue
    }

    if (awaits.length === 0) {
      return null
    }

    return {
      awaits: awaits,
      trailingStatements: statements.slice(index)
    }
  }

  if (awaits.length === 0) {
    return null
  }

  return {
    awaits: awaits,
    trailingStatements: []
  }
}

function resolveAsyncTaskDirectAwaitStep(
  statement: AsyncTaskAstNode | null | undefined,
  context: AsyncTaskPlannerContext,
  index: number
): CAsyncTaskAwaitStep | null {
  if (statement == null || statement.type !== 'VariableDeclaration' || statement.init == null) {
    return null
  }

  if (statement.init.type !== 'AwaitExpression') {
    return null
  }

  let awaitedType = statement.valueType

  if (awaitedType == null) {
    awaitedType = statement.init.valueType
  }

  if (awaitedType == null) {
    awaitedType = 'unknown'
  }

  const awaitedExpression = statement.init.argument
  let awaitedPromiseExpression: AsyncTaskAstNode | null = null

  if (isSupportedAsyncTaskDirectAwaitPromiseExpression(awaitedExpression, context)) {
    awaitedPromiseExpression = awaitedExpression
  }

  if (!isSupportedAsyncTaskValueType(awaitedType) || awaitedType === 'void') {
    return null
  }

  let shape: CObjectShape | null = null
  let arrayElementType = 'unknown'
  let mapKeyType: string | null = null
  let mapValueType: string | null = null
  let setElementType: string | null = null

  if (awaitedType === 'object') {
    if (statement.shape != null) {
      shape = statement.shape
    } else if (statement.init.shape != null) {
      shape = statement.init.shape
    } else if (awaitedExpression != null && awaitedExpression.shape != null) {
      shape = awaitedExpression.shape
    } else {
      shape = null
    }
  }

  if (statement.arrayElementType != null) {
    arrayElementType = statement.arrayElementType
  } else if (statement.init.arrayElementType != null) {
    arrayElementType = statement.init.arrayElementType
  } else if (awaitedExpression != null && awaitedExpression.arrayElementType != null) {
    arrayElementType = awaitedExpression.arrayElementType
  }

  if (awaitedType === 'map') {
    if (statement.mapKeyType != null) {
      mapKeyType = statement.mapKeyType
    } else if (statement.init.mapKeyType != null) {
      mapKeyType = statement.init.mapKeyType
    } else if (awaitedExpression != null && awaitedExpression.mapKeyType != null) {
      mapKeyType = awaitedExpression.mapKeyType
    } else {
      mapKeyType = 'unknown'
    }

    if (statement.mapValueType != null) {
      mapValueType = statement.mapValueType
    } else if (statement.init.mapValueType != null) {
      mapValueType = statement.init.mapValueType
    } else if (awaitedExpression != null && awaitedExpression.mapValueType != null) {
      mapValueType = awaitedExpression.mapValueType
    } else {
      mapValueType = 'unknown'
    }
  }

  if (awaitedType === 'set') {
    if (statement.setElementType != null) {
      setElementType = statement.setElementType
    } else if (statement.init.setElementType != null) {
      setElementType = statement.init.setElementType
    } else if (awaitedExpression != null && awaitedExpression.setElementType != null) {
      setElementType = awaitedExpression.setElementType
    } else {
      setElementType = 'unknown'
    }
  }

  let storedAwaitedExpression: AsyncTaskAstNode | null = awaitedExpression

  if (awaitedPromiseExpression != null) {
    storedAwaitedExpression = null
  }

  return {
    index: index,
    name: statement.name,
    type: awaitedType,
    fieldName: `local_${emitCIdentifier(statement.name)}`,
    shape: shape,
    arrayElementType: arrayElementType,
    mapKeyType: mapKeyType,
    mapValueType: mapValueType,
    setElementType: setElementType,
    awaitedExpression: storedAwaitedExpression,
    awaitedPromiseExpression: awaitedPromiseExpression
  }
}

function resolveAsyncTaskStatementAwaitStep(
  statement: AsyncTaskAstNode | null | undefined,
  context: AsyncTaskPlannerContext,
  index: number
): CAsyncTaskAwaitStep | null {
  if (statement == null || statement.type !== 'ExpressionStatement' || statement.expression == null) {
    return null
  }

  if (statement.expression.type !== 'AwaitExpression') {
    return null
  }

  let awaitedType = statement.expression.valueType

  if (awaitedType == null) {
    awaitedType = 'void'
  }

  const awaitedExpression = statement.expression.argument
  let awaitedPromiseExpression: AsyncTaskAstNode | null = null

  if (isSupportedAsyncTaskDirectAwaitPromiseExpression(awaitedExpression, context)) {
    awaitedPromiseExpression = awaitedExpression
  }

  if (awaitedType !== 'void') {
    return null
  }

  let storedAwaitedExpression: AsyncTaskAstNode | null = awaitedExpression

  if (awaitedPromiseExpression != null) {
    storedAwaitedExpression = null
  }

  return {
    index: index,
    name: null,
    type: awaitedType,
    fieldName: null,
    awaitedExpression: storedAwaitedExpression,
    awaitedPromiseExpression: awaitedPromiseExpression
  }
}

function resolveAsyncTaskLocalPromiseAwaitStep(
  promiseStatement: AsyncTaskAstNode | null | undefined,
  awaitStatement: AsyncTaskAstNode | null | undefined,
  context: AsyncTaskPlannerContext,
  index: number
): CAsyncTaskAwaitStep | null {
  if (awaitStatement == null || awaitStatement.type !== 'VariableDeclaration' || awaitStatement.init == null) {
    return null
  }

  if (awaitStatement.init.type !== 'AwaitExpression') {
    return null
  }

  const awaitedPromiseExpression = resolveAsyncTaskAwaitedPromiseExpression(promiseStatement, awaitStatement, context)

  if (awaitedPromiseExpression == null) {
    return null
  }

  let awaitedType = awaitStatement.valueType

  if (awaitedType == null) {
    awaitedType = awaitStatement.init.valueType
  }

  if (awaitedType == null) {
    awaitedType = 'unknown'
  }

  if (!isSupportedAsyncTaskValueType(awaitedType) || awaitedType === 'void') {
    return null
  }

  let shape: CObjectShape | null = null
  let arrayElementType: string | null = null
  let mapKeyType: string | null = null
  let mapValueType: string | null = null
  let setElementType: string | null = null

  if (awaitedType === 'object') {
    if (awaitStatement.shape != null) {
      shape = awaitStatement.shape
    } else if (awaitStatement.init.shape != null) {
      shape = awaitStatement.init.shape
    } else if (awaitedPromiseExpression.shape != null) {
      shape = awaitedPromiseExpression.shape
    } else {
      shape = null
    }
  }

  if (awaitStatement.arrayElementType != null) {
    arrayElementType = awaitStatement.arrayElementType
  } else if (awaitStatement.init.arrayElementType != null) {
    arrayElementType = awaitStatement.init.arrayElementType
  } else {
    arrayElementType = awaitedPromiseExpression.arrayElementType

    if (arrayElementType == null) {
      arrayElementType = null
    }
  }

  if (awaitedType === 'map') {
    if (awaitStatement.mapKeyType != null) {
      mapKeyType = awaitStatement.mapKeyType
    } else if (awaitStatement.init.mapKeyType != null) {
      mapKeyType = awaitStatement.init.mapKeyType
    } else if (awaitedPromiseExpression.mapKeyType != null) {
      mapKeyType = awaitedPromiseExpression.mapKeyType
    } else {
      mapKeyType = 'unknown'
    }

    if (awaitStatement.mapValueType != null) {
      mapValueType = awaitStatement.mapValueType
    } else if (awaitStatement.init.mapValueType != null) {
      mapValueType = awaitStatement.init.mapValueType
    } else if (awaitedPromiseExpression.mapValueType != null) {
      mapValueType = awaitedPromiseExpression.mapValueType
    } else {
      mapValueType = 'unknown'
    }
  }

  if (awaitedType === 'set') {
    if (awaitStatement.setElementType != null) {
      setElementType = awaitStatement.setElementType
    } else if (awaitStatement.init.setElementType != null) {
      setElementType = awaitStatement.init.setElementType
    } else if (awaitedPromiseExpression.setElementType != null) {
      setElementType = awaitedPromiseExpression.setElementType
    } else {
      setElementType = 'unknown'
    }
  }

  return {
    index: index,
    name: awaitStatement.name,
    type: awaitedType,
    fieldName: `local_${emitCIdentifier(awaitStatement.name)}`,
    shape: shape,
    arrayElementType: arrayElementType,
    mapKeyType: mapKeyType,
    mapValueType: mapValueType,
    setElementType: setElementType,
    awaitedExpression: null,
    awaitedPromiseExpression: awaitedPromiseExpression
  }
}

function resolveAsyncTaskAwaitedPromiseExpression(
  promiseStatement: AsyncTaskAstNode | null | undefined,
  awaitStatement: AsyncTaskAstNode,
  context: AsyncTaskPlannerContext
): AsyncTaskAstNode | null {
  if (promiseStatement == null) {
    return null
  }

  if (
    promiseStatement.type !== 'VariableDeclaration' ||
    promiseStatement.init == null ||
    promiseStatement.init.valueType !== 'promise' ||
    !isSupportedAsyncTaskAwaitedPromiseExpression(promiseStatement.init, context)
  ) {
    return null
  }

  let awaited: AsyncTaskAstNode | null = null

  if (awaitStatement.init != null) {
    awaited = awaitStatement.init.argument
  }

  if (awaited == null || awaited.type !== 'Reference' || awaited.path.length !== 1 || awaited.path[0] !== promiseStatement.name) {
    return null
  }

  return promiseStatement.init
}

function isSupportedAsyncTaskAwaitedPromiseExpression(
  expression: AsyncTaskAstNode | null | undefined,
  context: AsyncTaskPlannerContext
): boolean {
  if (expression == null || expression.type !== 'CallExpression') {
    return false
  }

  if (isSupportedAsyncTaskDirectAwaitPromiseExpression(expression, context)) {
    return true
  }

  if (cPromiseRuntimeCallName(expression.callee) === 'resolve') {
    return true
  }

  if (expression.callee == null || expression.callee.type !== 'MemberExpression' || expression.callee.property !== 'then') {
    return false
  }

  const receiver = asyncTaskMemberObjectOrNull(expression)
  const callback = asyncTaskNodeOrEmpty(asyncTaskFirstArgumentOrNull(expression))

  if (receiver == null || receiver.type !== 'CallExpression') {
    return false
  }

  if (cPromiseRuntimeCallName(receiver.callee) !== 'resolve') {
    return false
  }

  if (callback.type !== 'ArrowFunctionExpression') {
    return false
  }

  return context.promiseChainArrowWrappers.has(callback)
}

function isSupportedAsyncTaskDirectAwaitPromiseExpression(
  expression: AsyncTaskAstNode | null | undefined,
  context: AsyncTaskPlannerContext
): boolean {
  if (expression == null || expression.type !== 'CallExpression') {
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

  if (!isAsyncFunctionCallee(expression.callee, context) || asyncTaskDeps(context).isThrowingFunctionCallee(expression.callee, context)) {
    return false
  }

  const valueType = resolvedAsyncFunctionAwaitValueType(expression, context)

  return isSupportedAsyncTaskValueType(valueType)
}

function resolvedAsyncFunctionAwaitValueType(
  expression: AsyncTaskAstNode,
  context: AsyncTaskPlannerContext
): string {
  const resolvedValueType = resolveCAsyncFunctionAwaitValueType(expression.callee, context)

  if (resolvedValueType != null) {
    return resolvedValueType
  }

  if (expression.promiseValueType != null) {
    return expression.promiseValueType
  }

  return 'unknown'
}

function resolveAsyncTaskReturnValueExpression(
  expression: AsyncTaskAstNode | null | undefined,
  returnType: string,
  context: AsyncTaskPlannerContext
): AsyncTaskAstNode | null {
  if (returnType === 'void') {
    if (expression == null) {
      return null
    }

    return expression
  }

  if (expression != null && expression.type === 'CallExpression' && cPromiseRuntimeCallName(expression.callee) === 'resolve') {
    if (expression.args[0] == null) {
      return null
    }

    return expression.args[0]
  }

  if (expression == null) {
    return null
  }

  let expressionType = 'unknown'

  if (expression.valueType != null && expression.valueType !== 'unknown') {
    expressionType = expression.valueType
  } else {
    expressionType = asyncTaskDeps(context).inferExpressionType(expression, context)
  }

  if (isSupportedAsyncTaskValueType(returnType) && expressionType === returnType) {
    return expression
  }

  return null
}

export function emitAsyncTaskFrameType(wrapper: CAsyncTaskWrapper): string[] {
  const lines: string[] = []

  lines.push(`typedef struct ${wrapper.frameTypeName} {`)
  lines.push('  ccjs_loop* ccjs_loop;')
  lines.push('  ccjs_promise* promise;')
  lines.push('  ccjs_promise* awaited;')
  lines.push('  int state;')

  for (const param of wrapper.params) {
    lines.push(`  ${emitAsyncTaskStorageCType(param.valueType)} ${param.fieldName};`)
  }

  for (const local of wrapper.frameLocals) {
    lines.push(`  ${emitAsyncTaskStorageCType(local.type)} ${local.fieldName};`)
  }

  lines.push(`} ${wrapper.frameTypeName};`)

  return lines
}

function emitAsyncTaskStorageCType(valueType: string): string {
  if (isManagedRuntimeReturnType(valueType)) {
    return 'ccjs_value'
  }

  return emitCType(valueType)
}

function emitAsyncTaskStorageInit(valueType: string): string {
  if (isManagedRuntimeReturnType(valueType)) {
    return 'ccjs_undefined_value()'
  }

  return '0'
}

export function emitAsyncTaskWrapperPrototypes(wrapper: CAsyncTaskWrapper): string[] {
  return [
    `static ccjs_status ${wrapper.startName}(${emitAsyncTaskStartParams(wrapper)});`,
    `static ccjs_status ${wrapper.resumeName}(void* context, ccjs_value ccjs_value_input);`,
    `static ccjs_status ${wrapper.rejectName}(void* context, ccjs_value ccjs_error);`,
    `static void ${wrapper.finalizerName}(void* context);`
  ]
}

export function emitAsyncTaskWrapperDeclaration(
  wrapper: CAsyncTaskWrapper,
  baseContext: AsyncTaskEmitContext,
  dependencies: AsyncTaskLoweringDependencies
): string[] {
  baseContext.asyncTaskLoweringDependencies = dependencies
  const lines: string[] = []

  appendAsyncTaskLines(lines, emitAsyncTaskStartDeclaration(wrapper, baseContext))
  lines.push('')
  appendAsyncTaskLines(lines, emitAsyncTaskResumeDeclaration(wrapper, baseContext))
  lines.push('')
  appendAsyncTaskLines(lines, emitAsyncTaskRejectDeclaration(wrapper, baseContext))
  lines.push('')
  appendAsyncTaskLines(lines, emitAsyncTaskFinalizerDeclaration(wrapper))

  return lines
}

function emitAsyncTaskStartDeclaration(wrapper: CAsyncTaskWrapper, baseContext: AsyncTaskEmitContext): string[] {
  const context = createAsyncTaskEmitContext(baseContext, wrapper, 'void', 0)
  context.forceRuntimeStringDeclarations = new Set()
  const prefixLocals: CAsyncTaskPrefixFrameLocal[] = collectAsyncTaskFrameLocals(wrapper, 'prefix')

  for (let index = 0; index < prefixLocals.length; index = index + 1) {
    const local = asyncTaskPrefixFrameLocalAt(prefixLocals, index)

    if (local.forceRuntimeStringDeclaration === true) {
      context.forceRuntimeStringDeclarations.add(local.name)
    }
  }

  context.failureStatement = 'goto ccjs_start_error;'
  const prefixScope = asyncTaskDeps(context).pushVariableScope(context)
  const prefixAndScheduleLines: string[] = []
  const prefixStatements: AsyncTaskAstNode[] = wrapper.prefixStatements
  const firstAwait = asyncTaskAwaitStepAt(wrapper.awaits, 0)

  appendAsyncTaskLines(prefixAndScheduleLines, asyncTaskDeps(context).emitStatementList(prefixStatements, context))
  appendAsyncTaskLines(prefixAndScheduleLines, emitAsyncTaskStorePrefixLocalLines(wrapper))
  appendAsyncTaskLines(
    prefixAndScheduleLines,
    emitAsyncTaskScheduleAwaitLines(wrapper, firstAwait, context, {
      cleanup: 'start',
      final: wrapper.awaits.length === 1
    })
  )
  asyncTaskDeps(context).restoreVariableScope(context, prefixScope)

  const lines: string[] = []

  lines.push(`static ccjs_status ${wrapper.startName}(${emitAsyncTaskStartParams(wrapper)}) {`)
  lines.push('  if (ccjs_loop == 0 || ccjs_loop->allocator == 0 || out == 0) return CCJS_ERR_TYPE;')
  lines.push('  *out = 0;')
  lines.push(`  ${wrapper.frameTypeName}* frame = ccjs_loop->allocator->alloc(ccjs_loop->allocator->user, sizeof(${wrapper.frameTypeName}), _Alignof(${wrapper.frameTypeName}));`)
  lines.push('  if (frame == 0) return CCJS_ERR_OOM;')
  lines.push('  frame->ccjs_loop = ccjs_loop;')
  lines.push('  frame->promise = 0;')
  lines.push('  frame->awaited = 0;')
  lines.push('  frame->state = 0;')

  for (const param of wrapper.params) {
    lines.push(`  frame->${param.fieldName} = ${param.argName};`)
  }

  for (const local of wrapper.frameLocals) {
    lines.push(`  frame->${local.fieldName} = ${emitAsyncTaskStorageInit(local.type)};`)
  }

  lines.push('  ccjs_status status = ccjs_promise_new(ccjs_loop, &frame->promise);')
  appendIndentedAsyncTaskLines(lines, asyncTaskDeps(context).emitOwnedValueDeclarations(context), '  ')
  lines.push('  if (status != CCJS_OK) {')
  lines.push('    ccjs_loop->allocator->free(ccjs_loop->allocator->user, frame, sizeof(*frame), _Alignof(*frame));')
  lines.push('    return status;')
  lines.push('  }')

  for (const param of wrapper.params) {
    if (isManagedRuntimeReturnType(param.valueType)) {
      lines.push(`  ccjs_retain(frame->${param.fieldName});`)
    }
  }

  lines.push('  ccjs_promise_retain(frame->promise);')
  lines.push('  *out = frame->promise;')
  appendIndentedAsyncTaskLines(lines, emitAsyncTaskVisibleLocalReads(wrapper, 0, { includePrefixLocals: false }), '  ')
  appendIndentedAsyncTaskLines(lines, prefixAndScheduleLines, '  ')
  appendIndentedAsyncTaskLines(lines, asyncTaskDeps(context).emitOwnedValueCleanup(context), '  ')
  lines.push('  return CCJS_OK;')

  if (context.failureStatementUsed) {
    lines.push('ccjs_start_error:')
    appendIndentedAsyncTaskLines(lines, asyncTaskDeps(context).emitOwnedValueCleanup(context), '  ')
    lines.push('  ccjs_promise_release(*out);')
    lines.push('  *out = 0;')
    lines.push(`  ${wrapper.finalizerName}(frame);`)
    lines.push('  return CCJS_ERR_TYPE;')
  }

  lines.push('}')

  return lines
}

function emitAsyncTaskStartParams(wrapper: CAsyncTaskWrapper): string {
  const params = ['ccjs_loop* ccjs_loop']

  for (const param of wrapper.params) {
    params.push(`${emitCType(param.valueType)} ${param.argName}`)
  }

  params.push('ccjs_promise** out')

  return joinStrings(params, ', ')
}

function registerAsyncTaskParams(wrapper: CAsyncTaskWrapper, context: AsyncTaskFunctionContext): void {
  for (const param of wrapper.params) {
    registerAsyncTaskLocalMetadata(param.name, param.valueType, param, context)
  }
}

function registerAsyncTaskAwaitLocals(wrapper: CAsyncTaskWrapper, context: AsyncTaskFunctionContext, count: number): void {
  const locals: CAsyncTaskAwaitFrameLocal[] = collectAsyncTaskVisibleAwaitFrameLocals(wrapper, count)

  for (let index = 0; index < locals.length; index = index + 1) {
    const item = asyncTaskAwaitFrameLocalAt(locals, index)
    const name = item.name

    if (name != null) {
      registerAsyncTaskLocalMetadata(name, item.type, item, context)
    }
  }
}

function registerAsyncTaskPrefixLocals(wrapper: CAsyncTaskWrapper, context: AsyncTaskFunctionContext): void {
  const locals: CAsyncTaskPrefixFrameLocal[] = collectAsyncTaskFrameLocals(wrapper, 'prefix')

  for (let index = 0; index < locals.length; index = index + 1) {
    const local = asyncTaskPrefixFrameLocalAt(locals, index)

    registerAsyncTaskLocalMetadata(local.name, local.type, local, context)
  }
}

function emitAsyncTaskStorePrefixLocalLines(wrapper: CAsyncTaskWrapper): string[] {
  const lines: string[] = []
  const locals: CAsyncTaskPrefixFrameLocal[] = collectAsyncTaskFrameLocals(wrapper, 'prefix')

  for (let index = 0; index < locals.length; index = index + 1) {
    const local = asyncTaskPrefixFrameLocalAt(locals, index)

    if (local.type === 'string') {
      appendAsyncTaskLines(lines, emitPrepareOwnedValueWrite(`frame->${local.fieldName}`))
      lines.push(`frame->${local.fieldName}.tag = CCJS_TAG_STRING;`)
      lines.push(`frame->${local.fieldName}.as.ref = (ccjs_ref*)&${local.name}->header;`)
      lines.push(`ccjs_retain(frame->${local.fieldName});`)
      continue
    }

    if (isManagedRuntimeReturnType(local.type)) {
      appendAsyncTaskLines(lines, emitPrepareOwnedValueWrite(`frame->${local.fieldName}`))
      lines.push(`frame->${local.fieldName} = ${local.name};`)
      lines.push(`ccjs_retain(frame->${local.fieldName});`)
      continue
    }

    lines.push(`frame->${local.fieldName} = ${local.name};`)
  }

  return lines
}

function emitAsyncTaskVisibleLocalReads(
  wrapper: CAsyncTaskWrapper,
  count: number,
  options: AsyncTaskVisibleLocalReadOptions | null
): string[] {
  const lines: string[] = []

  for (const param of wrapper.params) {
    appendAsyncTaskLines(lines, emitAsyncTaskVisibleLocalRead(param.name, param.valueType, param.fieldName))
  }

  if (options == null || options.includePrefixLocals !== false) {
    const prefixLocals: CAsyncTaskPrefixFrameLocal[] = collectAsyncTaskFrameLocals(wrapper, 'prefix')

    for (let index = 0; index < prefixLocals.length; index = index + 1) {
      const local = asyncTaskPrefixFrameLocalAt(prefixLocals, index)

      appendAsyncTaskLines(lines, emitAsyncTaskVisibleLocalRead(local.name, local.type, local.fieldName))
    }
  }

  const awaitLocals: CAsyncTaskAwaitFrameLocal[] = collectAsyncTaskVisibleAwaitFrameLocals(wrapper, count)

  for (let index = 0; index < awaitLocals.length; index = index + 1) {
    const item = asyncTaskAwaitFrameLocalAt(awaitLocals, index)
    const name = item.name
    const fieldName = item.fieldName

    if (name != null && fieldName != null) {
      appendAsyncTaskLines(lines, emitAsyncTaskVisibleLocalRead(name, item.type, fieldName))
    }
  }

  return lines
}

function collectAsyncTaskFrameLocals(wrapper: CAsyncTaskWrapper, kind: 'prefix'): CAsyncTaskPrefixFrameLocal[]
function collectAsyncTaskFrameLocals(wrapper: CAsyncTaskWrapper, kind: 'await'): CAsyncTaskAwaitFrameLocal[]
function collectAsyncTaskFrameLocals(wrapper: CAsyncTaskWrapper): CAsyncTaskFrameLocal[]
function collectAsyncTaskFrameLocals(
  wrapper: CAsyncTaskWrapper,
  kind: CAsyncTaskFrameLocalKind | 'all' = 'all'
): CAsyncTaskFrameLocal[] {
  const locals: CAsyncTaskFrameLocal[] = []
  const frameLocals: CAsyncTaskFrameLocal[] = wrapper.frameLocals

  for (let index = 0; index < frameLocals.length; index = index + 1) {
    const local = asyncTaskFrameLocalAt(frameLocals, index)

    if (kind === 'all' || local.kind === kind) {
      locals.push(local)
    }
  }

  return locals
}

function collectAsyncTaskVisibleAwaitFrameLocals(
  wrapper: CAsyncTaskWrapper,
  count: number
): CAsyncTaskAwaitFrameLocal[] {
  const locals: CAsyncTaskAwaitFrameLocal[] = []
  const source: CAsyncTaskAwaitFrameLocal[] = collectAsyncTaskFrameLocals(wrapper, 'await')

  for (let index = 0; index < source.length; index = index + 1) {
    const local = asyncTaskAwaitFrameLocalAt(source, index)

    if (local.index < count && local.name != null) {
      locals.push(local)
    }
  }

  return locals
}

function registerAsyncTaskLocalMetadata(
  name: string,
  valueType: string,
  item: CAsyncTaskFrameLocal | CAsyncTaskAwaitStep | CAsyncTaskParam | CAsyncTaskPrefixLocal,
  context: AsyncTaskFunctionContext
): void {
  context.variables.set(name, valueType)

  if (valueType === 'string') {
    context.runtimeStrings.add(name)
  } else if (valueType === 'object') {
    asyncTaskDeps(context).registerObjectShape(context, name, item.shape)
  } else if (valueType === 'array') {
    let arrayElementType = item.arrayElementType

    if (arrayElementType == null) {
      arrayElementType = 'unknown'
    }

    context.runtimeArrayElementTypes.set(name, arrayElementType)
  } else if (valueType === 'map') {
    let mapKeyType = item.mapKeyType
    let mapValueType = item.mapValueType

    if (mapKeyType == null) {
      mapKeyType = 'unknown'
    }

    if (mapValueType == null) {
      mapValueType = 'unknown'
    }

    context.mapTypes.set(name, {
      key: mapKeyType,
      value: mapValueType
    })
  } else if (valueType === 'set') {
    let setElementType = item.setElementType

    if (setElementType == null) {
      setElementType = 'unknown'
    }

    context.setElementTypes.set(name, setElementType)
  }
}

function emitAsyncTaskVisibleLocalRead(name: string, valueType: string, fieldName: string): string[] {
  if (valueType === 'string') {
    return [`ccjs_string* ${name} = (ccjs_string*)frame->${fieldName}.as.ref;`]
  }

  if (isManagedRuntimeReturnType(valueType)) {
    return [`ccjs_value ${name} = frame->${fieldName};`]
  }

  return [`${emitCType(valueType)} ${name} = frame->${fieldName};`]
}

function createAsyncTaskEmitContext(
  baseContext: AsyncTaskEmitContext,
  wrapper: CAsyncTaskWrapper,
  returnType: string,
  visibleAwaitCount: number
): AsyncTaskFunctionContext {
  const context = asyncTaskDeps(baseContext).createFunctionContext(baseContext, returnType, false)
  context.statusReturn = true
  context.externalEventLoop = true
  context.eventLoopUsed = true
  registerAsyncTaskParams(wrapper, context)
  registerAsyncTaskPrefixLocals(wrapper, context)
  registerAsyncTaskAwaitLocals(wrapper, context, visibleAwaitCount)

  return context
}

function emitAsyncTaskScheduleAwaitLines(
  wrapper: CAsyncTaskWrapper,
  item: CAsyncTaskAwaitStep,
  context: AsyncTaskFunctionContext,
  options: AsyncTaskScheduleOptions
): string[] {
  const awaitedPromise = emitPreparedAsyncTaskAwaitedPromiseExpression(wrapper, item, context, options)
  let awaited: PreparedExpression | null = null

  if (awaitedPromise == null) {
    awaited = emitPreparedAsyncTaskAwaitedValueExpression(item, context)
  }

  let finalizer = '0'

  if (options.final) {
    finalizer = wrapper.finalizerName
  }

  let cleanupLines = options.cleanupLines

  if (cleanupLines == null) {
    cleanupLines = asyncTaskDeps(context).emitOwnedValueCleanup(context)
  }

  const lines: string[] = []

  if (awaitedPromise == null) {
    lines.push('status = ccjs_promise_new(ccjs_loop, &frame->awaited);')
    appendAsyncTaskLines(lines, emitAsyncTaskScheduleStatusCheck(wrapper, options, cleanupLines))
  } else {
    appendAsyncTaskLines(lines, awaitedPromise.lines)
  }

  lines.push(`status = ccjs_promise_then(frame->awaited, ${wrapper.resumeName}, ${wrapper.rejectName}, frame, ${finalizer});`)
  appendAsyncTaskLines(lines, emitAsyncTaskScheduleStatusCheck(wrapper, options, cleanupLines))

  if (awaitedPromise == null) {
    let awaitedExpression = 'ccjs_undefined_value()'

    if (awaited != null) {
      appendAsyncTaskLines(lines, awaited.lines)
      awaitedExpression = awaited.expression
    }

    lines.push(`status = ccjs_promise_resolve(frame->awaited, ${awaitedExpression});`)
    appendAsyncTaskLines(lines, emitAsyncTaskResolveStatusCheck(wrapper, options, cleanupLines))
  }

  return lines
}

function emitAsyncTaskScheduleStatusCheck(
  wrapper: CAsyncTaskWrapper,
  options: AsyncTaskScheduleOptions,
  cleanupLines: string[] | null
): string[] {
  const lines: string[] = []
  const activeCleanupLines = asyncTaskLinesOrEmpty(cleanupLines)

  if (options.cleanup === 'start') {
    lines.push('if (status != CCJS_OK) {')
    appendIndentedAsyncTaskLines(lines, activeCleanupLines, '  ')
    lines.push('  ccjs_promise_release(*out);')
    lines.push('  *out = 0;')
    lines.push(`  ${wrapper.finalizerName}(frame);`)
    lines.push('  return status;')
    lines.push('}')

    return lines
  }

  lines.push('if (status != CCJS_OK) {')
  appendIndentedAsyncTaskLines(lines, activeCleanupLines, '  ')
  lines.push('  ccjs_status reject_status = ccjs_promise_reject(frame->promise, ccjs_number_value((ccjs_number)status));')
  lines.push(`  ${wrapper.finalizerName}(frame);`)
  lines.push('  return reject_status == CCJS_OK ? status : reject_status;')
  lines.push('}')

  return lines
}

function emitAsyncTaskResolveStatusCheck(
  wrapper: CAsyncTaskWrapper,
  options: AsyncTaskScheduleOptions,
  cleanupLines: string[] | null
): string[] {
  const lines: string[] = []
  const activeCleanupLines = asyncTaskLinesOrEmpty(cleanupLines)

  if (options.cleanup === 'start') {
    lines.push('if (status != CCJS_OK) {')
    appendIndentedAsyncTaskLines(lines, activeCleanupLines, '  ')
    lines.push('  ccjs_promise_release(*out);')
    lines.push('  *out = 0;')

    if (!options.final) {
      lines.push(`  ${wrapper.finalizerName}(frame);`)
    }

    lines.push('  return status;')
    lines.push('}')

    return lines
  }

  if (options.final) {
    lines.push('if (status != CCJS_OK) {')
    appendIndentedAsyncTaskLines(lines, activeCleanupLines, '  ')
    lines.push('  return status;')
    lines.push('}')

    return lines
  }

  return emitAsyncTaskScheduleStatusCheck(wrapper, options, activeCleanupLines)
}

function asyncTaskLinesOrEmpty(lines: string[] | null): string[] {
  if (lines != null) {
    return lines
  }

  return []
}

function asyncTaskNodeOrEmpty(node: AsyncTaskAstNode | null | undefined): AsyncTaskAstNode {
  if (node != null) {
    return node
  }

  return { type: '' }
}

function asyncTaskMemberObjectOrNull(expression: AsyncTaskAstNode): AsyncTaskAstNode | null {
  const callee = expression.callee

  if (callee == null) {
    return null
  }

  const object = callee.object

  if (object == null) {
    return null
  }

  return object
}

function asyncTaskFirstArgumentOrNull(expression: AsyncTaskAstNode): AsyncTaskAstNode | null {
  const args: AsyncTaskAstNode[] = expression.args

  if (args.length === 0) {
    return null
  }

  const argument = maybeAsyncTaskNodeAt(args, 0)

  if (argument == null) {
    return null
  }

  return argument
}

function asyncTaskReferenceNameOrNull(expression: AsyncTaskAstNode | null | undefined): string | null {
  if (expression == null || expression.type !== 'Reference' || expression.path.length !== 1) {
    return null
  }

  return expression.path[0]
}

function asyncTaskLocationOrNull(expression: AsyncTaskAstNode): SourceLocation | null {
  const loc = expression.loc

  if (loc == null) {
    return null
  }

  return loc
}

function emitPreparedAsyncTaskAwaitedPromiseExpression(
  wrapper: CAsyncTaskWrapper,
  item: CAsyncTaskAwaitStep,
  context: AsyncTaskFunctionContext,
  options: AsyncTaskScheduleOptions
): PreparedAsyncTaskPromise | null {
  const awaitedPromiseExpression = item.awaitedPromiseExpression

  if (awaitedPromiseExpression == null) {
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
    awaitedPromiseExpression.type !== 'CallExpression' ||
    cPromiseRuntimeCallName(awaitedPromiseExpression.callee) !== 'resolve'
  ) {
    const loc: SourceLocation | null = awaitedPromiseExpression.loc

    context.diagnostics.push(
      diagnostic(
        'CCJS_C_ASYNC',
        'async task state-machine slice currently supports local Promise.resolve call variables only',
        loc
      )
    )

    return {
      lines: emitAsyncTaskErrorStatusLines(wrapper, options)
    }
  }

  let awaitedValueExpression: AnyNode | null = null

  if (awaitedPromiseExpression.args[0] != null) {
    awaitedValueExpression = awaitedPromiseExpression.args[0]
  }

  const value = emitPreparedAsyncTaskValueExpression(awaitedValueExpression, item.type, context)
  const lines: string[] = []

  appendAsyncTaskLines(lines, value.lines)
  lines.push(`status = ccjs_promise_resolved(ccjs_loop, ${value.expression}, &frame->awaited);`)
  appendAsyncTaskLines(lines, emitAsyncTaskScheduleStatusCheck(wrapper, options, null))

  return {
    lines: lines
  }
}

function emitAsyncTaskErrorStatusLines(wrapper: CAsyncTaskWrapper, options: AsyncTaskScheduleOptions): string[] {
  const lines = ['status = CCJS_ERR_TYPE;']

  appendAsyncTaskLines(lines, emitAsyncTaskScheduleStatusCheck(wrapper, options, null))

  return lines
}

function emitPreparedAsyncTaskPromiseSourceExpression(
  wrapper: CAsyncTaskWrapper,
  item: CAsyncTaskAwaitStep,
  context: AsyncTaskFunctionContext,
  options: AsyncTaskScheduleOptions
): PreparedAsyncTaskPromise | null {
  const expression = item.awaitedPromiseExpression

  if (expression == null || expression.type !== 'CallExpression') {
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

function emitPreparedAsyncTaskFsSourceExpression(
  expression,
  wrapper: CAsyncTaskWrapper,
  context: AsyncTaskFunctionContext,
  options: AsyncTaskScheduleOptions
): PreparedAsyncTaskPromise | null {
  if (!isAsyncFsRuntimeCallExpression(expression)) {
    return null
  }

  const method = cFsRuntimeExpressionMethod(expression)
  const path = asyncTaskDeps(context).emitPreparedStringBytesOperand(expression.args[0], context, 'ccjs_fs_path')
  const lines: string[] = []

  appendAsyncTaskLines(lines, path.lines)

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
    const mode = asyncTaskDeps(context).emitPreparedFsAccessModeExpression(expression, context)

    appendAsyncTaskLines(lines, mode.lines)
    lines.push(
      `status = ccjs_fs_access(ccjs_loop, ${path.bytes}, ${path.length}, ${mode.expression}, &frame->awaited);`
    )
  } else if (method === 'appendFileBytes') {
    const bytes = asyncTaskDeps(context).emitCValueExpression(expression.args[1], context)

    appendAsyncTaskLines(lines, bytes.lines)
    lines.push(emitRuntimeValueCheck(bytes.expression, 'CCJS_TAG_BYTES', context))
    lines.push(
      `status = ccjs_fs_append_file_bytes(ccjs_loop, ${path.bytes}, ${path.length}, ${bytes.expression}, &frame->awaited);`
    )
  } else if (method === 'appendFile') {
    const bytes = asyncTaskDeps(context).emitPreparedStringBytesOperand(expression.args[1], context, 'ccjs_fs_bytes')

    appendAsyncTaskLines(lines, bytes.lines)
    lines.push(
      `status = ccjs_fs_append_file(ccjs_loop, ${path.bytes}, ${path.length}, ${bytes.bytes}, ${bytes.length}, &frame->awaited);`
    )
  } else if (method === 'copyFile') {
    const destPath = asyncTaskDeps(context).emitPreparedStringBytesOperand(expression.args[1], context, 'ccjs_fs_dest_path')

    appendAsyncTaskLines(lines, destPath.lines)
    lines.push(
      `status = ccjs_fs_copy_file(ccjs_loop, ${path.bytes}, ${path.length}, ${destPath.bytes}, ${destPath.length}, &frame->awaited);`
    )
  } else if (method === 'symlink') {
    const linkPath = asyncTaskDeps(context).emitPreparedStringBytesOperand(expression.args[1], context, 'ccjs_fs_link_path')

    appendAsyncTaskLines(lines, linkPath.lines)
    lines.push(
      `status = ccjs_fs_symlink(ccjs_loop, ${path.bytes}, ${path.length}, ${linkPath.bytes}, ${linkPath.length}, &frame->awaited);`
    )
  } else if (method === 'mkdir') {
    lines.push(
      `status = ccjs_fs_mkdir(ccjs_loop, ${path.bytes}, ${path.length}, ${asyncTaskDeps(context).emitFsBooleanFlag(expression, 'fsRecursive')}, &frame->awaited);`
    )
  } else if (method === 'unlink') {
    lines.push(`status = ccjs_fs_unlink(ccjs_loop, ${path.bytes}, ${path.length}, &frame->awaited);`)
  } else if (method === 'rm') {
    lines.push(
      `status = ccjs_fs_rm(ccjs_loop, ${path.bytes}, ${path.length}, ${asyncTaskDeps(context).emitFsBooleanFlag(expression, 'fsRecursive')}, ${asyncTaskDeps(context).emitFsBooleanFlag(expression, 'fsForce')}, &frame->awaited);`
    )
  } else if (method === 'rename') {
    const newPath = asyncTaskDeps(context).emitPreparedStringBytesOperand(expression.args[1], context, 'ccjs_fs_new_path')

    appendAsyncTaskLines(lines, newPath.lines)
    lines.push(
      `status = ccjs_fs_rename(ccjs_loop, ${path.bytes}, ${path.length}, ${newPath.bytes}, ${newPath.length}, &frame->awaited);`
    )
  } else if (method === 'writeFileBytes') {
    const bytes = asyncTaskDeps(context).emitCValueExpression(expression.args[1], context)

    appendAsyncTaskLines(lines, bytes.lines)
    lines.push(emitRuntimeValueCheck(bytes.expression, 'CCJS_TAG_BYTES', context))
    lines.push(
      `status = ccjs_fs_write_file_bytes(ccjs_loop, ${path.bytes}, ${path.length}, ${bytes.expression}, &frame->awaited);`
    )
  } else {
    const bytes = asyncTaskDeps(context).emitPreparedStringBytesOperand(expression.args[1], context, 'ccjs_fs_bytes')

    appendAsyncTaskLines(lines, bytes.lines)
    lines.push(
      `status = ccjs_fs_write_file(ccjs_loop, ${path.bytes}, ${path.length}, ${bytes.bytes}, ${bytes.length}, &frame->awaited);`
    )
  }

  appendAsyncTaskLines(lines, emitAsyncTaskScheduleStatusCheck(wrapper, options, null))

  return {
    lines: lines
  }
}

function emitPreparedAsyncTaskFetchSourceExpression(
  expression,
  wrapper: CAsyncTaskWrapper,
  context: AsyncTaskFunctionContext,
  options: AsyncTaskScheduleOptions
): PreparedAsyncTaskPromise | null {
  if (!isAsyncFetchRuntimeCallExpression(expression)) {
    return null
  }

  const method = cFetchRuntimeExpressionMethod(expression)
  const lines: string[] = []

  if (method === 'fetch') {
    const url = asyncTaskDeps(context).emitPreparedStringBytesOperand(expression.args[0], context, 'ccjs_fetch_url')
    const init = asyncTaskDeps(context).emitPreparedFetchInitOperand(expression, context)

    appendAsyncTaskLines(lines, url.lines)
    appendAsyncTaskLines(lines, init.lines)

    if (init.expression === '0') {
      lines.push(`status = ccjs_fetch(ccjs_loop, ${url.bytes}, ${url.length}, &frame->awaited);`)
    } else {
      lines.push(`status = ccjs_fetch_with_init(ccjs_loop, ${url.bytes}, ${url.length}, ${init.expression}, &frame->awaited);`)
    }
  } else {
    const response = asyncTaskDeps(context).emitCValueExpression(expression.callee.object, context)

    appendAsyncTaskLines(lines, response.lines)
    lines.push(
      emitRuntimeTypeCheck(
        `${response.expression}.tag != CCJS_TAG_OBJECT || ${response.expression}.as.ref == 0`,
        context
      )
    )
    lines.push(`status = ccjs_fetch_response_text(ccjs_loop, ${response.expression}, &frame->awaited);`)
  }

  appendAsyncTaskLines(lines, emitAsyncTaskScheduleStatusCheck(wrapper, options, null))

  return {
    lines: lines
  }
}

function emitPreparedAsyncTaskRejectedPromiseSourceExpression(
  expression,
  wrapper: CAsyncTaskWrapper,
  context: AsyncTaskFunctionContext,
  options: AsyncTaskScheduleOptions
): PreparedAsyncTaskPromise | null {
  if (cPromiseRuntimeCallName(expression.callee) !== 'reject') {
    return null
  }

  const rejectArgument = asyncTaskFirstArgumentOrNull(expression)

  if (rejectArgument != null && rejectArgument.type === 'StringLiteral') {
    const value = nextCName(context, 'ccjs_reject_value')
    const bytes = cStringLiteral(rejectArgument.value)
    const length = utf8ByteLength(rejectArgument.value)
    const lines: string[] = []

    lines.push(`ccjs_value ${value} = ccjs_undefined_value();`)
    lines.push(`status = ccjs_string_from_literal(&ccjs_default_allocator, ${bytes}, ${length}, &${value});`)
    appendAsyncTaskLines(lines, emitAsyncTaskScheduleStatusCheck(wrapper, options, [`ccjs_release(${value});`]))
    lines.push(`status = ccjs_promise_rejected(ccjs_loop, ${value}, &frame->awaited);`)
    lines.push(`ccjs_release(${value});`)
    lines.push(`${value} = ccjs_undefined_value();`)
    appendAsyncTaskLines(lines, emitAsyncTaskScheduleStatusCheck(wrapper, options, null))

    return {
      lines: lines
    }
  }

  if (
    rejectArgument != null &&
    rejectArgument.type !== 'NumberLiteral' &&
    rejectArgument.type !== 'BooleanLiteral'
  ) {
    context.diagnostics.push(
      diagnostic(
        'CCJS_C_ASYNC',
        'async task Promise.reject currently supports string, number and boolean rejection values in C',
        expression.loc
      )
    )

    return {
      lines: emitAsyncTaskErrorStatusLines(wrapper, options)
    }
  }

  let valueLines: string[] = []
  let valueExpression = 'ccjs_undefined_value()'

  if (rejectArgument != null) {
    const value = asyncTaskDeps(context).emitCValueExpression(rejectArgument, context)

    valueLines = value.lines
    valueExpression = value.expression
  }

  const lines: string[] = []

  appendAsyncTaskLines(lines, valueLines)
  lines.push(`status = ccjs_promise_rejected(ccjs_loop, ${valueExpression}, &frame->awaited);`)
  appendAsyncTaskLines(lines, emitAsyncTaskScheduleStatusCheck(wrapper, options, null))

  return {
    lines: lines
  }
}

function emitPreparedAsyncTaskSourceCallExpression(
  expression,
  wrapper: CAsyncTaskWrapper,
  context: AsyncTaskFunctionContext,
  options: AsyncTaskScheduleOptions
): PreparedAsyncTaskPromise | null {
  const sourceName = asyncTaskReferenceNameOrNull(expression.callee)

  if (sourceName == null) {
    return null
  }

  const target = context.asyncTaskWrappers.get(sourceName)

  if (target != null) {
    const prepared = asyncTaskDeps(context).emitPreparedCallArgs(expression, target.params, context)
    const args = ['ccjs_loop']
    const lines: string[] = []

    for (const arg of prepared.args) {
      args.push(arg)
    }

    args.push('&frame->awaited')
    appendAsyncTaskLines(lines, prepared.lines)
    lines.push(`status = ${target.startName}(${joinStrings(args, ', ')});`)
    appendAsyncTaskLines(lines, emitAsyncTaskScheduleStatusCheck(wrapper, options, null))

    return {
      lines: lines
    }
  }

  return null
}

function emitPreparedAsyncFunctionSourceCallExpression(
  expression,
  wrapper: CAsyncTaskWrapper,
  context: AsyncTaskFunctionContext,
  options: AsyncTaskScheduleOptions
): PreparedAsyncTaskPromise | null {
  const callee = expression.callee

  if (!isAsyncFunctionCallee(callee, context)) {
    return null
  }

  if (asyncTaskDeps(context).isThrowingFunctionCallee(callee, context)) {
    return null
  }

  const valueType = resolvedAsyncFunctionAwaitValueType(expression, context)

  if (!isSupportedAsyncTaskValueType(valueType)) {
    return null
  }

  const call = asyncTaskDeps(context).emitPreparedCallExpression(expression, context)

  if (valueType === 'void') {
    const lines: string[] = []

    appendAsyncTaskLines(lines, call.lines)
    lines.push(`${call.expression};`)
    lines.push('status = ccjs_promise_resolved(ccjs_loop, ccjs_undefined_value(), &frame->awaited);')
    appendAsyncTaskLines(lines, emitAsyncTaskScheduleStatusCheck(wrapper, options, null))

    return {
      lines: lines
    }
  }

  if (isManagedRuntimeReturnType(valueType)) {
    const value = nextCName(context, 'ccjs_async_value')
    const tag = cRuntimeValueTag(valueType)

    const lines: string[] = []

    appendAsyncTaskLines(lines, call.lines)
    lines.push(`ccjs_value ${value} = ${call.expression};`)
    lines.push(emitRuntimeValueCheck(value, tag, context))
    lines.push(`status = ccjs_promise_resolved(ccjs_loop, ${value}, &frame->awaited);`)
    appendAsyncTaskLines(lines, emitAsyncTaskScheduleStatusCheck(wrapper, options, [`ccjs_release(${value});`]))
    lines.push(`ccjs_release(${value});`)

    return {
      lines: lines
    }
  }

  let value = `ccjs_number_value(${call.expression})`

  if (valueType === 'boolean') {
    value = `ccjs_bool_value((${call.expression}) != 0)`
  }

  const lines: string[] = []

  appendAsyncTaskLines(lines, call.lines)
  lines.push(`status = ccjs_promise_resolved(ccjs_loop, ${value}, &frame->awaited);`)
  appendAsyncTaskLines(lines, emitAsyncTaskScheduleStatusCheck(wrapper, options, null))

  return {
    lines: lines
  }
}

function emitPreparedPlainPromiseSourceCallExpression(
  expression,
  wrapper: CAsyncTaskWrapper,
  context: AsyncTaskFunctionContext,
  options: AsyncTaskScheduleOptions
): PreparedAsyncTaskPromise | null {
  if (!isPromiseReturningFunctionCallee(expression.callee, context)) {
    return null
  }

  const params = asyncTaskDeps(context).resolveFunctionParams(expression.callee, context)

  if (params == null) {
    return null
  }

  const resolvedParams = asyncTaskFunctionParamsOrEmpty(params)
  const prepared = asyncTaskDeps(context).emitPreparedCallArgs(expression, resolvedParams, context)
  const args = ['ccjs_loop']
  const lines: string[] = []

  for (const arg of prepared.args) {
    args.push(arg)
  }

  appendAsyncTaskLines(lines, prepared.lines)
  lines.push(`frame->awaited = ${asyncTaskDeps(context).emitCallee(expression.callee, context)}(${joinStrings(args, ', ')});`)
  lines.push('status = frame->awaited == 0 ? CCJS_ERR_TYPE : CCJS_OK;')
  appendAsyncTaskLines(lines, emitAsyncTaskScheduleStatusCheck(wrapper, options, null))

  return {
    lines: lines
  }
}

function asyncTaskFunctionParamsOrEmpty(params: CFunctionParam[] | null): CFunctionParam[] {
  if (params != null) {
    return params
  }

  return []
}

function emitPreparedAsyncTaskAwaitedPromiseChainExpression(
  wrapper: CAsyncTaskWrapper,
  item: CAsyncTaskAwaitStep,
  context: AsyncTaskFunctionContext,
  options: AsyncTaskScheduleOptions
): PreparedAsyncTaskPromise | null {
  const expression = item.awaitedPromiseExpression

  if (
    expression == null ||
    expression.type !== 'CallExpression' ||
    expression.callee == null ||
    expression.callee.type !== 'MemberExpression' ||
    expression.callee.property !== 'then'
  ) {
    return null
  }

  const receiver = asyncTaskNodeOrEmpty(asyncTaskMemberObjectOrNull(expression))
  const callback = asyncTaskNodeOrEmpty(asyncTaskFirstArgumentOrNull(expression))
  let chainWrapper: CPromiseChainWrapper | null | undefined = null

  chainWrapper = context.promiseChainArrowWrappers.get(callback)

  if (receiver.type === 'CallExpression' && cPromiseRuntimeCallName(receiver.callee) === 'resolve') {
    if (chainWrapper != null) {
      return emitPreparedAsyncTaskAwaitedPromiseChainForWrapper(
        wrapper,
        item,
        receiver,
        callback,
        chainWrapper,
        context,
        options
      )
    }
  }

  context.diagnostics.push(
      diagnostic(
        'CCJS_C_ASYNC',
        'async task state-machine slice currently supports local Promise.resolve then-chain variables only',
        asyncTaskLocationOrNull(expression)
      )
  )

  return {
    lines: emitAsyncTaskErrorStatusLines(wrapper, options)
  }
}

function emitPreparedAsyncTaskAwaitedPromiseChainForWrapper(
  wrapper: CAsyncTaskWrapper,
  item: CAsyncTaskAwaitStep,
  receiver: AsyncTaskAstNode,
  callback: AsyncTaskAstNode | null | undefined,
  chainWrapper: CPromiseChainWrapper,
  context: AsyncTaskFunctionContext,
  options: AsyncTaskScheduleOptions
): PreparedAsyncTaskPromise {
  const source = nextCName(context, 'ccjs_async_task_source')
  let sourceType = receiver.promiseValueType

  if (sourceType == null && callback != null && callback.params[0] != null) {
    sourceType = callback.params[0].valueType
  }

  if (sourceType == null) {
    sourceType = item.type
  }

  const value = emitPreparedAsyncTaskValueExpression(receiver.args[0], sourceType, context)
  const callbackContext = emitAsyncTaskPromiseChainCallbackContext(wrapper, chainWrapper, context, options)
  const cleanupLines: string[] = []

  if (callbackContext.expression !== '0') {
    cleanupLines.push(`${chainWrapper.finalizerName}(${callbackContext.expression});`)
  }

  const lines: string[] = []

  appendAsyncTaskLines(lines, callbackContext.lines)
  lines.push(`ccjs_promise* ${source} = 0;`)
  appendAsyncTaskLines(lines, value.lines)
  lines.push(`status = ccjs_promise_resolved(ccjs_loop, ${value.expression}, &${source});`)
  appendAsyncTaskLines(lines, emitAsyncTaskScheduleStatusCheck(wrapper, options, cleanupLines))
  lines.push(`status = ccjs_promise_chain(${source}, ${chainWrapper.name}, 0, ${callbackContext.expression}, ${callbackContext.finalizer}, &frame->awaited);`)
  lines.push(`ccjs_promise_release(${source});`)
  lines.push(`${source} = 0;`)
  appendAsyncTaskLines(lines, emitAsyncTaskScheduleStatusCheck(wrapper, options, cleanupLines))

  return {
    lines: lines
  }
}

function emitAsyncTaskPromiseChainCallbackContext(
  asyncWrapper: CAsyncTaskWrapper,
  chainWrapper: CPromiseChainWrapper | null | undefined,
  context: AsyncTaskFunctionContext,
  options: AsyncTaskScheduleOptions
): AsyncTaskPromiseChainCallbackContext {
  if (chainWrapper != null) {
    if (isPromiseChainCallbackWrapperWithContext(chainWrapper)) {
      return emitAsyncTaskPromiseChainCallbackContextForWrapper(asyncWrapper, chainWrapper, context, options)
    }
  }

  return {
    lines: [],
    expression: '0',
    finalizer: '0'
  }
}

function emitAsyncTaskPromiseChainCallbackContextForWrapper(
  asyncWrapper: CAsyncTaskWrapper,
  chainWrapper: CPromiseChainWrapper,
  context: AsyncTaskFunctionContext,
  options: AsyncTaskScheduleOptions
): AsyncTaskPromiseChainCallbackContext {
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

    if (!isSupportedAsyncTaskPromiseCaptureType(capture.valueType)) {
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
  appendIndentedAsyncTaskLines(lines, emitAsyncTaskScheduleStatusCheck(asyncWrapper, options, null), '  ')
  lines.push('}')

  if (chainWrapper.needsEventLoop === true) {
    lines.push(`${contextName}->ccjs_loop = ccjs_loop;`)
  }

  for (const capture of chainWrapper.captures) {
    appendAsyncTaskLines(lines, asyncTaskDeps(context).emitRuntimeArrowCaptureStoreLines(capture, contextName, context))
  }

  return {
    lines: lines,
    expression: contextName,
    finalizer: chainWrapper.finalizerName
  }
}

function isSupportedAsyncTaskPromiseCaptureType(valueType: string): boolean {
  return valueType === 'number' || valueType === 'boolean' || valueType === 'string' || valueType === 'object'
}

function emitPreparedAsyncTaskAwaitedValueExpression(
  item: CAsyncTaskAwaitStep,
  context: AsyncTaskFunctionContext
): PreparedExpression {
  const awaitedExpression = item.awaitedExpression

  if (awaitedExpression == null) {
    context.diagnostics.push(
      diagnostic(
        'CCJS_C_ASYNC',
        'async task state-machine slice currently supports await Promise.resolve calls only',
        null
      )
    )

    return {
      lines: ['status = CCJS_ERR_TYPE;'],
      expression: 'ccjs_undefined_value()'
    }
  }

  if (awaitedExpression.type !== 'CallExpression' || cPromiseRuntimeCallName(awaitedExpression.callee) !== 'resolve') {
    let loc: SourceLocation | null = null

    loc = awaitedExpression.loc

    context.diagnostics.push(
      diagnostic(
        'CCJS_C_ASYNC',
        'async task state-machine slice currently supports await Promise.resolve calls only',
        loc
      )
    )

    return {
      lines: ['status = CCJS_ERR_TYPE;'],
      expression: 'ccjs_undefined_value()'
    }
  }

  let awaitedValueExpression: AnyNode | null = null

  if (awaitedExpression.args.length > 0) {
    awaitedValueExpression = awaitedExpression.args[0]
  }

  return emitPreparedAsyncTaskValueExpression(awaitedValueExpression, item.type, context)
}

function emitPreparedAsyncTaskValueExpression(
  expression,
  valueType: string,
  context: AsyncTaskFunctionContext
): PreparedExpression {
  if (valueType === 'void') {
    return {
      lines: [],
      expression: 'ccjs_undefined_value()'
    }
  }

  if (isManagedRuntimeReturnType(valueType)) {
    const value = asyncTaskDeps(context).emitCValueExpression(expression, context)
    const expectedTag = cRuntimeValueTag(valueType)
    const lines: string[] = []

    appendAsyncTaskLines(lines, value.lines)
    lines.push(emitRuntimeValueCheck(value.expression, expectedTag, context))

    return {
      lines: lines,
      expression: value.expression
    }
  }

  if (valueType === 'boolean') {
    const value = asyncTaskDeps(context).emitPreparedNumberExpression(expression, context)

    return {
      lines: value.lines,
      expression: `ccjs_bool_value((${value.expression}) != 0)`
    }
  }

  const value = asyncTaskDeps(context).emitPreparedNumberExpression(expression, context)

  return {
    lines: value.lines,
    expression: `ccjs_number_value(${value.expression})`
  }
}

function emitAsyncTaskResumeDeclaration(wrapper: CAsyncTaskWrapper, baseContext: AsyncTaskEmitContext): string[] {
  const context = createAsyncTaskEmitContext(baseContext, wrapper, wrapper.returnType, wrapper.awaits.length)
  let returnValue: PreparedExpression | null = null

  if (!hasAsyncTaskStatementLocalDeclarations(collectAsyncTaskSuccessPhaseStatements(wrapper, ['body']))) {
    returnValue = emitPreparedAsyncTaskValueExpression(wrapper.returnExpression, wrapper.returnType, context)
  }

  const returnValueOwnedValues: string[] = []

  if (returnValue != null) {
    for (const name of context.ownedValues) {
      returnValueOwnedValues.push(name)
    }
  }

  const cases: string[] = []

  for (const item of wrapper.awaits) {
    appendAsyncTaskLines(cases, emitAsyncTaskResumeCase(wrapper, item, baseContext, returnValue, returnValueOwnedValues))
  }

  const lines: string[] = []

  lines.push(`static ccjs_status ${wrapper.resumeName}(void* context, ccjs_value ccjs_value_input) {`)
  lines.push(`  ${wrapper.frameTypeName}* frame = (${wrapper.frameTypeName}*)context;`)
  lines.push('  if (frame == 0 || frame->promise == 0) return CCJS_ERR_TYPE;')
  lines.push('  ccjs_status status = CCJS_OK;')
  lines.push('  switch (frame->state) {')
  appendIndentedAsyncTaskLines(lines, cases, '  ')
  lines.push('  default:')
  lines.push('    return ccjs_promise_reject(frame->promise, ccjs_number_value((ccjs_number)CCJS_ERR_TYPE));')
  lines.push('  }')
  lines.push('}')

  return lines
}

function emitAsyncTaskResumeCase(
  wrapper: CAsyncTaskWrapper,
  item: CAsyncTaskAwaitStep,
  baseContext: AsyncTaskEmitContext,
  returnValue: PreparedExpression | null,
  returnValueOwnedValues: string[]
): string[] {
  let nextItem: CAsyncTaskAwaitStep | null = null

  if (item.index + 1 < wrapper.awaits.length) {
    nextItem = wrapper.awaits[item.index + 1]
  }

  const valueCheck = emitAsyncTaskFulfilledValueCheck(wrapper, item)
  const lines: string[] = []

  lines.push(`case ${item.index}: {`)
  appendIndentedAsyncTaskLines(lines, valueCheck, '  ')
  appendIndentedAsyncTaskLines(lines, emitAsyncTaskStoreFulfilledValueLines(item), '  ')
  lines.push('  if (frame->awaited != 0) {')
  lines.push('    ccjs_promise_release(frame->awaited);')
  lines.push('    frame->awaited = 0;')
  lines.push('  }')

  if (nextItem == null) {
    appendIndentedAsyncTaskLines(lines, emitAsyncTaskVisibleLocalReads(wrapper, item.index + 1, null), '  ')
    if (returnValue == null) {
      appendIndentedAsyncTaskLines(lines, emitAsyncTaskTrySuccessPreludeAndReturnLines(wrapper, item, baseContext), '  ')
    } else if (returnValueOwnedValues.length > 0) {
      for (const name of returnValueOwnedValues) {
        lines.push(`  ccjs_value ${name} = ccjs_undefined_value();`)
      }

      appendIndentedAsyncTaskLines(lines, emitAsyncTaskTrySuccessPreludeLines(wrapper, baseContext, item.index + 1), '  ')
      appendIndentedAsyncTaskLines(lines, returnValue.lines, '  ')
      appendIndentedAsyncTaskLines(lines, emitAsyncTaskTrySuccessFinallyLines(wrapper, baseContext, item.index + 1), '  ')
      lines.push(`  status = ccjs_promise_resolve(frame->promise, ${returnValue.expression});`)

      for (let index = returnValueOwnedValues.length - 1; index >= 0; index = index - 1) {
        lines.push(`  ccjs_release(${returnValueOwnedValues[index]});`)
      }

      lines.push('  return status;')
    } else {
      appendIndentedAsyncTaskLines(lines, emitAsyncTaskTrySuccessPreludeLines(wrapper, baseContext, item.index + 1), '  ')
      appendIndentedAsyncTaskLines(lines, returnValue.lines, '  ')
      appendIndentedAsyncTaskLines(lines, emitAsyncTaskTrySuccessFinallyLines(wrapper, baseContext, item.index + 1), '  ')
      lines.push(`  return ccjs_promise_resolve(frame->promise, ${returnValue.expression});`)
    }
    lines.push('}')
    return lines
  }

  const followingItem = wrapper.awaits[item.index + 1]
  const context = createAsyncTaskEmitContext(baseContext, wrapper, 'void', item.index + 1)
  const schedule = emitAsyncTaskScheduleAwaitLines(wrapper, followingItem, context, {
    cleanup: 'resume',
    final: followingItem.index === wrapper.awaits.length - 1
  })

  appendIndentedAsyncTaskLines(lines, emitAsyncTaskVisibleLocalReads(wrapper, item.index + 1, null), '  ')
  lines.push('  ccjs_loop* ccjs_loop = frame->ccjs_loop;')
  lines.push('  if (ccjs_loop == 0) {')
  appendIndentedAsyncTaskLines(
    lines,
    emitAsyncTaskRejectAndMaybeFinalizeLines(wrapper, item, 'ccjs_number_value((ccjs_number)CCJS_ERR_TYPE)'),
    '    '
  )
  lines.push('  }')
  lines.push(`  frame->state = ${followingItem.index};`)
  appendIndentedAsyncTaskLines(lines, schedule, '  ')
  lines.push('  return CCJS_OK;')
  lines.push('}')

  return lines
}

function hasAsyncTaskStatementLocalDeclarations(statements: AsyncTaskAstNode[]): boolean {
  for (const statement of statements) {
    if (statement.type === 'VariableDeclaration' && isManagedRuntimeReturnType(statement.valueType)) {
      return true
    }
  }

  return false
}

function collectAsyncTaskSuccessPhaseStatements(
  wrapper: CAsyncTaskWrapper,
  kinds: CAsyncTaskSuccessPhaseKind[] | null
): AsyncTaskAstNode[] {
  let allowedKinds: Set<CAsyncTaskSuccessPhaseKind> | null = null

  if (kinds != null) {
    allowedKinds = asyncTaskSuccessPhaseKindSetFromArray(kinds)
  }

  const statements: AsyncTaskAstNode[] = []

  for (const phase of wrapper.successPhases) {
    if (allowedKinds != null && !allowedKinds.has(phase.kind as CAsyncTaskSuccessPhaseKind)) {
      continue
    }

    appendAsyncTaskNodes(statements, phase.statements)
  }

  return statements
}

function collectAsyncTaskTryPhaseStatements(wrapper: CAsyncTaskWrapper, kind: CAsyncTaskTryPhaseKind): AsyncTaskAstNode[] {
  const statements: AsyncTaskAstNode[] = []

  for (const phase of wrapper.tryPhases) {
    if (phase.kind === kind) {
      appendAsyncTaskNodes(statements, phase.statements)
    }
  }

  return statements
}

function emitAsyncTaskFulfilledValueCheck(wrapper: CAsyncTaskWrapper, item: CAsyncTaskAwaitStep): string[] {
  const expectedTag = cRuntimeValueTag(item.type)

  if (expectedTag == null) {
    return []
  }

  let refCheck = ''

  if (isManagedRuntimeReturnType(item.type)) {
    refCheck = ' || ccjs_value_input.as.ref == 0'
  }

  const lines: string[] = []

  lines.push(`if (ccjs_value_input.tag != ${expectedTag}${refCheck}) {`)
  appendIndentedAsyncTaskLines(
    lines,
    emitAsyncTaskRejectAndMaybeFinalizeLines(wrapper, item, 'ccjs_number_value((ccjs_number)CCJS_ERR_TYPE)'),
    '  '
  )
  lines.push('}')

  return lines
}

function emitAsyncTaskStoreFulfilledValueLines(item: CAsyncTaskAwaitStep): string[] {
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

function emitAsyncTaskRejectAndMaybeFinalizeLines(
  wrapper: CAsyncTaskWrapper,
  item: CAsyncTaskAwaitStep,
  errorExpression: string
): string[] {
  const lines: string[] = []

  lines.push(`ccjs_status reject_status = ccjs_promise_reject(frame->promise, ${errorExpression});`)

  if (item.index < wrapper.awaits.length - 1) {
    lines.push(`${wrapper.finalizerName}(frame);`)
  }

  lines.push('return reject_status;')

  return lines
}

function emitAsyncTaskTrySuccessFinallyLines(
  wrapper: CAsyncTaskWrapper,
  baseContext: AsyncTaskEmitContext,
  visibleAwaitCount: number
): string[] {
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

function emitAsyncTaskTrySuccessPreludeLines(
  wrapper: CAsyncTaskWrapper,
  baseContext: AsyncTaskEmitContext,
  visibleAwaitCount: number
): string[] {
  return emitAsyncTaskTryStatementList(
    collectAsyncTaskSuccessPhaseStatements(wrapper, null),
    wrapper,
    baseContext,
    visibleAwaitCount
  )
}

function emitAsyncTaskTrySuccessPreludeAndReturnLines(
  wrapper: CAsyncTaskWrapper,
  item: CAsyncTaskAwaitStep,
  baseContext: AsyncTaskEmitContext
): string[] {
  const visibleAwaitCount = item.index + 1
  const context = createAsyncTaskEmitContext(baseContext, wrapper, wrapper.returnType, visibleAwaitCount)
  const resultScope = asyncTaskDeps(context).pushVariableScope(context)
  let preludeLines: string[] = []
  let returnValue: PreparedExpression = { lines: [], expression: '0' }

  preludeLines = asyncTaskDeps(context).emitStatementList(collectAsyncTaskSuccessPhaseStatements(wrapper, null), context)
  returnValue = emitPreparedAsyncTaskValueExpression(wrapper.returnExpression, wrapper.returnType, context)
  asyncTaskDeps(context).restoreVariableScope(context, resultScope)

  const lines: string[] = []

  appendAsyncTaskLines(lines, asyncTaskDeps(context).emitOwnedValueDeclarations(context))
  appendAsyncTaskLines(lines, preludeLines)
  appendAsyncTaskLines(lines, returnValue.lines)
  appendAsyncTaskLines(lines, emitAsyncTaskTrySuccessFinallyLines(wrapper, baseContext, visibleAwaitCount))
  lines.push(`status = ccjs_promise_resolve(frame->promise, ${returnValue.expression});`)
  appendAsyncTaskLines(lines, asyncTaskDeps(context).emitOwnedValueCleanup(context))
  lines.push('return status;')

  return lines
}

function emitAsyncTaskTryRejectFinallyLines(
  wrapper: CAsyncTaskWrapper,
  baseContext: AsyncTaskEmitContext,
  visibleAwaitCount: number
): string[] {
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

function emitAsyncTaskTryHandlerPreludeLines(
  wrapper: CAsyncTaskWrapper,
  baseContext: AsyncTaskEmitContext,
  visibleAwaitCount: number
): string[] {
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

function emitAsyncTaskTryFinallyLines(
  wrapper: CAsyncTaskWrapper,
  baseContext: AsyncTaskEmitContext,
  visibleAwaitCount: number
): string[] {
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

function emitAsyncTaskTryStatementList(
  statements: AsyncTaskAstNode[],
  wrapper: CAsyncTaskWrapper,
  baseContext: AsyncTaskEmitContext,
  visibleAwaitCount: number
): string[] {
  if (statements.length === 0) {
    return []
  }

  const context = createAsyncTaskEmitContext(baseContext, wrapper, 'void', visibleAwaitCount)
  const scope = asyncTaskDeps(context).pushVariableScope(context)
  let lines: string[] = []

  lines = asyncTaskDeps(context).emitStatementList(statements, context)
  asyncTaskDeps(context).restoreVariableScope(context, scope)

  const result: string[] = []

  appendAsyncTaskLines(result, asyncTaskDeps(context).emitOwnedValueDeclarations(context))
  appendAsyncTaskLines(result, lines)
  appendAsyncTaskLines(result, asyncTaskDeps(context).emitOwnedValueCleanup(context))

  return result
}

function emitAsyncTaskSettleAndMaybeFinalizeLines(
  wrapper: CAsyncTaskWrapper,
  item: CAsyncTaskAwaitStep,
  call: string
): string[] {
  const lines: string[] = []

  lines.push(`status = ${call};`)

  if (item.index < wrapper.awaits.length - 1) {
    lines.push(`${wrapper.finalizerName}(frame);`)
  }

  lines.push('return status;')

  return lines
}

function emitAsyncTaskRejectDeclaration(wrapper: CAsyncTaskWrapper, baseContext: AsyncTaskEmitContext): string[] {
  if (wrapper.hasTryRegion) {
    return emitAsyncTaskTryRejectDeclaration(wrapper, baseContext)
  }

  const lastState = wrapper.awaits.length - 1

  const lines: string[] = []

  lines.push(`static ccjs_status ${wrapper.rejectName}(void* context, ccjs_value ccjs_error) {`)
  lines.push(`  ${wrapper.frameTypeName}* frame = (${wrapper.frameTypeName}*)context;`)
  lines.push('  if (frame == 0 || frame->promise == 0) return CCJS_ERR_TYPE;')
  lines.push('  ccjs_status status = ccjs_promise_reject(frame->promise, ccjs_error);')

  if (lastState > 0) {
    lines.push(`  if (frame->state < ${lastState}) {`)
    lines.push(`    ${wrapper.finalizerName}(frame);`)
    lines.push('  }')
  }

  lines.push('  return status;')
  lines.push('}')

  return lines
}

function emitAsyncTaskTryRejectDeclaration(wrapper: CAsyncTaskWrapper, baseContext: AsyncTaskEmitContext): string[] {
  const cases: string[] = []

  for (const item of wrapper.awaits) {
    appendAsyncTaskLines(cases, emitAsyncTaskTryRejectCase(wrapper, item, baseContext))
  }

  const lines: string[] = []

  lines.push(`static ccjs_status ${wrapper.rejectName}(void* context, ccjs_value ccjs_error) {`)
  lines.push(`  ${wrapper.frameTypeName}* frame = (${wrapper.frameTypeName}*)context;`)
  lines.push('  if (frame == 0 || frame->promise == 0) return CCJS_ERR_TYPE;')
  lines.push('  ccjs_status status = CCJS_OK;')
  lines.push('  switch (frame->state) {')
  appendIndentedAsyncTaskLines(lines, cases, '  ')
  lines.push('  default:')
  lines.push('    status = ccjs_promise_reject(frame->promise, ccjs_error);')
  lines.push('    return status;')
  lines.push('  }')
  lines.push('}')

  return lines
}

function emitAsyncTaskTryRejectCase(
  wrapper: CAsyncTaskWrapper,
  item: CAsyncTaskAwaitStep,
  baseContext: AsyncTaskEmitContext
): string[] {
  let handler = wrapper.tryHandler

  if (handler != null) {
    return emitAsyncTaskTryRejectHandlerCase(wrapper, item, baseContext, handler)
  }

  const lines = [`case ${item.index}: {`]

  appendIndentedAsyncTaskLines(lines, emitAsyncTaskVisibleLocalReads(wrapper, item.index, null), '  ')
  appendIndentedAsyncTaskLines(lines, emitAsyncTaskTryRejectFinallyLines(wrapper, baseContext, item.index), '  ')
  appendIndentedAsyncTaskLines(
    lines,
    emitAsyncTaskSettleAndMaybeFinalizeLines(wrapper, item, 'ccjs_promise_reject(frame->promise, ccjs_error)'),
    '  '
  )
  lines.push('}')

  return lines
}

function emitAsyncTaskTryRejectHandlerCase(
  wrapper: CAsyncTaskWrapper,
  item: CAsyncTaskAwaitStep,
  baseContext: AsyncTaskEmitContext,
  handler: CAsyncTaskTryHandlerPlan
): string[] {
  const lines = [`case ${item.index}: {`]
  const handlerParam = handler.param

  if (handlerParam != null) {
    lines.push('  if (ccjs_error.tag != CCJS_TAG_STRING || ccjs_error.as.ref == 0) {')
    appendIndentedAsyncTaskLines(
      lines,
      emitAsyncTaskSettleAndMaybeFinalizeLines(
        wrapper,
        item,
        'ccjs_promise_reject(frame->promise, ccjs_number_value((ccjs_number)CCJS_ERR_TYPE))'
      ),
      '    '
    )
    lines.push('  }')
  }

  appendIndentedAsyncTaskLines(lines, emitAsyncTaskVisibleLocalReads(wrapper, item.index, null), '  ')
  appendIndentedAsyncTaskLines(lines, emitAsyncTaskTryHandlerPreludeLines(wrapper, baseContext, item.index), '  ')

  if (handlerParam != null) {
    lines.push(`  ccjs_string* ${handlerParam} = (ccjs_string*)ccjs_error.as.ref;`)
  }

  appendIndentedAsyncTaskLines(lines, emitAsyncTaskTryHandlerBodyAndReturnLines(wrapper, item, baseContext, handler), '  ')
  lines.push('}')

  return lines
}

function emitAsyncTaskTryHandlerBodyAndReturnLines(
  wrapper: CAsyncTaskWrapper,
  item: CAsyncTaskAwaitStep,
  baseContext: AsyncTaskEmitContext,
  handler: CAsyncTaskTryHandlerPlan
): string[] {
  const visibleAwaitCount = item.index
  const context = createAsyncTaskEmitContext(baseContext, wrapper, wrapper.returnType, visibleAwaitCount)
  const handlerParam = handler.param

  if (handlerParam != null) {
    context.variables.set(handlerParam, 'string')
    context.runtimeStrings.add(handlerParam)
  }

  const resultScope = asyncTaskDeps(context).pushVariableScope(context)
  let handlerLines: string[] = []
  let returnValue: PreparedExpression = { lines: [], expression: '0' }

  handlerLines = asyncTaskDeps(context).emitStatementList(handler.statements, context)
  returnValue = emitPreparedAsyncTaskValueExpression(handler.returnExpression, wrapper.returnType, context)
  asyncTaskDeps(context).restoreVariableScope(context, resultScope)

  const lines: string[] = []

  appendAsyncTaskLines(lines, asyncTaskDeps(context).emitOwnedValueDeclarations(context))
  appendAsyncTaskLines(lines, handlerLines)
  appendAsyncTaskLines(lines, returnValue.lines)
  appendAsyncTaskLines(lines, emitAsyncTaskTryFinallyLines(wrapper, baseContext, visibleAwaitCount))
  lines.push(`status = ccjs_promise_resolve(frame->promise, ${returnValue.expression});`)
  appendAsyncTaskLines(lines, asyncTaskDeps(context).emitOwnedValueCleanup(context))

  if (item.index < wrapper.awaits.length - 1) {
    lines.push(`${wrapper.finalizerName}(frame);`)
  }

  lines.push('return status;')

  return lines
}

function emitAsyncTaskFinalizerDeclaration(wrapper: CAsyncTaskWrapper): string[] {
  const lines: string[] = []

  lines.push(`static void ${wrapper.finalizerName}(void* context) {`)
  lines.push(`  ${wrapper.frameTypeName}* frame = (${wrapper.frameTypeName}*)context;`)
  lines.push('  if (frame == 0) return;')
  lines.push('  if (frame->awaited != 0) ccjs_promise_release(frame->awaited);')

  for (const param of wrapper.params) {
    if (isManagedRuntimeReturnType(param.valueType)) {
      lines.push(`  ccjs_release(frame->${param.fieldName});`)
    }
  }

  for (const local of wrapper.frameLocals) {
    if (isManagedRuntimeReturnType(local.type)) {
      lines.push(`  ccjs_release(frame->${local.fieldName});`)
    }
  }

  lines.push('  if (frame->promise != 0) ccjs_promise_release(frame->promise);')
  lines.push('  if (frame->ccjs_loop != 0 && frame->ccjs_loop->allocator != 0) {')
  lines.push('    frame->ccjs_loop->allocator->free(frame->ccjs_loop->allocator->user, frame, sizeof(*frame), _Alignof(*frame));')
  lines.push('  }')
  lines.push('}')

  return lines
}


export function emitAsyncTaskFunctionStubDeclaration(
  statement: AsyncTaskAstNode,
  context: AsyncTaskFunctionContext,
  dependencies: AsyncTaskLoweringDependencies
): string[] {
  context.asyncTaskLoweringDependencies = dependencies
  let returnLine = '  return 0;'

  if (context.returnType === 'void') {
    returnLine = '  return;'
  } else if (isManagedRuntimeReturnType(context.returnType)) {
    returnLine = '  return ccjs_undefined_value();'
  }

  return [`${asyncTaskDeps(context).emitFunctionHead(statement, context)} {`, returnLine, '}']
}
