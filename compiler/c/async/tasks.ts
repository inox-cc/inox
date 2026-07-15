import { diagnostic } from '../../diagnostics.ts'
import type { AnyNode, Diagnostic, IrFunctionDeclaration, SourceLocation } from '../../types.ts'
import { emitPrepareOwnedValueWrite, emitRuntimeTypeCheck, nextCName } from '../context.ts'
import { cStringLiteral, emitCIdentifier, utf8ByteLength } from '../identifiers.ts'
import { emitRuntimeValueCheck } from '../runtime-values.ts'
import type {
  CArrayElementInfo,
  CAsyncTaskAwaitFrameLocal,
  CAsyncTaskAwaitStep,
  CAsyncTaskFrameLocal,
  CAsyncTaskFrameLocalKind,
  CAsyncTaskParam,
  CAsyncTaskPhase,
  CAsyncTaskPrefixFrameLocal,
  CAsyncTaskPrefixLocal,
  CAsyncTaskSuccessPhaseKind,
  CAsyncTaskTryHandlerPlan,
  CAsyncTaskTryPhaseKind,
  CAsyncTaskWrapper,
  CCallbackWrapper,
  CClassInfo,
  CFunctionParam,
  CFunctionReturnMapType,
  CFunctionType,
  CKnownArrayElement,
  CKnownObjectField,
  CKnownObjectIndexField,
  CObjectShape,
  CObjectShapeField,
  CPreparedCallArgs,
  CPreparedCallOptions,
  CPreparedStringBytesOperand,
  CPromiseChainWrapper,
  CPromiseConstructorHandler,
  CRuntimeArrayElement,
  CRuntimeArrowCapture,
  CPreparedExpression as PreparedExpression
} from '../types.ts'
import { cRuntimeValueTag, emitCType, isManagedRuntimeReturnType } from '../value-types.ts'
import { isPromiseChainCallbackWrapperWithContext } from './callbacks.ts'
import {
  cPromiseRuntimeCallName,
  isAsyncFunctionCallee,
  isPromiseReturningFunctionCallee,
  resolveCAsyncFunctionAwaitValueType
} from './promises.ts'

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
type AsyncTaskNumberMap = Map<string, number>
type AsyncTaskStringNullableMap = Map<string, string | null>
type AsyncTaskStringSet = Set<string>
type AsyncTaskMetadataItem = CAsyncTaskFrameLocal | CAsyncTaskAwaitStep | CAsyncTaskParam | CAsyncTaskPrefixLocal

type AsyncTaskEmitContext = {
  asyncTaskLoweringDependencies: AsyncTaskLoweringDependencies
  asyncTaskWrappers: AsyncTaskAsyncWrapperMap
  boxedMutableCaptureDeclarations: AsyncTaskAnyNodeSet
  callbackArrowWrappers: AsyncTaskCallbackArrowWrapperMap
  callbackWrappers: AsyncTaskCallbackWrapperMap
  classInfos: Map<string, CClassInfo>
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
  throwingFunctions: AsyncTaskStringSet
}

function asyncTaskStatementValueType(statement: AsyncTaskAstNode, context: AsyncTaskFunctionContext): string {
  const valueType = statement.valueType

  if (valueType !== null && typeof valueType !== 'undefined') {
    return valueType
  }

  return asyncTaskDeps(context).inferExpressionType(statement.init, context)
}

type AsyncTaskFunctionContext = AsyncTaskEmitContext & {
  arrayLengths: AsyncTaskNumberMap
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
  errorChannelUsed: boolean
  exceptionValueNames: AsyncTaskStringSet
  errorTargets: string[]
  eventLoopUsed: boolean
  explicitEventLoop: boolean
  externalEventLoop: boolean
  failureStatement?: string | null
  failureStatementUsed?: boolean
  functionErrorOut: string | null
  functionReturnOut: string | null
  functionTypes: AsyncTaskFunctionTypeMap
  mapTypes: AsyncTaskMapTypeMap
  narrowedNullableScalars: AsyncTaskStringSet
  nullableVariables: AsyncTaskStringSet
  objectAliases: AsyncTaskStringMap
  objectDeclaredTypes: AsyncTaskStringMap
  objectShapes: AsyncTaskObjectShapeFieldMap
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
  runtimeStringValues: AsyncTaskStringMap
  runtimeStrings: AsyncTaskStringSet
  setElementTypes: AsyncTaskStringMap
  statusReturn: boolean
  throwingFunction: boolean
  usedCleanupGoto: boolean
  usedRuntimeCallbackCleanupGoto?: boolean
  variables: AsyncTaskStringMap
}

type AsyncTaskLocalMetadataContext = {
  mapTypes: AsyncTaskMapTypeMap
  objectDeclaredTypes: AsyncTaskStringMap
  objectShapes: AsyncTaskObjectShapeFieldMap
  runtimeArrayElementTypes: AsyncTaskStringMap
  runtimeStringValues: AsyncTaskStringMap
  runtimeStrings: AsyncTaskStringSet
  setElementTypes: AsyncTaskStringMap
  variables: AsyncTaskStringMap
}

type AsyncTaskVariableScopeSnapshot = {
  arrayLengths: AsyncTaskNumberMap
  arrayShapes: AsyncTaskArrayShapeMap
  boxedVariables: AsyncTaskStringSet
  classInstanceTypes: AsyncTaskStringMap
  exceptionValueNames: AsyncTaskStringSet
  functionTypes: AsyncTaskFunctionTypeMap
  mapTypes: AsyncTaskMapTypeMap
  narrowedNullableScalars: AsyncTaskStringSet
  nullableVariables: AsyncTaskStringSet
  objectAliases: AsyncTaskStringMap
  objectDeclaredTypes: AsyncTaskStringMap
  objectShapes: AsyncTaskObjectShapeFieldMap
  promiseConstructorHandlers: AsyncTaskPromiseConstructorHandlerMap
  promiseRejectionValueTypes: AsyncTaskStringMap
  promiseValueTypes: AsyncTaskStringMap
  runtimeArrayElementTypes: AsyncTaskStringMap
  runtimeCallbacks: AsyncTaskStringSet
  runtimeStringValues: AsyncTaskStringMap
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
  emitOwnedValueCleanup(context: AsyncTaskFunctionContext): string[]
  emitOwnedValueDeclarations(context: AsyncTaskFunctionContext): string[]
  emitPreparedCallArgs(
    expression: AsyncTaskAstNode,
    params: CFunctionParam[],
    context: AsyncTaskFunctionContext
  ): CPreparedCallArgs
  emitPreparedCallExpression(expression: AsyncTaskAstNode, context: AsyncTaskFunctionContext): PreparedExpression
  emitPreparedCompilerLibraryCallExpression(
    expression: AsyncTaskAstNode,
    context: AsyncTaskFunctionContext,
    options?: CPreparedCallOptions
  ): PreparedExpression | null
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
  isCompilerLibraryPromiseExpression(expression: AsyncTaskAstNode | null | undefined): boolean
  isRuntimeProducedStringExpression(expression: AsyncTaskAstNode, context: AsyncTaskFunctionContext): boolean
  isThrowingFunctionCallee(callee: AsyncTaskAstNode, context: AsyncTaskFunctionContext): boolean
  pushVariableScope(context: AsyncTaskFunctionContext): AsyncTaskVariableScopeSnapshot
  registerObjectShape(context: AsyncTaskFunctionContext, name: string, shape: CObjectShape | null | undefined): void
  registerRuntimeValueMetadata(
    name: string,
    valueType: string,
    declaration: AsyncTaskAstNode,
    expression: AsyncTaskAstNode,
    context: AsyncTaskFunctionContext
  ): void
  resolveFunctionParams(callee: AsyncTaskAstNode, context: AsyncTaskFunctionContext): CFunctionParam[] | null
  resolveKnownArrayIndex(expression: AsyncTaskAstNode, context: AsyncTaskFunctionContext): CKnownArrayElement | null
  resolveKnownObjectIndex(
    expression: AsyncTaskAstNode,
    context: AsyncTaskFunctionContext
  ): CKnownObjectIndexField | null
  resolveKnownObjectMember(expression: AsyncTaskAstNode, context: AsyncTaskFunctionContext): CKnownObjectField | null
  resolveRuntimeArrayElementType(expression: AsyncTaskAstNode, context: AsyncTaskFunctionContext): string | null
  resolveRuntimeArrayIndex(expression: AsyncTaskAstNode, context: AsyncTaskFunctionContext): CRuntimeArrayElement | null
  resolveRuntimeMapType(
    expression: AsyncTaskAstNode,
    context: AsyncTaskFunctionContext
  ): CAsyncTaskRuntimeMapType | null
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
  const wrappers: Map<string, CAsyncTaskWrapper> = new Map()

  for (const entry of functions) {
    const plannerContext = asAsyncTaskPlannerContext(dependencies.createFunctionContext(context, 'void', false))
    const declaration = entry.declaration
    const item = entry.node
    const params = resolveAsyncTaskWrapperParams(declaration, plannerContext)

    if (params === null || typeof params === 'undefined') {
      continue
    }

    const wrapperParams = asyncTaskParamsOrEmpty(params)
    const wrapper = createAsyncTaskWrapperFromBodyPlan(item, declaration, plannerContext, wrapperParams)

    if (wrapper !== null && typeof wrapper !== 'undefined') {
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

  if (bodyPlan !== null && typeof bodyPlan !== 'undefined') {
    const cName = emitCIdentifier(declaration.name)

    return {
      key: declaration.name,
      functionName: declaration.name,
      frameTypeName: `inox_async_task_${cName}_frame`,
      startName: `inox_async_task_${cName}_start`,
      resumeName: `inox_async_task_${cName}_resume`,
      rejectName: `inox_async_task_${cName}_reject`,
      finalizerName: `inox_async_task_${cName}_finalize`,
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
  if (params !== null && typeof params !== 'undefined') {
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

function asyncTaskPrefixFrameLocalAt(locals: CAsyncTaskPrefixFrameLocal[], index: number): CAsyncTaskPrefixFrameLocal {
  return locals[index]
}

function asyncTaskAwaitFrameLocalAt(locals: CAsyncTaskAwaitFrameLocal[], index: number): CAsyncTaskAwaitFrameLocal {
  return locals[index]
}

function asyncTaskFrameLocalAt(locals: CAsyncTaskFrameLocal[], index: number): CAsyncTaskFrameLocal {
  return locals[index]
}

function asyncTaskMetadataStringOrUnknown(value: string | null | undefined): string {
  if (value === null || typeof value === 'undefined' || value === '') {
    return 'unknown'
  }

  return value
}

function asyncTaskMapKeyType(item: AsyncTaskMetadataItem): string {
  return asyncTaskMetadataStringOrUnknown(item.mapKeyType)
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

  if (tryRegion !== null && typeof tryRegion !== 'undefined') {
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
    hasTryRegion: tryRegion !== null && typeof tryRegion !== 'undefined',
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
    if (
      item.fieldName === null ||
      typeof item.fieldName === 'undefined' ||
      item.name === null ||
      typeof item.name === 'undefined'
    ) {
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

    if (awaitedExpression !== null && typeof awaitedExpression !== 'undefined') {
      nodes.push(awaitedExpression)
    }

    if (awaitedPromiseExpression !== null && typeof awaitedPromiseExpression !== 'undefined') {
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
  if (handler !== null && typeof handler !== 'undefined') {
    const statements: AsyncTaskAstNode[] = handler.statements

    for (const statement of statements) {
      nodes.push(statement)
    }

    appendAsyncTaskNodeIfPresent(nodes, handler.returnExpression)
  }
}

function appendAsyncTaskNodeIfPresent(nodes: AsyncTaskAstNode[], node: AsyncTaskAstNode | null): void {
  if (node !== null && typeof node !== 'undefined') {
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
  if (value === null || typeof value === 'undefined') {
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
    const path: string[] = current.path

    if (path.length === 1) {
      names.add(path[0])
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
  if (value === null || typeof value === 'undefined' || typeof value !== 'object') {
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
  if (tryRegion !== null && typeof tryRegion !== 'undefined') {
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

function asyncTaskSuccessPhaseKindAt(values: CAsyncTaskSuccessPhaseKind[], index: number): CAsyncTaskSuccessPhaseKind {
  return values[index]
}

function asyncTaskSuccessPhaseKindSetFromArray(values: CAsyncTaskSuccessPhaseKind[]): Set<CAsyncTaskSuccessPhaseKind> {
  const result: Set<CAsyncTaskSuccessPhaseKind> = new Set()

  for (let index = 0; index < values.length; index = index + 1) {
    result.add(asyncTaskSuccessPhaseKindAt(values, index))
  }

  return result
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
  if (block === null || typeof block === 'undefined' || block.body === null || typeof block.body === 'undefined') {
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

  if (argument === null || typeof argument === 'undefined') {
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

function isAsyncTaskThrowingFunctionName(name: string, context: AsyncTaskPlannerContext): boolean {
  return context.throwingFunctions.has(name)
}

function resolveAsyncTaskFunctionDeclarationParams(
  name: string,
  fallback: CFunctionParam[],
  context: AsyncTaskPlannerContext
): CFunctionParam[] {
  const params = context.functionParams.get(name)

  if (params !== null && typeof params !== 'undefined') {
    return params
  }

  return fallback
}

function resolveAsyncTaskWrapperParams(
  declaration: IrFunctionDeclaration,
  context: AsyncTaskPlannerContext
): CAsyncTaskParam[] | null {
  const functionName = declaration.name

  if (
    declaration.async !== true ||
    declaration.returnType !== 'promise' ||
    isAsyncTaskThrowingFunctionName(functionName, context)
  ) {
    return null
  }
  const params = resolveAsyncTaskFunctionDeclarationParams(
    functionName,
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
      argName: `inox_arg_${emitCIdentifier(param.name)}`
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
  const functionName = declaration.name

  if (
    declaration.async !== true ||
    declaration.returnType !== 'promise' ||
    isAsyncTaskThrowingFunctionName(functionName, context)
  ) {
    return null
  }
  const returnType = resolveAsyncTaskDeclarationReturnType(declaration, context)

  if (!isSupportedAsyncTaskValueType(returnType)) {
    return null
  }

  const tryBody = resolveAsyncTaskTryBodyPlan(statement, context, params, returnType)

  if (tryBody !== null && typeof tryBody !== 'undefined') {
    return tryBody
  }

  if (statement.body.length < 2) {
    return null
  }

  const returnStatement = getAsyncTaskLastStatement(statement.body)

  if (
    returnStatement === null ||
    typeof returnStatement === 'undefined' ||
    returnStatement.type !== 'ReturnStatement'
  ) {
    return null
  }

  const awaits = resolveAsyncTaskAwaitSteps(getAsyncTaskStatementsBeforeLast(statement.body), context)

  if (awaits === null || typeof awaits === 'undefined') {
    return null
  }

  const resolvedAwaits = asyncTaskAwaitStepsOrEmpty(awaits)
  const returnScope = pushAsyncTaskExpressionContextScope(context, params, resolvedAwaits)
  const returnExpression = resolveAsyncTaskReturnValueExpression(
    getAsyncTaskReturnArgument(returnStatement),
    returnType,
    context
  )
  asyncTaskDeps(context).restoreVariableScope(context, returnScope)

  if (returnType !== 'void' && (returnExpression === null || typeof returnExpression === 'undefined')) {
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

  if (declarationType !== null && typeof declarationType !== 'undefined') {
    return declarationType
  }

  const mappedType = context.functionReturnPromiseValueTypes.get(declaration.name)

  if (mappedType !== null && typeof mappedType !== 'undefined') {
    return mappedType
  }

  return 'unknown'
}

function asyncTaskAwaitStepsOrEmpty(steps: CAsyncTaskAwaitStep[] | null): CAsyncTaskAwaitStep[] {
  if (steps !== null && typeof steps !== 'undefined') {
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

  if (nestedTryFinallyBody !== null && typeof nestedTryFinallyBody !== 'undefined') {
    return nestedTryFinallyBody
  }

  const tryStatements = getAsyncTaskBlockStatements(tryStatement.block)
  const returnStatement = getAsyncTaskLastStatement(tryStatements)

  if (
    returnStatement === null ||
    typeof returnStatement === 'undefined' ||
    returnStatement.type !== 'ReturnStatement'
  ) {
    return null
  }

  if (
    (tryStatement.handler === null || typeof tryStatement.handler === 'undefined') &&
    (tryStatement.finalizer === null || typeof tryStatement.finalizer === 'undefined')
  ) {
    return null
  }

  const awaits = resolveAsyncTaskAwaitSteps(getAsyncTaskStatementsBeforeLast(tryStatements), context)

  if (awaits === null || typeof awaits === 'undefined') {
    return null
  }

  const resolvedAwaits = asyncTaskAwaitStepsOrEmpty(awaits)
  const returnScope = pushAsyncTaskExpressionContextScope(context, params, resolvedAwaits)
  const returnExpression = resolveAsyncTaskReturnValueExpression(
    getAsyncTaskReturnArgument(returnStatement),
    returnType,
    context
  )
  asyncTaskDeps(context).restoreVariableScope(context, returnScope)

  if (returnType !== 'void' && (returnExpression === null || typeof returnExpression === 'undefined')) {
    return null
  }

  const handler = resolveAsyncTaskTryHandler(tryStatement.handler, context, params, returnType)
  const finalizerStatements = getAsyncTaskBlockStatements(tryStatement.finalizer)

  if (
    (tryStatement.handler !== null &&
      typeof tryStatement.handler !== 'undefined' &&
      (handler === null || typeof handler === 'undefined')) ||
    hasUnsupportedAsyncTaskTryControlFlow(finalizerStatements)
  ) {
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

  if (
    tryChainResultOrNull === null ||
    typeof tryChainResultOrNull === 'undefined' ||
    tryChainResultOrNull.chain.length < 2
  ) {
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

  if (
    returnStatement === null ||
    typeof returnStatement === 'undefined' ||
    returnStatement.type !== 'ReturnStatement'
  ) {
    return null
  }

  const prefixStatements: AsyncTaskAstNode[] = []
  appendAsyncTaskNodes(prefixStatements, tryChainResult.prefixStatements)
  appendAsyncTaskNodes(prefixStatements, innerPrefixResult.prefixStatements)
  const prefixResultOrNull = resolveAsyncTaskPrefixLocals(context, params, prefixStatements)

  if (prefixResultOrNull === null || typeof prefixResultOrNull === 'undefined') {
    return null
  }

  const prefixResult = asyncTaskPrefixLocalsResultOrEmpty(prefixResultOrNull)
  const prefixScope = pushAsyncTaskExpressionContextScope(context, params, prefixResult.locals)
  const awaitResultOrNull = resolveAsyncTaskAwaitStepsAndTrailingStatements(innerPrefixResult.awaitStatements, context)
  asyncTaskDeps(context).restoreVariableScope(context, prefixScope)

  if (awaitResultOrNull === null || typeof awaitResultOrNull === 'undefined') {
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

  const returnScope = pushAsyncTaskExpressionContextScope(context, params, returnContextLocals)
  const finalizers = collectAsyncTaskTryFinalizers(tryChain)
  const handlerIndex = findAsyncTaskNearestTryHandlerIndex(tryChain)
  let handlerSource: AsyncTaskAstNode | null = null

  if (handlerIndex >= 0) {
    handlerSource = asyncTaskNodeAt(tryChain, handlerIndex).handler
  }

  const handler = resolveAsyncTaskTryHandler(handlerSource, context, params, returnType)
  registerAsyncTaskStatementListLocals(context, successStatements)
  const returnExpression = resolveAsyncTaskReturnValueExpression(
    getAsyncTaskReturnArgument(returnStatement),
    returnType,
    context
  )
  asyncTaskDeps(context).restoreVariableScope(context, returnScope)

  if (returnType !== 'void' && (returnExpression === null || typeof returnExpression === 'undefined')) {
    return null
  }

  let successFinalizerStatements: AsyncTaskAstNode[] = []

  if (hasPostNestedStatements) {
    successFinalizerStatements = collectAsyncTaskTryFinalizerStatements(
      finalizers,
      tryChainResult.postNestedOwnerIndex,
      0
    )
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
    (handlerSource !== null &&
      typeof handlerSource !== 'undefined' &&
      (handler === null || typeof handler === 'undefined')) ||
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
    preHandlerFinalizerStatements = collectAsyncTaskTryFinalizerStatements(
      finalizers,
      finalizers.length - 1,
      handlerIndex + 1
    )
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
  if (result !== null && typeof result !== 'undefined') {
    return result
  }

  return {
    chain: [],
    prefixStatements: [],
    postNestedStatements: [],
    postNestedOwnerIndex: -1
  }
}

function asyncTaskPrefixLocalsResultOrEmpty(result: AsyncTaskPrefixLocalsResult | null): AsyncTaskPrefixLocalsResult {
  if (result !== null && typeof result !== 'undefined') {
    return result
  }

  return {
    locals: []
  }
}

function asyncTaskAwaitStepsResultOrEmpty(result: AsyncTaskAwaitStepsResult | null): AsyncTaskAwaitStepsResult {
  if (result !== null && typeof result !== 'undefined') {
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
  if (
    statement === null ||
    typeof statement === 'undefined' ||
    statement.type !== 'VariableDeclaration' ||
    statement.init === null ||
    typeof statement.init === 'undefined'
  ) {
    return false
  }

  return statement.init.type === 'AwaitExpression'
}

function isAsyncTaskStatementAwaitShape(statement: AsyncTaskAstNode | null | undefined): boolean {
  if (
    statement === null ||
    typeof statement === 'undefined' ||
    statement.type !== 'ExpressionStatement' ||
    statement.expression === null ||
    typeof statement.expression === 'undefined'
  ) {
    return false
  }

  return statement.expression.type === 'AwaitExpression'
}

function isAsyncTaskLocalPromiseAwaitShape(
  promiseStatement: AsyncTaskAstNode | null | undefined,
  awaitStatement: AsyncTaskAstNode | null | undefined
): boolean {
  if (
    promiseStatement === null ||
    typeof promiseStatement === 'undefined' ||
    promiseStatement.type !== 'VariableDeclaration' ||
    promiseStatement.init === null ||
    typeof promiseStatement.init === 'undefined'
  ) {
    return false
  }

  if (
    awaitStatement === null ||
    typeof awaitStatement === 'undefined' ||
    awaitStatement.type !== 'VariableDeclaration' ||
    awaitStatement.init === null ||
    typeof awaitStatement.init === 'undefined'
  ) {
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

  while (current !== null && typeof current !== 'undefined' && current.type === 'TryStatement') {
    if (
      (current.handler === null || typeof current.handler === 'undefined') &&
      (current.finalizer === null || typeof current.finalizer === 'undefined')
    ) {
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
    if (tryChain[index].handler !== null && typeof tryChain[index].handler !== 'undefined') {
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
  const scope = pushAsyncTaskExpressionContextScope(context, params, [])
  const locals: CAsyncTaskPrefixLocal[] = []

  for (const statement of prefixStatements) {
    if (statement.type !== 'VariableDeclaration') {
      continue
    }

    const valueType = asyncTaskStatementValueType(statement, context)

    if (!isSupportedAsyncTaskPrefixLocalType(valueType)) {
      asyncTaskDeps(context).restoreVariableScope(context, scope)
      return null
    }

    asyncTaskDeps(context).registerRuntimeValueMetadata(statement.name, valueType, statement, statement.init, context)

    if (valueType === 'string' && isRuntimeStringPrefixLocalDeclaration(statement, context)) {
      context.runtimeStrings.add(statement.name)
    }

    if (isSupportedAsyncTaskFramePrefixLocal(statement, valueType, context)) {
      let shape: CObjectShape | null = null
      let arrayElementType: string | null = null
      let mapKeyType: string | null = null
      let mapValueType: string | null = null
      let setElementType: string | null = null

      if (valueType === 'object') {
        if (statement.shape !== null && typeof statement.shape !== 'undefined') {
          shape = statement.shape
        } else if (
          statement.init !== null &&
          typeof statement.init !== 'undefined' &&
          statement.init.shape !== null &&
          typeof statement.init.shape !== 'undefined'
        ) {
          shape = statement.init.shape
        } else {
          shape = null
        }
      }

      if (valueType === 'array') {
        if (statement.arrayElementType !== null && typeof statement.arrayElementType !== 'undefined') {
          arrayElementType = statement.arrayElementType
        } else if (
          statement.init !== null &&
          typeof statement.init !== 'undefined' &&
          statement.init.arrayElementType !== null &&
          typeof statement.init.arrayElementType !== 'undefined'
        ) {
          arrayElementType = statement.init.arrayElementType
        } else {
          const resolvedArrayElementType = asyncTaskDeps(context).resolveRuntimeArrayElementType(
            statement.init,
            context
          )

          if (resolvedArrayElementType !== null && typeof resolvedArrayElementType !== 'undefined') {
            arrayElementType = resolvedArrayElementType
          } else {
            arrayElementType = 'unknown'
          }
        }
      }

      if (valueType === 'map') {
        const resolvedMapType = asyncTaskDeps(context).resolveRuntimeMapType(statement.init, context)

        if (statement.mapKeyType !== null && typeof statement.mapKeyType !== 'undefined') {
          mapKeyType = statement.mapKeyType
        } else if (resolvedMapType !== null && typeof resolvedMapType !== 'undefined') {
          mapKeyType = resolvedMapType.key
        } else if (
          statement.init !== null &&
          typeof statement.init !== 'undefined' &&
          statement.init.mapKeyType !== null &&
          typeof statement.init.mapKeyType !== 'undefined'
        ) {
          mapKeyType = statement.init.mapKeyType
        } else {
          mapKeyType = 'unknown'
        }

        if (statement.mapValueType !== null && typeof statement.mapValueType !== 'undefined') {
          mapValueType = statement.mapValueType
        } else if (resolvedMapType !== null && typeof resolvedMapType !== 'undefined') {
          mapValueType = resolvedMapType.value
        } else if (
          statement.init !== null &&
          typeof statement.init !== 'undefined' &&
          statement.init.mapValueType !== null &&
          typeof statement.init.mapValueType !== 'undefined'
        ) {
          mapValueType = statement.init.mapValueType
        } else {
          mapValueType = 'unknown'
        }
      }

      if (valueType === 'set') {
        if (statement.setElementType !== null && typeof statement.setElementType !== 'undefined') {
          setElementType = statement.setElementType
        } else {
          const resolvedSetElementType = asyncTaskDeps(context).resolveRuntimeSetElementType(statement.init, context)

          if (resolvedSetElementType !== null && typeof resolvedSetElementType !== 'undefined') {
            setElementType = resolvedSetElementType
          } else if (
            statement.init !== null &&
            typeof statement.init !== 'undefined' &&
            statement.init.setElementType !== null &&
            typeof statement.init.setElementType !== 'undefined'
          ) {
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

  asyncTaskDeps(context).restoreVariableScope(context, scope)

  return {
    locals
  }
}

function registerAsyncTaskStatementListLocals(context: AsyncTaskPlannerContext, statements: AsyncTaskAstNode[]): void {
  for (const statement of statements) {
    if (statement.type !== 'VariableDeclaration') {
      continue
    }

    const valueType = asyncTaskStatementValueType(statement, context)

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
    asyncTaskDeps(context).resolveRuntimeStringReference(expression, context) ||
    asyncTaskDeps(context).isRuntimeProducedStringExpression(expression, context) ||
    isRawStringLiteralExpression(expression)
  ) {
    return true
  }

  if (asyncTaskDeps(context).isMemberAccessExpression(expression)) {
    const member = asyncTaskDeps(context).resolveKnownObjectMember(expression, context)

    return member !== null && typeof member !== 'undefined' && member.valueType === 'string'
  }

  if (asyncTaskDeps(context).isIndexAccessExpression(expression)) {
    const element = asyncTaskDeps(context).resolveKnownArrayIndex(expression, context)
    const field = asyncTaskDeps(context).resolveKnownObjectIndex(expression, context)
    const runtimeElement = asyncTaskDeps(context).resolveRuntimeArrayIndex(expression, context)

    if (element !== null && typeof element !== 'undefined' && element.valueType === 'string') {
      return true
    }

    if (field !== null && typeof field !== 'undefined' && field.valueType === 'string') {
      return true
    }

    return runtimeElement !== null && typeof runtimeElement !== 'undefined' && runtimeElement.valueType === 'string'
  }

  return false
}

function isRawStringLiteralExpression(expression: AsyncTaskAstNode | null | undefined): boolean {
  if (expression === null || typeof expression === 'undefined') {
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
  if (handler === null || typeof handler === 'undefined') {
    return null
  }

  const statements = getAsyncTaskBlockStatements(handler.body)
  const returnStatement = getAsyncTaskLastStatement(statements)
  const handlerStatements = getAsyncTaskStatementsBeforeLast(statements)

  if (
    returnStatement === null ||
    typeof returnStatement === 'undefined' ||
    returnStatement.type !== 'ReturnStatement' ||
    hasUnsupportedAsyncTaskTryControlFlow(handlerStatements)
  ) {
    return null
  }

  const catchScope = pushAsyncTaskExpressionContextScope(context, params, [])

  if (handler.param !== null && typeof handler.param !== 'undefined') {
    context.variables.set(handler.param, 'string')
    context.runtimeStrings.add(handler.param)
  }

  registerAsyncTaskStatementListLocals(context, handlerStatements)
  const returnExpression = resolveAsyncTaskReturnValueExpression(
    getAsyncTaskReturnArgument(returnStatement),
    returnType,
    context
  )
  asyncTaskDeps(context).restoreVariableScope(context, catchScope)

  if (returnExpression === null || typeof returnExpression === 'undefined') {
    return null
  }

  let handlerParam: string | null = null

  if (handler.param !== null && typeof handler.param !== 'undefined') {
    handlerParam = handler.param
  }

  return {
    param: handlerParam,
    statements: handlerStatements,
    returnExpression: returnExpression
  }
}

function pushAsyncTaskExpressionContextScope(
  context: AsyncTaskPlannerContext,
  params: CAsyncTaskParam[],
  locals: Array<CAsyncTaskAwaitStep | CAsyncTaskPrefixLocal>
): AsyncTaskVariableScopeSnapshot {
  const scope = asyncTaskDeps(context).pushVariableScope(context)
  registerAsyncTaskExpressionContextMetadata(context, params, locals)

  return scope
}

function registerAsyncTaskExpressionContextMetadata(
  context: AsyncTaskPlannerContext,
  params: CAsyncTaskParam[],
  locals: Array<CAsyncTaskAwaitStep | CAsyncTaskPrefixLocal>
): void {
  for (const param of params) {
    registerAsyncTaskLocalMetadata(param.name, param.valueType, param, context)
  }

  for (const item of locals) {
    if (item.name !== null && typeof item.name !== 'undefined') {
      registerAsyncTaskLocalMetadata(item.name, item.type, item, context)
    }
  }
}

function hasUnsupportedAsyncTaskTryControlFlow(value: AsyncTaskChildValue): boolean {
  if (value === null || typeof value === 'undefined') {
    return false
  }

  if (Array.isArray(value)) {
    return hasUnsupportedAsyncTaskTryControlFlowArray(value)
  }

  if (typeof value !== 'object') {
    return false
  }

  const current = value as AsyncTaskAstNode

  if (
    current.type !== null &&
    typeof current.type !== 'undefined' &&
    isUnsupportedAsyncTaskTryControlFlowType(current.type)
  ) {
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
  if (value === null || typeof value === 'undefined' || typeof value !== 'object') {
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

  if (result !== null && typeof result !== 'undefined' && result.trailingStatements.length === 0) {
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

    if (directAwait !== null && typeof directAwait !== 'undefined') {
      awaits.push(directAwait)
      index = index + 1
      continue
    }

    const statementAwait = resolveAsyncTaskStatementAwaitStep(statement, context, awaits.length)

    if (statementAwait !== null && typeof statementAwait !== 'undefined') {
      awaits.push(statementAwait)
      index = index + 1
      continue
    }

    const localPromiseAwait = resolveAsyncTaskLocalPromiseAwaitStep(statement, nextStatement, context, awaits.length)

    if (localPromiseAwait !== null && typeof localPromiseAwait !== 'undefined') {
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
  if (
    statement === null ||
    typeof statement === 'undefined' ||
    statement.type !== 'VariableDeclaration' ||
    statement.init === null ||
    typeof statement.init === 'undefined'
  ) {
    return null
  }

  if (statement.init.type !== 'AwaitExpression') {
    return null
  }

  let awaitedType: string = 'unknown'

  if (statement.valueType !== null && typeof statement.valueType !== 'undefined') {
    awaitedType = statement.valueType
  } else if (statement.init.valueType !== null && typeof statement.init.valueType !== 'undefined') {
    awaitedType = statement.init.valueType
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
    if (statement.shape !== null && typeof statement.shape !== 'undefined') {
      shape = statement.shape
    } else if (statement.init.shape !== null && typeof statement.init.shape !== 'undefined') {
      shape = statement.init.shape
    } else if (
      awaitedExpression !== null &&
      typeof awaitedExpression !== 'undefined' &&
      awaitedExpression.shape !== null &&
      typeof awaitedExpression.shape !== 'undefined'
    ) {
      shape = awaitedExpression.shape
    } else {
      shape = null
    }
  }

  if (statement.arrayElementType !== null && typeof statement.arrayElementType !== 'undefined') {
    arrayElementType = statement.arrayElementType
  } else if (statement.init.arrayElementType !== null && typeof statement.init.arrayElementType !== 'undefined') {
    arrayElementType = statement.init.arrayElementType
  } else if (
    awaitedExpression !== null &&
    typeof awaitedExpression !== 'undefined' &&
    awaitedExpression.arrayElementType !== null &&
    typeof awaitedExpression.arrayElementType !== 'undefined'
  ) {
    arrayElementType = awaitedExpression.arrayElementType
  }

  if (awaitedType === 'map') {
    if (statement.mapKeyType !== null && typeof statement.mapKeyType !== 'undefined') {
      mapKeyType = statement.mapKeyType
    } else if (statement.init.mapKeyType !== null && typeof statement.init.mapKeyType !== 'undefined') {
      mapKeyType = statement.init.mapKeyType
    } else if (
      awaitedExpression !== null &&
      typeof awaitedExpression !== 'undefined' &&
      awaitedExpression.mapKeyType !== null &&
      typeof awaitedExpression.mapKeyType !== 'undefined'
    ) {
      mapKeyType = awaitedExpression.mapKeyType
    } else {
      mapKeyType = 'unknown'
    }

    if (statement.mapValueType !== null && typeof statement.mapValueType !== 'undefined') {
      mapValueType = statement.mapValueType
    } else if (statement.init.mapValueType !== null && typeof statement.init.mapValueType !== 'undefined') {
      mapValueType = statement.init.mapValueType
    } else if (
      awaitedExpression !== null &&
      typeof awaitedExpression !== 'undefined' &&
      awaitedExpression.mapValueType !== null &&
      typeof awaitedExpression.mapValueType !== 'undefined'
    ) {
      mapValueType = awaitedExpression.mapValueType
    } else {
      mapValueType = 'unknown'
    }
  }

  if (awaitedType === 'set') {
    if (statement.setElementType !== null && typeof statement.setElementType !== 'undefined') {
      setElementType = statement.setElementType
    } else if (statement.init.setElementType !== null && typeof statement.init.setElementType !== 'undefined') {
      setElementType = statement.init.setElementType
    } else if (
      awaitedExpression !== null &&
      typeof awaitedExpression !== 'undefined' &&
      awaitedExpression.setElementType !== null &&
      typeof awaitedExpression.setElementType !== 'undefined'
    ) {
      setElementType = awaitedExpression.setElementType
    } else {
      setElementType = 'unknown'
    }
  }

  let storedAwaitedExpression: AsyncTaskAstNode | null = awaitedExpression

  if (awaitedPromiseExpression !== null && typeof awaitedPromiseExpression !== 'undefined') {
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
  if (
    statement === null ||
    typeof statement === 'undefined' ||
    statement.type !== 'ExpressionStatement' ||
    statement.expression === null ||
    typeof statement.expression === 'undefined'
  ) {
    return null
  }

  if (statement.expression.type !== 'AwaitExpression') {
    return null
  }

  let awaitedType = statement.expression.valueType

  if (awaitedType === null || typeof awaitedType === 'undefined') {
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

  if (awaitedPromiseExpression !== null && typeof awaitedPromiseExpression !== 'undefined') {
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
  if (
    awaitStatement === null ||
    typeof awaitStatement === 'undefined' ||
    awaitStatement.type !== 'VariableDeclaration' ||
    awaitStatement.init === null ||
    typeof awaitStatement.init === 'undefined'
  ) {
    return null
  }

  if (awaitStatement.init.type !== 'AwaitExpression') {
    return null
  }

  const awaitedPromiseExpression = resolveAsyncTaskAwaitedPromiseExpression(promiseStatement, awaitStatement, context)

  if (awaitedPromiseExpression === null || typeof awaitedPromiseExpression === 'undefined') {
    return null
  }

  let awaitedType: string = 'unknown'

  if (awaitStatement.valueType !== null && typeof awaitStatement.valueType !== 'undefined') {
    awaitedType = awaitStatement.valueType
  } else if (awaitStatement.init.valueType !== null && typeof awaitStatement.init.valueType !== 'undefined') {
    awaitedType = awaitStatement.init.valueType
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
    if (awaitStatement.shape !== null && typeof awaitStatement.shape !== 'undefined') {
      shape = awaitStatement.shape
    } else if (awaitStatement.init.shape !== null && typeof awaitStatement.init.shape !== 'undefined') {
      shape = awaitStatement.init.shape
    } else if (awaitedPromiseExpression.shape !== null && typeof awaitedPromiseExpression.shape !== 'undefined') {
      shape = awaitedPromiseExpression.shape
    } else {
      shape = null
    }
  }

  if (awaitStatement.arrayElementType !== null && typeof awaitStatement.arrayElementType !== 'undefined') {
    arrayElementType = awaitStatement.arrayElementType
  } else if (
    awaitStatement.init.arrayElementType !== null &&
    typeof awaitStatement.init.arrayElementType !== 'undefined'
  ) {
    arrayElementType = awaitStatement.init.arrayElementType
  } else {
    arrayElementType = awaitedPromiseExpression.arrayElementType

    if (arrayElementType === null || typeof arrayElementType === 'undefined') {
      arrayElementType = null
    }
  }

  if (awaitedType === 'map') {
    if (awaitStatement.mapKeyType !== null && typeof awaitStatement.mapKeyType !== 'undefined') {
      mapKeyType = awaitStatement.mapKeyType
    } else if (awaitStatement.init.mapKeyType !== null && typeof awaitStatement.init.mapKeyType !== 'undefined') {
      mapKeyType = awaitStatement.init.mapKeyType
    } else if (
      awaitedPromiseExpression.mapKeyType !== null &&
      typeof awaitedPromiseExpression.mapKeyType !== 'undefined'
    ) {
      mapKeyType = awaitedPromiseExpression.mapKeyType
    } else {
      mapKeyType = 'unknown'
    }

    if (awaitStatement.mapValueType !== null && typeof awaitStatement.mapValueType !== 'undefined') {
      mapValueType = awaitStatement.mapValueType
    } else if (awaitStatement.init.mapValueType !== null && typeof awaitStatement.init.mapValueType !== 'undefined') {
      mapValueType = awaitStatement.init.mapValueType
    } else if (
      awaitedPromiseExpression.mapValueType !== null &&
      typeof awaitedPromiseExpression.mapValueType !== 'undefined'
    ) {
      mapValueType = awaitedPromiseExpression.mapValueType
    } else {
      mapValueType = 'unknown'
    }
  }

  if (awaitedType === 'set') {
    if (awaitStatement.setElementType !== null && typeof awaitStatement.setElementType !== 'undefined') {
      setElementType = awaitStatement.setElementType
    } else if (
      awaitStatement.init.setElementType !== null &&
      typeof awaitStatement.init.setElementType !== 'undefined'
    ) {
      setElementType = awaitStatement.init.setElementType
    } else if (
      awaitedPromiseExpression.setElementType !== null &&
      typeof awaitedPromiseExpression.setElementType !== 'undefined'
    ) {
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
  if (promiseStatement === null || typeof promiseStatement === 'undefined') {
    return null
  }

  if (
    promiseStatement.type !== 'VariableDeclaration' ||
    promiseStatement.init === null ||
    typeof promiseStatement.init === 'undefined' ||
    promiseStatement.init.valueType !== 'promise' ||
    !isSupportedAsyncTaskAwaitedPromiseExpression(promiseStatement.init, context)
  ) {
    return null
  }

  let awaited: AsyncTaskAstNode | null = null

  if (awaitStatement.init !== null && typeof awaitStatement.init !== 'undefined') {
    awaited = awaitStatement.init.argument
  }

  if (awaited === null || typeof awaited === 'undefined' || awaited.type !== 'Reference') {
    return null
  }

  const awaitedPath: string[] = awaited.path

  if (awaitedPath.length !== 1 || awaitedPath[0] !== promiseStatement.name) {
    return null
  }

  return promiseStatement.init
}

function isSupportedAsyncTaskAwaitedPromiseExpression(
  expression: AsyncTaskAstNode | null | undefined,
  context: AsyncTaskPlannerContext
): boolean {
  if (expression === null || typeof expression === 'undefined' || expression.type !== 'CallExpression') {
    return false
  }

  if (isSupportedAsyncTaskDirectAwaitPromiseExpression(expression, context)) {
    return true
  }

  if (cPromiseRuntimeCallName(expression.callee) === 'resolve') {
    return true
  }

  if (
    expression.callee === null ||
    typeof expression.callee === 'undefined' ||
    expression.callee.type !== 'MemberExpression' ||
    expression.callee.property !== 'then'
  ) {
    return false
  }

  const receiver = asyncTaskMemberObjectOrNull(expression)
  const callback = asyncTaskNodeOrEmpty(asyncTaskFirstArgumentOrNull(expression))

  if (receiver === null || typeof receiver === 'undefined' || receiver.type !== 'CallExpression') {
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
  if (expression === null || typeof expression === 'undefined' || expression.type !== 'CallExpression') {
    return false
  }

  if (cPromiseRuntimeCallName(expression.callee) === 'reject') {
    return true
  }

  if (asyncTaskDeps(context).isCompilerLibraryPromiseExpression(expression)) {
    return true
  }

  if (isPromiseReturningFunctionCallee(expression.callee, context)) {
    return true
  }

  if (
    !isAsyncFunctionCallee(expression.callee, context) ||
    asyncTaskDeps(context).isThrowingFunctionCallee(expression.callee, context)
  ) {
    return false
  }

  const valueType = resolvedAsyncFunctionAwaitValueType(expression, context)

  return isSupportedAsyncTaskValueType(valueType)
}

function resolvedAsyncFunctionAwaitValueType(expression: AsyncTaskAstNode, context: AsyncTaskPlannerContext): string {
  const resolvedValueType = resolveCAsyncFunctionAwaitValueType(expression.callee, context) ?? ''

  if (resolvedValueType !== '') {
    return resolvedValueType
  }

  if (expression.promiseValueType !== null && typeof expression.promiseValueType !== 'undefined') {
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
    if (expression === null || typeof expression === 'undefined') {
      return null
    }

    return expression
  }

  if (
    expression !== null &&
    typeof expression !== 'undefined' &&
    expression.type === 'CallExpression' &&
    cPromiseRuntimeCallName(expression.callee) === 'resolve'
  ) {
    if (expression.args[0] === null || typeof expression.args[0] === 'undefined') {
      return null
    }

    return expression.args[0]
  }

  if (expression === null || typeof expression === 'undefined') {
    return null
  }

  let expressionType = 'unknown'

  if (
    expression.valueType !== null &&
    typeof expression.valueType !== 'undefined' &&
    expression.valueType !== 'unknown'
  ) {
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
  lines.push('  inox_loop* inox_loop;')
  lines.push('  inox_promise* promise;')
  lines.push('  inox_promise* awaited;')
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
    return 'inox_value'
  }

  return emitCType(valueType)
}

function emitAsyncTaskStorageInit(valueType: string): string {
  if (isManagedRuntimeReturnType(valueType)) {
    return 'inox_undefined_value()'
  }

  return '0'
}

export function emitAsyncTaskWrapperPrototypes(wrapper: CAsyncTaskWrapper): string[] {
  return [
    `static inox_status ${wrapper.startName}(${emitAsyncTaskStartParams(wrapper)});`,
    `static inox_status ${wrapper.resumeName}(void* context, inox_value inox_value_input);`,
    `static inox_status ${wrapper.rejectName}(void* context, inox_value inox_error);`,
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

  context.failureStatement = 'goto inox_start_error;'
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

  lines.push(`static inox_status ${wrapper.startName}(${emitAsyncTaskStartParams(wrapper)}) {`)
  lines.push('  if (inox_loop == 0 || inox_loop->allocator == 0 || out == 0) return INOX_ERR_TYPE;')
  lines.push('  *out = 0;')
  lines.push(
    `  ${wrapper.frameTypeName}* frame = (${wrapper.frameTypeName}*)inox_loop->allocator->alloc(inox_loop->allocator->user, sizeof(${wrapper.frameTypeName}), _Alignof(${wrapper.frameTypeName}));`
  )
  lines.push('  if (frame == 0) return INOX_ERR_OOM;')
  lines.push('  frame->inox_loop = inox_loop;')
  lines.push('  frame->promise = 0;')
  lines.push('  frame->awaited = 0;')
  lines.push('  frame->state = 0;')

  for (const param of wrapper.params) {
    lines.push(`  frame->${param.fieldName} = ${param.argName};`)
  }

  for (const local of wrapper.frameLocals) {
    lines.push(`  frame->${local.fieldName} = ${emitAsyncTaskStorageInit(local.type)};`)
  }

  lines.push('  inox_status status = inox_promise_new(inox_loop, &frame->promise);')
  appendIndentedAsyncTaskLines(lines, asyncTaskDeps(context).emitOwnedValueDeclarations(context), '  ')
  lines.push('  if (status != INOX_OK) {')
  lines.push('    inox_loop->allocator->free(inox_loop->allocator->user, frame, sizeof(*frame), _Alignof(*frame));')
  lines.push('    return status;')
  lines.push('  }')

  for (const param of wrapper.params) {
    if (isManagedRuntimeReturnType(param.valueType)) {
      lines.push(`  inox_retain(frame->${param.fieldName});`)
    }
  }

  lines.push('  inox_promise_retain(frame->promise);')
  lines.push('  *out = frame->promise;')
  appendIndentedAsyncTaskLines(lines, emitAsyncTaskVisibleLocalReads(wrapper, 0, { includePrefixLocals: false }), '  ')
  appendIndentedAsyncTaskLines(lines, prefixAndScheduleLines, '  ')
  appendIndentedAsyncTaskLines(lines, asyncTaskDeps(context).emitOwnedValueCleanup(context), '  ')
  lines.push('  return INOX_OK;')

  if (context.failureStatementUsed) {
    lines.push('inox_start_error:')
    appendIndentedAsyncTaskLines(lines, asyncTaskDeps(context).emitOwnedValueCleanup(context), '  ')
    lines.push('  inox_promise_release(*out);')
    lines.push('  *out = 0;')
    lines.push(`  ${wrapper.finalizerName}(frame);`)
    lines.push('  return INOX_ERR_TYPE;')
  }

  lines.push('}')

  return lines
}

function emitAsyncTaskStartParams(wrapper: CAsyncTaskWrapper): string {
  const params = ['inox_loop* inox_loop']

  for (const param of wrapper.params) {
    params.push(`${emitCType(param.valueType)} ${param.argName}`)
  }

  params.push('inox_promise** out')

  return joinStrings(params, ', ')
}

function registerAsyncTaskParams(wrapper: CAsyncTaskWrapper, context: AsyncTaskLocalMetadataContext): void {
  for (const param of wrapper.params) {
    registerAsyncTaskLocalMetadata(param.name, param.valueType, param, context)
  }
}

function registerAsyncTaskAwaitLocals(
  wrapper: CAsyncTaskWrapper,
  context: AsyncTaskLocalMetadataContext,
  count: number
): void {
  const locals: CAsyncTaskAwaitFrameLocal[] = collectAsyncTaskVisibleAwaitFrameLocals(wrapper, count)

  for (let index = 0; index < locals.length; index = index + 1) {
    const item = asyncTaskAwaitFrameLocalAt(locals, index)
    const name = item.name

    if (name !== null && typeof name !== 'undefined') {
      registerAsyncTaskLocalMetadata(name, item.type, item, context)
    }
  }
}

function registerAsyncTaskPrefixLocals(wrapper: CAsyncTaskWrapper, context: AsyncTaskLocalMetadataContext): void {
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
      appendAsyncTaskLines(lines, emitPrepareOwnedValueWrite(`frame->${local.fieldName}`, 'raw'))
      lines.push(`frame->${local.fieldName}.tag = INOX_TAG_STRING;`)
      lines.push(`frame->${local.fieldName}.as.ref = (inox_ref*)&${local.name}->header;`)
      lines.push(`inox_retain(frame->${local.fieldName});`)
      continue
    }

    if (isManagedRuntimeReturnType(local.type)) {
      appendAsyncTaskLines(lines, emitPrepareOwnedValueWrite(`frame->${local.fieldName}`, 'raw'))
      lines.push(`frame->${local.fieldName} = ${local.name};`)
      lines.push(`inox_retain(frame->${local.fieldName});`)
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

  if (options === null || typeof options === 'undefined' || options.includePrefixLocals !== false) {
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

    if (name !== null && typeof name !== 'undefined' && fieldName !== null && typeof fieldName !== 'undefined') {
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

    if (local.index < count && local.name !== null && typeof local.name !== 'undefined') {
      locals.push(local)
    }
  }

  return locals
}

function registerAsyncTaskLocalMetadata(
  name: string,
  valueType: string,
  item: CAsyncTaskFrameLocal | CAsyncTaskAwaitStep | CAsyncTaskParam | CAsyncTaskPrefixLocal,
  context: AsyncTaskLocalMetadataContext
): void {
  context.variables.set(name, valueType)

  if (valueType === 'string') {
    context.runtimeStrings.add(name)
  } else if (valueType === 'object') {
    registerAsyncTaskObjectShape(context, name, item.shape)
  } else if (valueType === 'array') {
    const arrayElementType = asyncTaskMetadataStringOrUnknown(item.arrayElementType)
    context.runtimeArrayElementTypes.set(name, arrayElementType)
  } else if (valueType === 'map') {
    const mapKeyType = asyncTaskMapKeyType(item)
    const mapValueType = asyncTaskMetadataStringOrUnknown(item.mapValueType)

    context.mapTypes.set(name, {
      key: mapKeyType,
      value: mapValueType
    })
  } else if (valueType === 'set') {
    const setElementType = asyncTaskMetadataStringOrUnknown(item.setElementType)
    context.setElementTypes.set(name, setElementType)
  }
}

function registerAsyncTaskObjectShape(
  context: AsyncTaskLocalMetadataContext,
  name: string,
  shape: CObjectShape | null | undefined
): void {
  if (shape === null || typeof shape === 'undefined' || shape.fields === null || typeof shape.fields === 'undefined') {
    return
  }

  const seen: Set<CObjectShape> = new Set()
  seen.add(shape)
  registerAsyncTaskObjectShapeFields(context, name, shape.fields, seen)
}

function registerAsyncTaskObjectShapeFields(
  context: AsyncTaskLocalMetadataContext,
  name: string,
  fields: CObjectShapeField[],
  seen: Set<CObjectShape>
): void {
  context.objectShapes.set(name, fields)

  for (const field of fields) {
    const shape = field.shape

    if (
      field.valueType !== 'object' ||
      shape === null ||
      typeof shape === 'undefined' ||
      shape.fields === null ||
      typeof shape.fields === 'undefined' ||
      seen.has(shape)
    ) {
      continue
    }

    seen.add(shape)
    registerAsyncTaskObjectShapeFields(context, `${name}_${field.name}`, shape.fields, seen)
    seen.delete(shape)
  }
}

function emitAsyncTaskVisibleLocalRead(name: string, valueType: string, fieldName: string): string[] {
  if (valueType === 'string') {
    return [`inox_string* ${name} = (inox_string*)frame->${fieldName}.as.ref;`]
  }

  if (isManagedRuntimeReturnType(valueType)) {
    return [`inox_value ${name} = frame->${fieldName};`]
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
  context.explicitEventLoop = true
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

  if (awaitedPromise === null || typeof awaitedPromise === 'undefined') {
    awaited = emitPreparedAsyncTaskAwaitedValueExpression(item, context)
  }

  let finalizer = '0'

  if (options.final) {
    finalizer = wrapper.finalizerName
  }

  let cleanupLines = options.cleanupLines

  if (cleanupLines === null || typeof cleanupLines === 'undefined') {
    cleanupLines = asyncTaskDeps(context).emitOwnedValueCleanup(context)
  }

  const lines: string[] = []

  if (awaitedPromise === null || typeof awaitedPromise === 'undefined') {
    lines.push('status = inox_promise_new(inox_loop, &frame->awaited);')
    appendAsyncTaskLines(lines, emitAsyncTaskScheduleStatusCheck(wrapper, options, cleanupLines))
  } else {
    appendAsyncTaskLines(lines, awaitedPromise.lines)
  }

  lines.push(
    `status = inox_promise_then(frame->awaited, ${wrapper.resumeName}, ${wrapper.rejectName}, frame, ${finalizer});`
  )
  appendAsyncTaskLines(lines, emitAsyncTaskScheduleStatusCheck(wrapper, options, cleanupLines))

  if (awaitedPromise === null || typeof awaitedPromise === 'undefined') {
    let awaitedExpression = 'inox_undefined_value()'

    if (awaited !== null && typeof awaited !== 'undefined') {
      appendAsyncTaskLines(lines, awaited.lines)
      awaitedExpression = awaited.expression
    }

    lines.push(`status = inox_promise_resolve(frame->awaited, ${awaitedExpression});`)
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
    lines.push('if (status != INOX_OK) {')
    appendIndentedAsyncTaskLines(lines, activeCleanupLines, '  ')
    lines.push('  inox_promise_release(*out);')
    lines.push('  *out = 0;')
    lines.push(`  ${wrapper.finalizerName}(frame);`)
    lines.push('  return status;')
    lines.push('}')

    return lines
  }

  lines.push('if (status != INOX_OK) {')
  appendIndentedAsyncTaskLines(lines, activeCleanupLines, '  ')
  lines.push(
    '  inox_status reject_status = inox_promise_reject(frame->promise, inox_number_value((inox_number)status));'
  )
  lines.push(`  ${wrapper.finalizerName}(frame);`)
  lines.push('  return reject_status == INOX_OK ? status : reject_status;')
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
    lines.push('if (status != INOX_OK) {')
    appendIndentedAsyncTaskLines(lines, activeCleanupLines, '  ')
    lines.push('  inox_promise_release(*out);')
    lines.push('  *out = 0;')

    if (!options.final) {
      lines.push(`  ${wrapper.finalizerName}(frame);`)
    }

    lines.push('  return status;')
    lines.push('}')

    return lines
  }

  if (options.final) {
    lines.push('if (status != INOX_OK) {')
    appendIndentedAsyncTaskLines(lines, activeCleanupLines, '  ')
    lines.push('  return status;')
    lines.push('}')

    return lines
  }

  return emitAsyncTaskScheduleStatusCheck(wrapper, options, activeCleanupLines)
}

function asyncTaskLinesOrEmpty(lines: string[] | null): string[] {
  if (lines !== null && typeof lines !== 'undefined') {
    return lines
  }

  return []
}

function asyncTaskNodeOrEmpty(node: AsyncTaskAstNode | null | undefined): AsyncTaskAstNode {
  if (node !== null && typeof node !== 'undefined') {
    return node
  }

  return { type: '' }
}

function asyncTaskMemberObjectOrNull(expression: AsyncTaskAstNode): AsyncTaskAstNode | null {
  const callee = expression.callee

  if (callee === null || typeof callee === 'undefined') {
    return null
  }

  const object = callee.object

  if (object === null || typeof object === 'undefined') {
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

  if (argument === null || typeof argument === 'undefined') {
    return null
  }

  return argument
}

function asyncTaskReferenceNameOrNull(expression: AsyncTaskAstNode | null | undefined): string | null {
  if (
    expression === null ||
    typeof expression === 'undefined' ||
    expression.type !== 'Reference' ||
    expression.path.length !== 1
  ) {
    return null
  }

  return expression.path[0]
}

function asyncTaskLocationOrNull(expression: AsyncTaskAstNode): SourceLocation | null {
  const loc = expression.loc

  if (loc === null || typeof loc === 'undefined') {
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

  if (awaitedPromiseExpression === null || typeof awaitedPromiseExpression === 'undefined') {
    return null
  }

  const promiseSource = emitPreparedAsyncTaskPromiseSourceExpression(wrapper, item, context, options)

  if (promiseSource !== null && typeof promiseSource !== 'undefined') {
    return promiseSource
  }

  const chain = emitPreparedAsyncTaskAwaitedPromiseChainExpression(wrapper, item, context, options)

  if (chain !== null && typeof chain !== 'undefined') {
    return chain
  }

  if (
    awaitedPromiseExpression.type !== 'CallExpression' ||
    cPromiseRuntimeCallName(awaitedPromiseExpression.callee) !== 'resolve'
  ) {
    const loc: SourceLocation | null = awaitedPromiseExpression.loc

    context.diagnostics.push(
      diagnostic(
        'INOX_C_ASYNC',
        'async task state-machine slice currently supports local Promise.resolve call variables only',
        loc
      )
    )

    return {
      lines: emitAsyncTaskErrorStatusLines(wrapper, options)
    }
  }

  let awaitedValueExpression: AnyNode | null = null

  if (awaitedPromiseExpression.args[0] !== null && typeof awaitedPromiseExpression.args[0] !== 'undefined') {
    awaitedValueExpression = awaitedPromiseExpression.args[0]
  }

  const value = emitPreparedAsyncTaskValueExpression(awaitedValueExpression, item.type, context)
  const lines: string[] = []

  appendAsyncTaskLines(lines, value.lines)
  lines.push(`status = inox_promise_resolved(inox_loop, ${value.expression}, &frame->awaited);`)
  appendAsyncTaskLines(lines, emitAsyncTaskScheduleStatusCheck(wrapper, options, null))

  return {
    lines: lines
  }
}

function emitAsyncTaskErrorStatusLines(wrapper: CAsyncTaskWrapper, options: AsyncTaskScheduleOptions): string[] {
  const lines = ['status = INOX_ERR_TYPE;']

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

  if (expression === null || typeof expression === 'undefined' || expression.type !== 'CallExpression') {
    return null
  }

  const rejected = emitPreparedAsyncTaskRejectedPromiseSourceExpression(expression, wrapper, context, options)

  if (rejected !== null && typeof rejected !== 'undefined') {
    return rejected
  }

  const libraryCall = asyncTaskDeps(context).emitPreparedCompilerLibraryCallExpression(
    expression,
    context,
    { owned: false }
  )

  if (libraryCall !== null && asyncTaskDeps(context).isCompilerLibraryPromiseExpression(expression)) {
    const lines: string[] = []
    appendAsyncTaskLines(lines, libraryCall.lines)
    lines.push(`frame->awaited = ${libraryCall.expression}.release();`)
    lines.push('status = frame->awaited != nullptr ? INOX_OK : INOX_ERR_TYPE;')
    appendAsyncTaskLines(lines, emitAsyncTaskScheduleStatusCheck(wrapper, options, null))
    return { lines }
  }

  const taskCall = emitPreparedAsyncTaskSourceCallExpression(expression, wrapper, context, options)

  if (taskCall !== null && typeof taskCall !== 'undefined') {
    return taskCall
  }

  const asyncCall = emitPreparedAsyncFunctionSourceCallExpression(expression, wrapper, context, options)

  if (asyncCall !== null && typeof asyncCall !== 'undefined') {
    return asyncCall
  }

  const promiseCall = emitPreparedPlainPromiseSourceCallExpression(expression, wrapper, context, options)

  if (promiseCall !== null && typeof promiseCall !== 'undefined') {
    return promiseCall
  }

  return null
}

function emitPreparedAsyncTaskRejectedPromiseSourceExpression(
  expression: AsyncTaskAstNode,
  wrapper: CAsyncTaskWrapper,
  context: AsyncTaskFunctionContext,
  options: AsyncTaskScheduleOptions
): PreparedAsyncTaskPromise | null {
  if (cPromiseRuntimeCallName(expression.callee) !== 'reject') {
    return null
  }

  const rejectArgument = asyncTaskFirstArgumentOrNull(expression)

  if (rejectArgument !== null && typeof rejectArgument !== 'undefined' && rejectArgument.type === 'StringLiteral') {
    const value = nextCName(context, 'inox_reject_value')
    const bytes = cStringLiteral(rejectArgument.value)
    const length = utf8ByteLength(rejectArgument.value)
    const lines: string[] = []

    lines.push(`auto ${value} = inox::String(${bytes}, ${length});`)
    lines.push(`status = ${value}.valid() ? INOX_OK : INOX_ERR_TYPE;`)
    appendAsyncTaskLines(lines, emitAsyncTaskScheduleStatusCheck(wrapper, options, null))
    lines.push(`status = inox_promise_rejected(inox_loop, ${value}, &frame->awaited);`)
    appendAsyncTaskLines(lines, emitAsyncTaskScheduleStatusCheck(wrapper, options, null))

    return {
      lines: lines
    }
  }

  if (
    rejectArgument !== null &&
    typeof rejectArgument !== 'undefined' &&
    rejectArgument.type !== 'NumberLiteral' &&
    rejectArgument.type !== 'BooleanLiteral'
  ) {
    context.diagnostics.push(
      diagnostic(
        'INOX_C_ASYNC',
        'async task Promise.reject currently supports string, number and boolean rejection values in C',
        expression.loc
      )
    )

    return {
      lines: emitAsyncTaskErrorStatusLines(wrapper, options)
    }
  }

  let valueLines: string[] = []
  let valueExpression = 'inox_undefined_value()'

  if (rejectArgument !== null && typeof rejectArgument !== 'undefined') {
    const value = asyncTaskDeps(context).emitCValueExpression(rejectArgument, context)

    valueLines = value.lines
    valueExpression = value.expression
  }

  const lines: string[] = []

  appendAsyncTaskLines(lines, valueLines)
  lines.push(`status = inox_promise_rejected(inox_loop, ${valueExpression}, &frame->awaited);`)
  appendAsyncTaskLines(lines, emitAsyncTaskScheduleStatusCheck(wrapper, options, null))

  return {
    lines: lines
  }
}

function emitPreparedAsyncTaskSourceCallExpression(
  expression: AsyncTaskAstNode,
  wrapper: CAsyncTaskWrapper,
  context: AsyncTaskFunctionContext,
  options: AsyncTaskScheduleOptions
): PreparedAsyncTaskPromise | null {
  const sourceName = asyncTaskReferenceNameOrNull(expression.callee)

  if (sourceName === null || typeof sourceName === 'undefined') {
    return null
  }

  const target = context.asyncTaskWrappers.get(sourceName)

  if (target !== null && typeof target !== 'undefined') {
    const prepared = asyncTaskDeps(context).emitPreparedCallArgs(expression, target.params, context)
    const args = ['inox_loop']
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
  expression: AsyncTaskAstNode,
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
    lines.push('status = inox_promise_resolved(inox_loop, inox_undefined_value(), &frame->awaited);')
    appendAsyncTaskLines(lines, emitAsyncTaskScheduleStatusCheck(wrapper, options, null))

    return {
      lines: lines
    }
  }

  if (isManagedRuntimeReturnType(valueType)) {
    const value = nextCName(context, 'inox_async_value')
    const tag = cRuntimeValueTag(valueType)

    const lines: string[] = []

    appendAsyncTaskLines(lines, call.lines)
    lines.push(`inox_value ${value} = ${call.expression};`)
    lines.push(emitRuntimeValueCheck(value, tag, context))
    lines.push(`status = inox_promise_resolved(inox_loop, ${value}, &frame->awaited);`)
    appendAsyncTaskLines(lines, emitAsyncTaskScheduleStatusCheck(wrapper, options, [`inox_release(${value});`]))
    lines.push(`inox_release(${value});`)

    return {
      lines: lines
    }
  }

  let value = `inox_number_value(${call.expression})`

  if (valueType === 'boolean') {
    value = `inox_bool_value((${call.expression}) != 0)`
  }

  const lines: string[] = []

  appendAsyncTaskLines(lines, call.lines)
  lines.push(`status = inox_promise_resolved(inox_loop, ${value}, &frame->awaited);`)
  appendAsyncTaskLines(lines, emitAsyncTaskScheduleStatusCheck(wrapper, options, null))

  return {
    lines: lines
  }
}

function emitPreparedPlainPromiseSourceCallExpression(
  expression: AsyncTaskAstNode,
  wrapper: CAsyncTaskWrapper,
  context: AsyncTaskFunctionContext,
  options: AsyncTaskScheduleOptions
): PreparedAsyncTaskPromise | null {
  if (!isPromiseReturningFunctionCallee(expression.callee, context)) {
    return null
  }

  const params = asyncTaskDeps(context).resolveFunctionParams(expression.callee, context)

  if (params === null || typeof params === 'undefined') {
    return null
  }

  const resolvedParams = asyncTaskFunctionParamsOrEmpty(params)
  const prepared = asyncTaskDeps(context).emitPreparedCallArgs(expression, resolvedParams, context)
  const args = ['inox_loop']
  const lines: string[] = []

  for (const arg of prepared.args) {
    args.push(arg)
  }

  appendAsyncTaskLines(lines, prepared.lines)
  const calleeName: string = asyncTaskDeps(context).emitCallee(expression.callee, context)
  lines.push(`frame->awaited = ${calleeName}(${joinStrings(args, ', ')});`)
  lines.push('status = frame->awaited == 0 ? INOX_ERR_TYPE : INOX_OK;')
  appendAsyncTaskLines(lines, emitAsyncTaskScheduleStatusCheck(wrapper, options, null))

  return {
    lines: lines
  }
}

function asyncTaskFunctionParamsOrEmpty(params: CFunctionParam[] | null): CFunctionParam[] {
  if (params !== null && typeof params !== 'undefined') {
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
    expression === null ||
    typeof expression === 'undefined' ||
    expression.type !== 'CallExpression' ||
    expression.callee === null ||
    typeof expression.callee === 'undefined' ||
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
    if (chainWrapper !== null && typeof chainWrapper !== 'undefined') {
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
      'INOX_C_ASYNC',
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
  const source = nextCName(context, 'inox_async_task_source')
  let sourceType: string = item.type

  if (receiver.promiseValueType !== null && typeof receiver.promiseValueType !== 'undefined') {
    sourceType = receiver.promiseValueType
  } else if (
    callback !== null &&
    typeof callback !== 'undefined' &&
    callback.params[0] !== null &&
    typeof callback.params[0] !== 'undefined' &&
    callback.params[0].valueType !== null &&
    typeof callback.params[0].valueType !== 'undefined'
  ) {
    sourceType = callback.params[0].valueType
  }

  const value = emitPreparedAsyncTaskValueExpression(receiver.args[0], sourceType, context)
  const callbackContext = emitAsyncTaskPromiseChainCallbackContext(wrapper, chainWrapper, context, options)
  const cleanupLines: string[] = []

  if (callbackContext.expression !== '0') {
    cleanupLines.push(`${chainWrapper.finalizerName}(${callbackContext.expression});`)
  }

  const lines: string[] = []

  appendAsyncTaskLines(lines, callbackContext.lines)
  lines.push(`inox_promise* ${source} = 0;`)
  appendAsyncTaskLines(lines, value.lines)
  lines.push(`status = inox_promise_resolved(inox_loop, ${value.expression}, &${source});`)
  appendAsyncTaskLines(lines, emitAsyncTaskScheduleStatusCheck(wrapper, options, cleanupLines))
  lines.push(
    `status = inox_promise_chain(${source}, ${chainWrapper.name}, 0, ${callbackContext.expression}, ${callbackContext.finalizer}, &frame->awaited);`
  )
  lines.push(`inox_promise_release(${source});`)
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
  if (chainWrapper !== null && typeof chainWrapper !== 'undefined') {
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
          'INOX_C_ASYNC',
          'mutable Promise callback captures are outside the current C backend MVP; use const captures or move mutation outside the Promise callback',
          chainWrapper.expression.loc
        )
      )
    }

    if (!isSupportedAsyncTaskPromiseCaptureType(capture.valueType)) {
      context.diagnostics.push(
        diagnostic(
          'INOX_C_ASYNC',
          'capturing async Promise callbacks currently support only const number/boolean/string/object bindings',
          chainWrapper.expression.loc
        )
      )
    }
  }

  const contextName = nextCName(context, 'inox_promise_callback_ctx')

  lines.push(
    `${chainWrapper.contextTypeName}* ${contextName} = (${chainWrapper.contextTypeName}*)inox_default_alloc(0, sizeof(${chainWrapper.contextTypeName}), _Alignof(${chainWrapper.contextTypeName}));`
  )
  lines.push('if (' + contextName + ' == 0) {')
  lines.push('  status = INOX_ERR_OOM;')
  appendIndentedAsyncTaskLines(lines, emitAsyncTaskScheduleStatusCheck(asyncWrapper, options, null), '  ')
  lines.push('}')

  if (chainWrapper.needsEventLoop === true) {
    lines.push(`${contextName}->inox_loop = inox_loop;`)
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

  if (awaitedExpression === null || typeof awaitedExpression === 'undefined') {
    context.diagnostics.push(
      diagnostic(
        'INOX_C_ASYNC',
        'async task state-machine slice currently supports await Promise.resolve calls only',
        null
      )
    )

    return {
      lines: ['status = INOX_ERR_TYPE;'],
      expression: 'inox_undefined_value()'
    }
  }

  if (awaitedExpression.type !== 'CallExpression' || cPromiseRuntimeCallName(awaitedExpression.callee) !== 'resolve') {
    let loc: SourceLocation | null = null

    loc = awaitedExpression.loc

    context.diagnostics.push(
      diagnostic(
        'INOX_C_ASYNC',
        'async task state-machine slice currently supports await Promise.resolve calls only',
        loc
      )
    )

    return {
      lines: ['status = INOX_ERR_TYPE;'],
      expression: 'inox_undefined_value()'
    }
  }

  let awaitedValueExpression: AnyNode | null = null

  if (awaitedExpression.args.length > 0) {
    awaitedValueExpression = awaitedExpression.args[0]
  }

  return emitPreparedAsyncTaskValueExpression(awaitedValueExpression, item.type, context)
}

function emitPreparedAsyncTaskValueExpression(
  expression: AsyncTaskAstNode | null | undefined,
  valueType: string,
  context: AsyncTaskFunctionContext
): PreparedExpression {
  if (valueType === 'void') {
    return {
      lines: [],
      expression: 'inox_undefined_value()'
    }
  }

  if (expression === null || typeof expression === 'undefined') {
    context.diagnostics.push(
      diagnostic('INOX_C_ASYNC', 'async task value expression is required for non-void return values')
    )

    return {
      lines: ['status = INOX_ERR_TYPE;'],
      expression: 'inox_undefined_value()'
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
      expression: `inox_bool_value((${value.expression}) != 0)`
    }
  }

  const value = asyncTaskDeps(context).emitPreparedNumberExpression(expression, context)

  return {
    lines: value.lines,
    expression: `inox_number_value(${value.expression})`
  }
}

function emitAsyncTaskResumeDeclaration(wrapper: CAsyncTaskWrapper, baseContext: AsyncTaskEmitContext): string[] {
  const context = createAsyncTaskEmitContext(baseContext, wrapper, wrapper.returnType, wrapper.awaits.length)
  let returnValue: PreparedExpression | null = null

  if (!hasAsyncTaskStatementLocalDeclarations(collectAsyncTaskSuccessPhaseStatements(wrapper, ['body']))) {
    returnValue = emitPreparedAsyncTaskValueExpression(wrapper.returnExpression, wrapper.returnType, context)
  }

  const returnValueOwnedValues: string[] = []

  if (returnValue !== null && typeof returnValue !== 'undefined') {
    for (const name of context.ownedValues) {
      returnValueOwnedValues.push(name)
    }
  }

  const cases: string[] = []

  for (const item of wrapper.awaits) {
    appendAsyncTaskLines(
      cases,
      emitAsyncTaskResumeCase(wrapper, item, baseContext, returnValue, returnValueOwnedValues)
    )
  }

  const lines: string[] = []

  lines.push(`static inox_status ${wrapper.resumeName}(void* context, inox_value inox_value_input) {`)
  lines.push(`  ${wrapper.frameTypeName}* frame = (${wrapper.frameTypeName}*)context;`)
  lines.push('  if (frame == 0 || frame->promise == 0) return INOX_ERR_TYPE;')
  lines.push('  inox_status status = INOX_OK;')
  lines.push('  switch (frame->state) {')
  appendIndentedAsyncTaskLines(lines, cases, '  ')
  lines.push('  default:')
  lines.push('    return inox_promise_reject(frame->promise, inox_number_value((inox_number)INOX_ERR_TYPE));')
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
  lines.push('    inox_promise_release(frame->awaited);')
  lines.push('    frame->awaited = 0;')
  lines.push('  }')

  if (nextItem === null || typeof nextItem === 'undefined') {
    appendIndentedAsyncTaskLines(lines, emitAsyncTaskVisibleLocalReads(wrapper, item.index + 1, null), '  ')
    if (returnValue === null || typeof returnValue === 'undefined') {
      appendIndentedAsyncTaskLines(
        lines,
        emitAsyncTaskTrySuccessPreludeAndReturnLines(wrapper, item, baseContext),
        '  '
      )
    } else if (returnValueOwnedValues.length > 0) {
      for (const name of returnValueOwnedValues) {
        lines.push(`  inox_value ${name} = inox_undefined_value();`)
      }

      appendIndentedAsyncTaskLines(
        lines,
        emitAsyncTaskTrySuccessPreludeLines(wrapper, baseContext, item.index + 1),
        '  '
      )
      appendIndentedAsyncTaskLines(lines, returnValue.lines, '  ')
      appendIndentedAsyncTaskLines(
        lines,
        emitAsyncTaskTrySuccessFinallyLines(wrapper, baseContext, item.index + 1),
        '  '
      )
      lines.push(`  status = inox_promise_resolve(frame->promise, ${returnValue.expression});`)

      for (let index = returnValueOwnedValues.length - 1; index >= 0; index = index - 1) {
        lines.push(`  inox_release(${returnValueOwnedValues[index]});`)
      }

      lines.push('  return status;')
    } else {
      appendIndentedAsyncTaskLines(
        lines,
        emitAsyncTaskTrySuccessPreludeLines(wrapper, baseContext, item.index + 1),
        '  '
      )
      appendIndentedAsyncTaskLines(lines, returnValue.lines, '  ')
      appendIndentedAsyncTaskLines(
        lines,
        emitAsyncTaskTrySuccessFinallyLines(wrapper, baseContext, item.index + 1),
        '  '
      )
      lines.push(`  return inox_promise_resolve(frame->promise, ${returnValue.expression});`)
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
  lines.push('  inox_loop* inox_loop = frame->inox_loop;')
  lines.push('  if (inox_loop == 0) {')
  appendIndentedAsyncTaskLines(
    lines,
    emitAsyncTaskRejectAndMaybeFinalizeLines(wrapper, item, 'inox_number_value((inox_number)INOX_ERR_TYPE)'),
    '    '
  )
  lines.push('  }')
  lines.push(`  frame->state = ${followingItem.index};`)
  appendIndentedAsyncTaskLines(lines, schedule, '  ')
  lines.push('  return INOX_OK;')
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

  if (kinds !== null && typeof kinds !== 'undefined') {
    allowedKinds = asyncTaskSuccessPhaseKindSetFromArray(kinds)
  }

  const statements: AsyncTaskAstNode[] = []

  for (const phase of wrapper.successPhases) {
    if (
      allowedKinds !== null &&
      typeof allowedKinds !== 'undefined' &&
      !allowedKinds.has(phase.kind as CAsyncTaskSuccessPhaseKind)
    ) {
      continue
    }

    appendAsyncTaskNodes(statements, phase.statements)
  }

  return statements
}

function collectAsyncTaskTryPhaseStatements(
  wrapper: CAsyncTaskWrapper,
  kind: CAsyncTaskTryPhaseKind
): AsyncTaskAstNode[] {
  const statements: AsyncTaskAstNode[] = []

  for (const phase of wrapper.tryPhases) {
    if (phase.kind === kind) {
      appendAsyncTaskNodes(statements, phase.statements)
    }
  }

  return statements
}

function emitAsyncTaskFulfilledValueCheck(wrapper: CAsyncTaskWrapper, item: CAsyncTaskAwaitStep): string[] {
  const expectedTag = cRuntimeValueTag(item.type) ?? ''

  if (expectedTag === '') {
    return []
  }

  let refCheck = ''

  if (isManagedRuntimeReturnType(item.type)) {
    refCheck = ' || inox_value_input.as.ref == 0'
  }

  const lines: string[] = []

  lines.push(`if (inox_value_input.tag != ${expectedTag}${refCheck}) {`)
  appendIndentedAsyncTaskLines(
    lines,
    emitAsyncTaskRejectAndMaybeFinalizeLines(wrapper, item, 'inox_number_value((inox_number)INOX_ERR_TYPE)'),
    '  '
  )
  lines.push('}')

  return lines
}

function emitAsyncTaskStoreFulfilledValueLines(item: CAsyncTaskAwaitStep): string[] {
  if (item.fieldName === null || typeof item.fieldName === 'undefined' || item.type === 'void') {
    return []
  }

  if (item.type === 'boolean') {
    return [`frame->${item.fieldName} = inox_value_input.as.boolean ? 1 : 0;`]
  }

  if (item.type === 'number') {
    return [`frame->${item.fieldName} = inox_value_input.as.number;`]
  }

  if (isManagedRuntimeReturnType(item.type)) {
    return [`frame->${item.fieldName} = inox_value_input;`, `inox_retain(frame->${item.fieldName});`]
  }

  return []
}

function emitAsyncTaskRejectAndMaybeFinalizeLines(
  wrapper: CAsyncTaskWrapper,
  item: CAsyncTaskAwaitStep,
  errorExpression: string
): string[] {
  const lines: string[] = []

  lines.push(`inox_status reject_status = inox_promise_reject(frame->promise, ${errorExpression});`)

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

  preludeLines = asyncTaskDeps(context).emitStatementList(
    collectAsyncTaskSuccessPhaseStatements(wrapper, null),
    context
  )
  returnValue = emitPreparedAsyncTaskValueExpression(wrapper.returnExpression, wrapper.returnType, context)
  asyncTaskDeps(context).restoreVariableScope(context, resultScope)

  const lines: string[] = []

  appendAsyncTaskLines(lines, asyncTaskDeps(context).emitOwnedValueDeclarations(context))
  appendAsyncTaskLines(lines, preludeLines)
  appendAsyncTaskLines(lines, returnValue.lines)
  appendAsyncTaskLines(lines, emitAsyncTaskTrySuccessFinallyLines(wrapper, baseContext, visibleAwaitCount))
  lines.push(`status = inox_promise_resolve(frame->promise, ${returnValue.expression});`)
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

  lines.push(`static inox_status ${wrapper.rejectName}(void* context, inox_value inox_error) {`)
  lines.push(`  ${wrapper.frameTypeName}* frame = (${wrapper.frameTypeName}*)context;`)
  lines.push('  if (frame == 0 || frame->promise == 0) return INOX_ERR_TYPE;')
  lines.push('  inox_status status = inox_promise_reject(frame->promise, inox_error);')

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

  lines.push(`static inox_status ${wrapper.rejectName}(void* context, inox_value inox_error) {`)
  lines.push(`  ${wrapper.frameTypeName}* frame = (${wrapper.frameTypeName}*)context;`)
  lines.push('  if (frame == 0 || frame->promise == 0) return INOX_ERR_TYPE;')
  lines.push('  inox_status status = INOX_OK;')
  lines.push('  switch (frame->state) {')
  appendIndentedAsyncTaskLines(lines, cases, '  ')
  lines.push('  default:')
  lines.push('    status = inox_promise_reject(frame->promise, inox_error);')
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

  if (handler !== null && typeof handler !== 'undefined') {
    return emitAsyncTaskTryRejectHandlerCase(wrapper, item, baseContext, handler)
  }

  const lines = [`case ${item.index}: {`]

  appendIndentedAsyncTaskLines(lines, emitAsyncTaskVisibleLocalReads(wrapper, item.index, null), '  ')
  appendIndentedAsyncTaskLines(lines, emitAsyncTaskTryRejectFinallyLines(wrapper, baseContext, item.index), '  ')
  appendIndentedAsyncTaskLines(
    lines,
    emitAsyncTaskSettleAndMaybeFinalizeLines(wrapper, item, 'inox_promise_reject(frame->promise, inox_error)'),
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

  if (handlerParam !== null && typeof handlerParam !== 'undefined') {
    lines.push('  if (inox_error.tag != INOX_TAG_STRING || inox_error.as.ref == 0) {')
    appendIndentedAsyncTaskLines(
      lines,
      emitAsyncTaskSettleAndMaybeFinalizeLines(
        wrapper,
        item,
        'inox_promise_reject(frame->promise, inox_number_value((inox_number)INOX_ERR_TYPE))'
      ),
      '    '
    )
    lines.push('  }')
  }

  appendIndentedAsyncTaskLines(lines, emitAsyncTaskVisibleLocalReads(wrapper, item.index, null), '  ')
  appendIndentedAsyncTaskLines(lines, emitAsyncTaskTryHandlerPreludeLines(wrapper, baseContext, item.index), '  ')

  if (handlerParam !== null && typeof handlerParam !== 'undefined') {
    lines.push(`  inox_string* ${handlerParam} = (inox_string*)inox_error.as.ref;`)
  }

  appendIndentedAsyncTaskLines(
    lines,
    emitAsyncTaskTryHandlerBodyAndReturnLines(wrapper, item, baseContext, handler),
    '  '
  )
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

  if (handlerParam !== null && typeof handlerParam !== 'undefined') {
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
  lines.push(`status = inox_promise_resolve(frame->promise, ${returnValue.expression});`)
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
  lines.push('  if (frame->awaited != 0) inox_promise_release(frame->awaited);')

  for (const param of wrapper.params) {
    if (isManagedRuntimeReturnType(param.valueType)) {
      lines.push(`  inox_release(frame->${param.fieldName});`)
    }
  }

  for (const local of wrapper.frameLocals) {
    if (isManagedRuntimeReturnType(local.type)) {
      lines.push(`  inox_release(frame->${local.fieldName});`)
    }
  }

  lines.push('  if (frame->promise != 0) inox_promise_release(frame->promise);')
  lines.push('  if (frame->inox_loop != 0 && frame->inox_loop->allocator != 0) {')
  lines.push(
    '    frame->inox_loop->allocator->free(frame->inox_loop->allocator->user, frame, sizeof(*frame), _Alignof(*frame));'
  )
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
    returnLine = '  return inox_undefined_value();'
  }

  const head: string = asyncTaskDeps(context).emitFunctionHead(statement, context)
  return [`${head} {`, returnLine, '}']
}
