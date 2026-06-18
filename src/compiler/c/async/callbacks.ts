import { collectIrTopLevelNodeEntries } from '../../ir.ts'
import { isCJsGlobalRoot } from '../globals.ts'
import { emitCFunctionName, emitCIdentifier } from '../identifiers.ts'
import { emitCType, isManagedRuntimeReturnType, isNullableScalarType, isOpaqueRuntimeValueType } from '../value-types.ts'
import { isPromiseConstructorExpression, functionTakesEventLoopParam } from './promises.ts'
import { isTimerStartCallExpression, timerCallbackFunctionType } from '../stdlib/timers.ts'
import type {
  CCallbackContextWrapper,
  CCallbackWrapper,
  CFunctionParam,
  CFunctionType,
  CObjectShape,
  CObjectShapeField,
  CPlainArrowCallbackWrapper,
  CPromiseChainWrapper,
  CRuntimeArrowCallbackWrapper,
  CRuntimeArrowCapture,
  CRuntimeCallbackWrapper
} from '../types.ts'
import type { AnyNode, IrProgram } from '../../types.ts'
import type { CPreparedExpression as PreparedExpression } from '../types.ts'


type CallbackNode = AnyNode
type CallbackArrowWrapperMap = Map<AnyNode, CCallbackWrapper>
type CallbackBooleanMap = Map<string, boolean>
type CallbackFunctionParamMap = Map<string, CFunctionParam[]>
type CallbackFunctionTypeMap = Map<string, CFunctionType>
type CallbackMutableDeclarationSet = Set<AnyNode | null | undefined>
type CallbackObjectShapeMap = Map<string, CObjectShapeField[]>
type CallbackPromiseConstructorHandlerMap = Map<string, {
  kind: 'reject' | 'resolve'
  promise: string
}>
type CallbackStringMap = Map<string, string>
type CallbackStringSet = Set<string>
type CallbackWrapperMap = Map<string, CCallbackWrapper>
type RuntimeArrowCaptureMap = Map<string, CRuntimeArrowCapture>

type CallbackEmitContext = {
  boxedMutableCaptureDeclarations: CallbackMutableDeclarationSet
  callbackArrowWrappers: CallbackArrowWrapperMap
  callbackWrappers: CallbackWrapperMap
  externalEventLoopFunctions: CallbackStringSet
  functionAsyncFlags: CallbackBooleanMap
  functionNames: CallbackStringMap
  functionParams: CallbackFunctionParamMap
  functionReturnTypes: CallbackStringMap
  jsGlobalRoots: CallbackStringSet
  moduleValueNames?: CallbackStringMap
  runtimeFunctionParams: CallbackFunctionTypeMap
}

type CallbackFunctionContext = CallbackEmitContext & {
  boxedVariables: CallbackStringSet
  cleanupEnabled: boolean
  eventLoopUsed: boolean
  externalEventLoop: boolean
  objectShapes: CallbackObjectShapeMap
  promiseConstructorHandlers: CallbackPromiseConstructorHandlerMap
  runtimeCallbackCleanupLabel?: string
  runtimeCallbackReturnOut?: string
  runtimeCallbackReturnShape?: CObjectShape | null
  runtimeCallbackReturnType?: string
  runtimeStrings: CallbackStringSet
  statusReturn: boolean
  usedRuntimeCallbackCleanupGoto?: boolean
  variables: CallbackStringMap
}

type RuntimeFunctionArgumentContext = {
  runtimeFunctionParams: CallbackFunctionTypeMap
}

function callbackBooleanValueIsTrue(value: boolean | null | undefined): boolean {
  if (value == null) {
    return false
  }

  if (value) {
    return true
  }

  return false
}

export type CallbackLoweringDependencies = {
  collectTemplatePlaceholderExpressions(expression: AnyNode): AnyNode[]
  createFunctionContext(
    baseContext: CallbackEmitContext,
    returnType: string,
    returnNullable: boolean
  ): CallbackFunctionContext
  emitBoxedValueCleanup(context: CallbackFunctionContext): string[]
  emitBoxedValueDeclarations(context: CallbackFunctionContext): string[]
  emitCleanupReturn(context: CallbackFunctionContext): string[]
  emitErrorChannelDeclarations(context: CallbackFunctionContext): string[]
  emitLoopFlowDeclarations(context: CallbackFunctionContext): string[]
  emitOwnedValueCleanup(context: CallbackFunctionContext): string[]
  emitOwnedValueDeclarations(context: CallbackFunctionContext): string[]
  emitPreparedNumberExpression(expression: AnyNode, context: CallbackFunctionContext): PreparedExpression
  emitReturnFlowDeclarations(context: CallbackFunctionContext): string[]
  emitReturnValueDeclarations(context: CallbackFunctionContext): string[]
  emitRuntimeCallbackRuntimeValueReturnLines(argument: AnyNode, context: CallbackFunctionContext): string[]
  emitStatementList(statements: AnyNode[], context: CallbackFunctionContext): string[]
  registerObjectShape(context: CallbackFunctionContext, name: string, shape: CObjectShape | null | undefined): void
  shouldEmitCleanupLabel(context: CallbackFunctionContext): boolean
}

export type CallbackScopeBinding = {
  declaration?: AnyNode | CFunctionParam | null
  functionType?: CFunctionType | null
  loc?: AnyNode['loc']
  mutable?: boolean
  name: string
  nullable?: boolean
  promiseSettlementKind?: 'reject' | 'resolve' | null
  runtimeCallback?: boolean
  runtimeManaged?: boolean
  shape?: CObjectShape | null
  valueType: string
}

export type CallbackScope = Map<string, CallbackScopeBinding>

type PendingPlainFunctionArg = {
  arg: AnyNode
  callee: AnyNode
  functionType: CFunctionType
  index: number
  scopes: CallbackScope[]
}

type ExternalEventLoopScanState = {
  externalNames: Set<string>
  found: boolean
}

type RuntimeArrowCaptureScanState = {
  captures: RuntimeArrowCaptureMap
  context: CallbackEmitContext
  deps: CallbackLoweringDependencies
  localScopes: CallbackScope[]
  outerScopes: CallbackScope[]
}

type CallbackTopLevelNodeEntry = {
  kind: string
  node: CallbackNode
}

function callbackNodeAt(values: CallbackNode[], index: number): CallbackNode {
  return values[index]
}

function callbackParamAt(values: CFunctionParam[], index: number): CFunctionParam {
  return values[index]
}

function callbackProgramAt(values: IrProgram[], index: number): IrProgram {
  return values[index]
}

function callbackObjectShapeFieldAt(values: CObjectShapeField[], index: number): CObjectShapeField {
  return values[index]
}

function callbackRuntimeArrowCaptureAt(values: CRuntimeArrowCapture[], index: number): CRuntimeArrowCapture {
  return values[index]
}

function callbackTopLevelNodeEntryAt(values: CallbackTopLevelNodeEntry[], index: number): CallbackTopLevelNodeEntry {
  return values[index]
}

function isPlainCallbackParamValueType(valueType: string): boolean {
  return valueType === 'number' || valueType === 'boolean'
}

function isPlainFunctionPointerParam(param: CFunctionParam): boolean {
  if (param.nullable === true && isNullableScalarType(param.valueType)) {
    return false
  }

  if (param.valueType === 'object' && !isSupportedPlainFunctionPointerShape(param.shape, [])) {
    return false
  }

  return (
    param.valueType === 'number' ||
    param.valueType === 'boolean' ||
    param.valueType === 'unknown' ||
    isManagedRuntimeReturnType(param.valueType) ||
    isOpaqueRuntimeValueType(param.valueType)
  )
}

function isSupportedPlainFunctionPointerShape(shape: CObjectShape | null | undefined, seen: CObjectShape[]): boolean {
  if (shape == null || shape.fields == null) {
    return true
  }

  for (const item of seen) {
    if (item === shape) {
      return true
    }
  }

  seen.push(shape)

  for (const field of shape.fields) {
    if (
      field.valueType === 'function' &&
      !isPlainFunctionPointerType(field.functionType) &&
      !isRuntimeFunctionType(field.functionType)
    ) {
      seen.pop()
      return false
    }

    if (field.valueType === 'object' && !isSupportedPlainFunctionPointerShape(field.shape, seen)) {
      seen.pop()
      return false
    }
  }

  seen.pop()

  return true
}

function isPlainFunctionPointerReturn(functionType: CFunctionType): boolean {
  if (functionType.returnNullable === true && isNullableScalarType(functionType.returnType)) {
    return false
  }

  return (
    functionType.returnType === 'void' ||
    functionType.returnType === 'number' ||
    functionType.returnType === 'boolean' ||
    functionType.returnType === 'unknown' ||
    isManagedRuntimeReturnType(functionType.returnType) ||
    isOpaqueRuntimeValueType(functionType.returnType)
  )
}

function isManagedRuntimeCallbackParamValueType(valueType: string): boolean {
  return valueType === 'string' || valueType === 'object'
}

function isSupportedRuntimeCallbackParamValueType(valueType: string): boolean {
  return (
    valueType === 'number' ||
    valueType === 'boolean' ||
    valueType === 'string' ||
    valueType === 'object'
  )
}

function externalEventLoopNodeUses(node: AnyNode, externalNames: Set<string>): boolean {
  const state: ExternalEventLoopScanState = {
    externalNames: externalNames,
    found: false
  }

  visitExternalEventLoopNode(node, state)

  return state.found
}

function visitExternalEventLoopNode(value: AnyNode | AnyNode[] | null | undefined, state: ExternalEventLoopScanState): void {
  if (state.found || value == null) {
    return
  }

  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index = index + 1) {
      const item = callbackNodeAt(value, index)

      visitExternalEventLoopNode(item, state)
    }
    return
  }

  if (isTimerStartCallExpression(value)) {
    state.found = true
    return
  }

  if (value.type === 'CallExpression') {
    const calleeName = callbackReferenceNameOrNull(value.callee)

    if (calleeName != null && state.externalNames.has(calleeName)) {
      state.found = true
      return
    }
  }

  visitExternalEventLoopChildren(value, state)
}

function callbackReferenceNameOrNull(value: AnyNode | null | undefined): string | null {
  if (value == null || value.type !== 'Reference' || value.path.length !== 1) {
    return null
  }

  return value.path[0]
}

function visitExternalEventLoopChildren(current: AnyNode, state: ExternalEventLoopScanState): void {
  if (current.type === 'BlockStatement') {
    visitExternalEventLoopNode(current.body, state)
    return
  }

  if (current.type === 'ExpressionStatement') {
    visitExternalEventLoopNode(current.expression, state)
    return
  }

  if (current.type === 'VariableDeclaration') {
    visitExternalEventLoopNode(current.init, state)
    return
  }

  if (current.type === 'ReturnStatement' || current.type === 'ThrowStatement') {
    visitExternalEventLoopNode(current.argument, state)
    return
  }

  if (current.type === 'CallExpression' || current.type === 'NewExpression' || current.type === 'OptionalCallExpression') {
    visitExternalEventLoopNode(current.callee, state)
    visitExternalEventLoopNode(current.args, state)
    return
  }

  if (current.type === 'AssignmentExpression') {
    visitExternalEventLoopNode(current.target, state)
    visitExternalEventLoopNode(current.value, state)
    return
  }

  if (current.type === 'BinaryExpression') {
    visitExternalEventLoopNode(current.left, state)
    visitExternalEventLoopNode(current.right, state)
    return
  }

  if (
    current.type === 'UnaryExpression' ||
    current.type === 'UpdateExpression' ||
    current.type === 'AwaitExpression'
  ) {
    visitExternalEventLoopNode(current.argument, state)
    return
  }

  if (current.type === 'MemberExpression' || current.type === 'OptionalMemberExpression') {
    visitExternalEventLoopNode(current.object, state)
    return
  }

  if (current.type === 'IndexExpression' || current.type === 'OptionalIndexExpression') {
    visitExternalEventLoopNode(current.object, state)
    visitExternalEventLoopNode(current.index, state)
    return
  }

  if (current.type === 'ArrayLiteral') {
    visitExternalEventLoopNode(current.elements, state)
    return
  }

  if (current.type === 'ObjectLiteral') {
    for (let index = 0; index < current.properties.length; index = index + 1) {
      const property = callbackNodeAt(current.properties, index)

      visitExternalEventLoopNode(property.value, state)
    }
    return
  }

  if (current.type === 'TemplateLiteral') {
    visitExternalEventLoopNode(current.expressions, state)
    return
  }

  if (current.type === 'ArrowFunctionExpression') {
    visitExternalEventLoopNode(current.body, state)
    return
  }

  if (current.type === 'FunctionDeclaration') {
    visitExternalEventLoopNode(current.body, state)
    return
  }

  if (current.type === 'IfStatement') {
    visitExternalEventLoopNode(current.condition, state)
    visitExternalEventLoopNode(current.consequent, state)
    visitExternalEventLoopNode(current.alternate, state)
    return
  }

  if (current.type === 'WhileStatement') {
    visitExternalEventLoopNode(current.condition, state)
    visitExternalEventLoopNode(current.body, state)
    return
  }

  if (current.type === 'ForStatement') {
    visitExternalEventLoopNode(current.init, state)
    visitExternalEventLoopNode(current.test, state)
    visitExternalEventLoopNode(current.update, state)
    visitExternalEventLoopNode(current.body, state)
    return
  }

  if (current.type === 'ForOfStatement') {
    visitExternalEventLoopNode(current.iterable, state)
    visitExternalEventLoopNode(current.body, state)
    return
  }

  if (current.type === 'SwitchStatement') {
    visitExternalEventLoopNode(current.discriminant, state)

    for (let index = 0; index < current.cases.length; index = index + 1) {
      const item = callbackNodeAt(current.cases, index)

      visitExternalEventLoopNode(item.test, state)
      visitExternalEventLoopNode(item.consequent, state)
    }
    return
  }

  if (current.type === 'TryStatement') {
    visitExternalEventLoopNode(current.block, state)

    if (current.handler != null) {
      visitExternalEventLoopNode(current.handler.body, state)
    }

    visitExternalEventLoopNode(current.finalizer, state)
  }
}

export function functionUsesExternalEventLoop(node: AnyNode, externalNames: Set<string>): boolean {
  return externalEventLoopNodeUses(node, externalNames)
}

const genericFunctionType: CFunctionType = {
  kind: 'function',
  params: [],
  returnType: 'void'
}

export function normalizeFunctionType(functionType: CFunctionType | null | undefined): CFunctionType {
  if (functionType != null) {
    return functionType
  }

  return genericFunctionType
}

export function isPlainFunctionPointerType(functionType: CFunctionType | null | undefined): boolean {
  if (functionType == null) {
    return true
  }

  if (!isPlainFunctionPointerReturn(functionType)) {
    return false
  }

  for (let index = 0; index < functionType.params.length; index = index + 1) {
    const param = callbackParamAt(functionType.params, index)

    if (!isPlainFunctionPointerParam(param)) {
      return false
    }
  }

  return true
}

export function isRuntimeFunctionType(functionType: CFunctionType | null | undefined): boolean {
  if (functionType == null) {
    return false
  }

  if (!isSupportedRuntimeCallbackReturnType(functionType.returnType)) {
    return false
  }

  let hasManagedParam = false

  for (let index = 0; index < functionType.params.length; index = index + 1) {
    const param = callbackParamAt(functionType.params, index)

    if (!isSupportedRuntimeCallbackParamValueType(param.valueType)) {
      return false
    }

    if (isManagedRuntimeCallbackParamValueType(param.valueType)) {
      hasManagedParam = true
    }
  }

  return hasManagedParam
}

export function isNullableFunctionType(valueType: string | null | undefined, nullable: boolean | null | undefined): boolean {
  return valueType === 'function' && callbackBooleanValueIsTrue(nullable)
}

export function isSupportedRuntimeCallbackType(functionType: CFunctionType | null | undefined): boolean {
  const normalized = normalizeFunctionType(functionType)

  if (!isSupportedRuntimeCallbackReturnType(normalized.returnType)) {
    return false
  }

  for (let index = 0; index < normalized.params.length; index = index + 1) {
    const param = callbackParamAt(normalized.params, index)

    if (!isSupportedRuntimeCallbackParamValueType(param.valueType)) {
      return false
    }
  }

  return true
}

export function isSupportedRuntimeCallbackReturnType(returnType: string | null | undefined): boolean {
  if (returnType == null) {
    return false
  }

  return (
    returnType === 'void' ||
    returnType === 'number' ||
    returnType === 'boolean' ||
    returnType === 'string' ||
    returnType === 'object'
  )
}

function runtimeFunctionParamKey(functionName: string, index: number): string {
  return `${functionName}:${index}`
}

export function markRuntimeFunctionParam(
  callee: AnyNode | null | undefined,
  index: number,
  functionType: CFunctionType | null | undefined,
  context: CallbackEmitContext
): void {
  if (callee == null || callee.type !== 'Reference') {
    return
  }

  if (callee.path.length !== 1) {
    return
  }

  const name = callee.path[0]

  if (!context.functionParams.has(name) || !isSupportedRuntimeCallbackType(functionType)) {
    return
  }

  context.runtimeFunctionParams.set(runtimeFunctionParamKey(name, index), normalizeFunctionType(functionType))
}

export function resolveFunctionParameterRuntimeType(
  functionName: string,
  index: number,
  param: CFunctionParam,
  context: CallbackEmitContext
): CFunctionType | null {
  const promoted = context.runtimeFunctionParams.get(runtimeFunctionParamKey(functionName, index))

  if (promoted != null) {
    return promoted
  }

  if (isNullableFunctionType(param.valueType, param.nullable)) {
    return normalizeFunctionType(param.functionType)
  }

  if (isRuntimeFunctionType(param.functionType)) {
    return normalizeFunctionType(param.functionType)
  }

  return null
}

export function resolveRuntimeFunctionArgumentType(
  callee: AnyNode | null | undefined,
  index: number,
  param: CFunctionParam | null | undefined,
  context: RuntimeFunctionArgumentContext
): CFunctionType | null {
  if (param == null || param.valueType !== 'function') {
    return null
  }

  if (callee != null && callee.type === 'Reference' && callee.path.length === 1) {
    const promoted = context.runtimeFunctionParams.get(runtimeFunctionParamKey(callee.path[0], index))

    if (promoted != null) {
      return promoted
    }
  }

  if (isNullableFunctionType(param.valueType, param.nullable)) {
    return normalizeFunctionType(param.functionType)
  }

  if (isRuntimeFunctionType(param.functionType)) {
    return normalizeFunctionType(param.functionType)
  }

  return null
}

export function collectCallbackWrappers(
  irPrograms: IrProgram[],
  context: CallbackEmitContext,
  deps: CallbackLoweringDependencies
): CallbackWrapperMap {
  const wrappers: CallbackWrapperMap = new Map()
  const pendingPlainFunctionArgs: PendingPlainFunctionArg[] = []

  for (let irIndex = 0; irIndex < irPrograms.length; irIndex = irIndex + 1) {
    const ir = callbackProgramAt(irPrograms, irIndex)
    const topLevelScope: CallbackScope = new Map()
    const entries = collectIrTopLevelNodeEntries(ir)

    for (let entryIndex = 0; entryIndex < entries.length; entryIndex = entryIndex + 1) {
      const item = callbackTopLevelNodeEntryAt(entries, entryIndex)

      if (item.kind === 'function') {
        const scope: CallbackScope = new Map()
        declareCallbackParams(scope, item.node.params)
        const functionScopes: CallbackScope[] = [topLevelScope, scope]

        for (let statementIndex = 0; statementIndex < item.node.body.length; statementIndex = statementIndex + 1) {
          const statement = callbackNodeAt(item.node.body, statementIndex)

          visitCallbackStatement(statement, functionScopes, wrappers, pendingPlainFunctionArgs, context, deps)
        }
      } else if (item.kind === 'statement') {
        visitCallbackStatement(item.node, [topLevelScope], wrappers, pendingPlainFunctionArgs, context, deps)
      }
    }
  }

  for (let pendingIndex = 0; pendingIndex < pendingPlainFunctionArgs.length; pendingIndex = pendingIndex + 1) {
    const pending = pendingPlainFunctionArgs[pendingIndex]
    if (
      resolveRuntimeFunctionArgumentType(
        pending.callee,
        pending.index,
        {
          name: '',
          valueType: 'function',
          functionType: pending.functionType
        },
        context
      ) != null
    ) {
      registerRuntimeCallbackExpression(pending.arg, pending.functionType, pending.scopes, wrappers, context, deps)
    } else {
      registerPlainCallbackExpression(pending.arg, pending.functionType, pending.scopes, wrappers, context, deps)
    }
  }

  return wrappers
}

function appendCallbackScope(scopes: CallbackScope[], scope: CallbackScope): CallbackScope[] {
  const result: CallbackScope[] = []

  for (let index = 0; index < scopes.length; index = index + 1) {
    const item = scopes[index]
    result.push(item)
  }

  result.push(scope)

  return result
}

function registerCallbackExpression(
  expression: AnyNode | null | undefined,
  functionType: CFunctionType | null | undefined,
  scopes: CallbackScope[],
  wrappers: CallbackWrapperMap,
  context: CallbackEmitContext,
  deps: CallbackLoweringDependencies
): void {
  const arrowNeedsEventLoop =
    expression != null &&
    expression.type === 'ArrowFunctionExpression' &&
    functionUsesExternalEventLoop(expression, context.externalEventLoopFunctions)

  if (
    isPlainFunctionPointerType(functionType) &&
    expression != null &&
    expression.type === 'ArrowFunctionExpression' &&
    !arrowNeedsEventLoop
  ) {
    registerPlainArrowCallbackWrapper(expression, normalizeFunctionType(functionType), scopes, wrappers, context, deps)
    return
  }

  if (arrowNeedsEventLoop && isSupportedRuntimeCallbackType(functionType)) {
    registerRuntimeCallbackExpression(expression, functionType, scopes, wrappers, context, deps)
    return
  }

  if (!isRuntimeFunctionType(functionType)) {
    return
  }

  if (expression != null && expression.type === 'ArrowFunctionExpression') {
    registerArrowCallbackWrapper(expression, normalizeFunctionType(functionType), scopes, wrappers, context, deps)
    return
  }

  registerNamedCallbackWrapper(expression, normalizeFunctionType(functionType), wrappers, context)
}

function registerRuntimeCallbackExpression(
  expression: AnyNode | null | undefined,
  functionType: CFunctionType | null | undefined,
  scopes: CallbackScope[],
  wrappers: CallbackWrapperMap,
  context: CallbackEmitContext,
  deps: CallbackLoweringDependencies
): void {
  const normalized = normalizeFunctionType(functionType)

  if (!isSupportedRuntimeCallbackType(normalized)) {
    return
  }

  if (expression != null && expression.type === 'ArrowFunctionExpression') {
    registerArrowCallbackWrapper(expression, normalized, scopes, wrappers, context, deps)
    return
  }

  registerNamedCallbackWrapper(expression, normalized, wrappers, context)
}

function registerPlainCallbackExpression(
  expression: AnyNode | null | undefined,
  functionType: CFunctionType | null | undefined,
  scopes: CallbackScope[],
  wrappers: CallbackWrapperMap,
  context: CallbackEmitContext,
  deps: CallbackLoweringDependencies
): void {
  if (expression != null && expression.type === 'ArrowFunctionExpression') {
    registerPlainArrowCallbackWrapper(expression, normalizeFunctionType(functionType), scopes, wrappers, context, deps)
  }
}

function callbackExpressionHasCaptures(
  expression: AnyNode | null | undefined,
  scopes: CallbackScope[],
  context: CallbackEmitContext,
  deps: CallbackLoweringDependencies
): boolean {
  if (expression == null || expression.type !== 'ArrowFunctionExpression') {
    return false
  }

  return collectArrowCaptures(expression, scopes, context, deps).length > 0
}

function shouldPromotePlainFunctionExpression(
  expression: AnyNode,
  functionType: CFunctionType | null | undefined,
  scopes: CallbackScope[],
  context: CallbackEmitContext,
  deps: CallbackLoweringDependencies
): boolean {
  return (
    isPlainFunctionPointerType(functionType) &&
    isSupportedRuntimeCallbackType(functionType) &&
    callbackExpressionHasCaptures(expression, scopes, context, deps)
  )
}

function registerNamedCallbackWrapper(
  expression: AnyNode | null | undefined,
  functionType: CFunctionType,
  wrappers: CallbackWrapperMap,
  context: CallbackEmitContext
): void {
  if (expression == null || expression.type !== 'Reference') {
    return
  }

  if (expression.path.length !== 1) {
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

  const wrapper: CCallbackWrapper = {
    kind: 'named',
    key: key,
    name: `ccjs_callback_${emitCIdentifier(target)}_${wrappers.size}`,
    target: target,
    functionType: functionType
  }

  wrappers.set(key, wrapper)
}

function registerArrowCallbackWrapper(
  expression: AnyNode,
  functionType: CFunctionType,
  scopes: CallbackScope[],
  wrappers: CallbackWrapperMap,
  context: CallbackEmitContext,
  deps: CallbackLoweringDependencies
): void {
  if (context.callbackArrowWrappers.has(expression)) {
    return
  }

  const index = wrappers.size
  const key = `arrow:${index}`
  const captures = collectArrowCaptures(expression, scopes, context, deps)

  for (let captureIndex = 0; captureIndex < captures.length; captureIndex = captureIndex + 1) {
    const capture = callbackRuntimeArrowCaptureAt(captures, captureIndex)
    const declaration = capture.declaration

    if (
      callbackBooleanValueIsTrue(capture.mutable) &&
      isSupportedRuntimeCallbackParamValueType(capture.valueType) &&
      declaration != null
    ) {
      context.boxedMutableCaptureDeclarations.add(declaration)
    }
  }

  const wrapper: CCallbackWrapper = {
    kind: 'arrow',
    key: key,
    name: `ccjs_callback_arrow_${index}`,
    contextTypeName: `ccjs_callback_context_${index}`,
    finalizerName: `ccjs_callback_context_${index}_finalize`,
    expression: expression,
    functionType: functionType,
    needsEventLoop: functionUsesExternalEventLoop(expression, context.externalEventLoopFunctions),
    captures: captures
  }

  wrappers.set(key, wrapper)
  context.callbackArrowWrappers.set(expression, wrapper)
}

function registerPlainArrowCallbackWrapper(
  expression: AnyNode,
  functionType: CFunctionType,
  scopes: CallbackScope[],
  wrappers: CallbackWrapperMap,
  context: CallbackEmitContext,
  deps: CallbackLoweringDependencies
): void {
  if (context.callbackArrowWrappers.has(expression)) {
    return
  }

  const captures = collectArrowCaptures(expression, scopes, context, deps)

  if (captures.length > 0 && !capturesAreModuleValues(captures, context)) {
    return
  }

  const index = wrappers.size
  const key = `plain-arrow:${index}`
  const wrapper: CCallbackWrapper = {
    kind: 'plain-arrow',
    key: key,
    name: `ccjs_callback_arrow_${index}`,
    expression: expression,
    functionType: functionType
  }

  wrappers.set(key, wrapper)
  context.callbackArrowWrappers.set(expression, wrapper)
}

function capturesAreModuleValues(captures: CRuntimeArrowCapture[], context: CallbackEmitContext): boolean {
  const moduleValueNames = context.moduleValueNames

  if (moduleValueNames == null) {
    return false
  }

  for (let index = 0; index < captures.length; index = index + 1) {
    const capture = callbackRuntimeArrowCaptureAt(captures, index)

    if (!moduleValueNames.has(capture.name)) {
      return false
    }
  }

  return true
}

function declareCallbackBinding(scope: CallbackScope, name: string, info: CallbackScopeBinding): void {
  scope.set(name, info)
}

function declareCallbackParams(scope: CallbackScope, params: CFunctionParam[]): void {
  for (let index = 0; index < params.length; index = index + 1) {
    const param = callbackParamAt(params, index)

    declareCallbackBinding(scope, param.name, {
      name: param.name,
      valueType: param.valueType,
      declaration: param,
      functionType: param.functionType,
      nullable: param.nullable === true,
      shape: param.shape,
      runtimeManaged: isManagedRuntimeCallbackParamValueType(param.valueType),
      mutable: true
    })
  }
}

function lookupCallbackBinding(name: string, scopes: CallbackScope[]): CallbackScopeBinding | null {
  for (let index = scopes.length - 1; index >= 0; index = index - 1) {
    const entry = scopes[index].get(name)

    if (entry != null) {
      return entry
    }
  }

  return null
}

function declareCallbackVariable(
  scope: CallbackScope,
  statement: AnyNode,
  scopes: CallbackScope[],
  context: CallbackEmitContext,
  deps: CallbackLoweringDependencies
): void {
  let valueType = statement.valueType

  if (valueType === 'unknown') {
    valueType = inferCapturedExpressionValueType(statement.init, scopes)
  }

  declareCallbackBinding(scope, statement.name, {
    name: statement.name,
    valueType: valueType,
    functionType: statement.functionType,
    declaration: statement,
    nullable: statement.nullable === true,
    shape: statement.shape,
    runtimeCallback: callbackVariableIsRuntimeCallback(statement, valueType, scopes, context, deps),
    runtimeManaged: isRuntimeManagedCaptureBinding(statement, scopes, valueType),
    mutable: statement.kind === 'let'
  })
}

function callbackVariableIsRuntimeCallback(
  statement: AnyNode,
  valueType: string,
  scopes: CallbackScope[],
  context: CallbackEmitContext,
  deps: CallbackLoweringDependencies
): boolean {
  if (isNullableFunctionType(valueType, statement.nullable)) {
    return true
  }

  if (isRuntimeFunctionType(statement.functionType)) {
    return true
  }

  return shouldPromotePlainFunctionExpression(statement.init, statement.functionType, scopes, context, deps)
}

function isRuntimeManagedCaptureBinding(statement: AnyNode, scopes: CallbackScope[], valueType: string): boolean {
  if (valueType === 'object') {
    return true
  }

  if (valueType !== 'string') {
    return false
  }

  if (statement.init != null && statement.init.type === 'StringLiteral') {
    return false
  }

  if (statement.init != null && statement.init.type === 'TemplateLiteral' && !statement.init.raw.includes('${')) {
    return false
  }

  const initName = callbackReferenceNameOrNull(statement.init)

  if (initName != null) {
    const binding = lookupCallbackBinding(initName, scopes)

    if (binding != null && binding.runtimeManaged === true) {
      return true
    }

    return false
  }

  return true
}

function inferCapturedExpressionValueType(expression: AnyNode | null | undefined, scopes: CallbackScope[]): string {
  if (expression != null && expression.valueType != null && expression.valueType !== 'unknown') {
    return expression.valueType
  }

  if (expression != null && expression.type === 'Reference' && expression.path.length === 1) {
    const binding = lookupCallbackBinding(expression.path[0], scopes)

    if (binding != null) {
      return binding.valueType
    }

    return 'unknown'
  }

  if (expression != null && expression.type === 'MemberExpression') {
    const object = inferCapturedExpressionInfo(expression.object, scopes)
    return objectShapeFieldValueType(object.shape, expression.property)
  }

  if (expression != null && expression.type === 'IndexExpression' && expression.index.type === 'StringLiteral') {
    const object = inferCapturedExpressionInfo(expression.object, scopes)
    return objectShapeFieldValueType(object.shape, expression.index.value)
  }

  return 'unknown'
}

function inferCapturedExpressionInfo(expression: AnyNode | null | undefined, scopes: CallbackScope[]): CallbackScopeBinding {
  if (expression != null && expression.type === 'Reference' && expression.path.length === 1) {
    const entry = lookupCallbackBinding(expression.path[0], scopes)

    if (entry != null) {
      return entry
    }
  }

  return {
    valueType: inferCapturedExpressionValueType(expression, scopes),
    name: '',
    shape: null
  }
}

function objectShapeFieldValueType(shape: CObjectShape | null | undefined, name: string): string {
  if (shape == null) {
    return 'unknown'
  }

  const fields = shape.fields

  if (fields == null) {
    return 'unknown'
  }

  for (let index = 0; index < fields.length; index = index + 1) {
    const field = callbackObjectShapeFieldAt(fields, index)

    if (field.name === name) {
      return field.valueType
    }
  }

  return 'unknown'
}

function visitCallbackStatement(
  statement: AnyNode | null | undefined,
  scopes: CallbackScope[],
  wrappers: CallbackWrapperMap,
  pendingPlainFunctionArgs: PendingPlainFunctionArg[],
  context: CallbackEmitContext,
  deps: CallbackLoweringDependencies
): void {
  if (statement == null) {
    return
  }

  if (statement.type === 'VariableDeclaration') {
    if (isNullableFunctionType(statement.valueType, statement.nullable)) {
      registerRuntimeCallbackExpression(statement.init, statement.functionType, scopes, wrappers, context, deps)
    } else if (shouldPromotePlainFunctionExpression(statement.init, statement.functionType, scopes, context, deps)) {
      registerRuntimeCallbackExpression(statement.init, statement.functionType, scopes, wrappers, context, deps)
    } else {
      registerCallbackExpression(statement.init, statement.functionType, scopes, wrappers, context, deps)
    }

    visitCallbackExpression(statement.init, scopes, wrappers, pendingPlainFunctionArgs, context, deps)
    declareCallbackVariable(scopes[scopes.length - 1], statement, scopes, context, deps)
    return
  }

  if (statement.type === 'ExpressionStatement') {
    visitCallbackExpression(statement.expression, scopes, wrappers, pendingPlainFunctionArgs, context, deps)
    return
  }

  if (statement.type === 'ReturnStatement' || statement.type === 'ThrowStatement') {
    visitCallbackExpression(statement.argument, scopes, wrappers, pendingPlainFunctionArgs, context, deps)
    return
  }

  if (statement.type === 'BlockStatement') {
    const scope: CallbackScope = new Map()
    const blockScopes = appendCallbackScope(scopes, scope)

    for (let index = 0; index < statement.body.length; index = index + 1) {
      const item = callbackNodeAt(statement.body, index)

      visitCallbackStatement(item, blockScopes, wrappers, pendingPlainFunctionArgs, context, deps)
    }
    return
  }

  if (statement.type === 'IfStatement') {
    visitCallbackExpression(statement.condition, scopes, wrappers, pendingPlainFunctionArgs, context, deps)
    visitCallbackStatement(statement.consequent, scopes, wrappers, pendingPlainFunctionArgs, context, deps)
    visitCallbackStatement(statement.alternate, scopes, wrappers, pendingPlainFunctionArgs, context, deps)
    return
  }

  if (statement.type === 'WhileStatement') {
    visitCallbackExpression(statement.condition, scopes, wrappers, pendingPlainFunctionArgs, context, deps)
    visitCallbackStatement(statement.body, scopes, wrappers, pendingPlainFunctionArgs, context, deps)
    return
  }

  if (statement.type === 'ForStatement') {
    const scope: CallbackScope = new Map()
    const loopScopes = appendCallbackScope(scopes, scope)

    if (statement.init != null && statement.init.type === 'VariableDeclaration') {
      visitCallbackStatement(statement.init, loopScopes, wrappers, pendingPlainFunctionArgs, context, deps)
    } else {
      visitCallbackExpression(statement.init, loopScopes, wrappers, pendingPlainFunctionArgs, context, deps)
    }

    visitCallbackExpression(statement.test, loopScopes, wrappers, pendingPlainFunctionArgs, context, deps)
    visitCallbackExpression(statement.update, loopScopes, wrappers, pendingPlainFunctionArgs, context, deps)
    visitCallbackStatement(statement.body, loopScopes, wrappers, pendingPlainFunctionArgs, context, deps)
    return
  }

  if (statement.type === 'ForOfStatement') {
    visitCallbackExpression(statement.iterable, scopes, wrappers, pendingPlainFunctionArgs, context, deps)
    const scope: CallbackScope = new Map()
    declareCallbackBinding(scope, statement.name, {
      name: statement.name,
      valueType: 'unknown',
      mutable: statement.kind === 'let'
    })
    visitCallbackStatement(
      statement.body,
      appendCallbackScope(scopes, scope),
      wrappers,
      pendingPlainFunctionArgs,
      context,
      deps
    )
    return
  }

  if (statement.type === 'SwitchStatement') {
    visitCallbackExpression(statement.discriminant, scopes, wrappers, pendingPlainFunctionArgs, context, deps)

    for (let index = 0; index < statement.cases.length; index = index + 1) {
      const item = callbackNodeAt(statement.cases, index)

      visitCallbackExpression(item.test, scopes, wrappers, pendingPlainFunctionArgs, context, deps)
      const scope: CallbackScope = new Map()
      const caseScopes = appendCallbackScope(scopes, scope)

      for (let consequentIndex = 0; consequentIndex < item.consequent.length; consequentIndex = consequentIndex + 1) {
        const caseStatement = callbackNodeAt(item.consequent, consequentIndex)

        visitCallbackStatement(caseStatement, caseScopes, wrappers, pendingPlainFunctionArgs, context, deps)
      }
    }
    return
  }

  if (statement.type === 'TryStatement') {
    visitCallbackStatement(statement.block, scopes, wrappers, pendingPlainFunctionArgs, context, deps)

    if (statement.handler != null) {
      visitCallbackStatement(statement.handler.body, scopes, wrappers, pendingPlainFunctionArgs, context, deps)
    }

    visitCallbackStatement(statement.finalizer, scopes, wrappers, pendingPlainFunctionArgs, context, deps)
  }
}

function visitCallbackExpression(
  expression: AnyNode | null | undefined,
  scopes: CallbackScope[],
  wrappers: CallbackWrapperMap,
  pendingPlainFunctionArgs: PendingPlainFunctionArg[],
  context: CallbackEmitContext,
  deps: CallbackLoweringDependencies
): void {
  if (expression == null) {
    return
  }

  if (expression.type === 'CallExpression') {
    visitCallbackCallExpression(expression, scopes, wrappers, pendingPlainFunctionArgs, context, deps)
    return
  }

  if (expression.type === 'AssignmentExpression') {
    const targetInfo = callbackAssignmentTargetInfo(expression.target, scopes)

    if (targetInfo != null && isNullableFunctionType(targetInfo.valueType, targetInfo.nullable)) {
      registerRuntimeCallbackExpression(expression.value, targetInfo.functionType, scopes, wrappers, context, deps)
    }

    visitCallbackExpression(expression.target, scopes, wrappers, pendingPlainFunctionArgs, context, deps)
    visitCallbackExpression(expression.value, scopes, wrappers, pendingPlainFunctionArgs, context, deps)
    return
  }

  if (expression.type === 'BinaryExpression') {
    visitCallbackExpression(expression.left, scopes, wrappers, pendingPlainFunctionArgs, context, deps)
    visitCallbackExpression(expression.right, scopes, wrappers, pendingPlainFunctionArgs, context, deps)
    return
  }

  if (
    expression.type === 'UnaryExpression' ||
    expression.type === 'UpdateExpression' ||
    expression.type === 'AwaitExpression'
  ) {
    visitCallbackExpression(expression.argument, scopes, wrappers, pendingPlainFunctionArgs, context, deps)
    return
  }

  if (expression.type === 'MemberExpression' || expression.type === 'OptionalMemberExpression') {
    visitCallbackExpression(expression.object, scopes, wrappers, pendingPlainFunctionArgs, context, deps)
    return
  }

  if (expression.type === 'IndexExpression' || expression.type === 'OptionalIndexExpression') {
    visitCallbackExpression(expression.object, scopes, wrappers, pendingPlainFunctionArgs, context, deps)
    visitCallbackExpression(expression.index, scopes, wrappers, pendingPlainFunctionArgs, context, deps)
    return
  }

  if (expression.type === 'NewExpression' && isPromiseConstructorExpression(expression)) {
    visitPromiseConstructorCallbackExpression(expression, scopes, wrappers, pendingPlainFunctionArgs, context, deps)
    return
  }

  if (expression.type === 'OptionalCallExpression' || expression.type === 'NewExpression') {
    visitCallbackExpression(expression.callee, scopes, wrappers, pendingPlainFunctionArgs, context, deps)

    for (let index = 0; index < expression.args.length; index = index + 1) {
      const arg = callbackNodeAt(expression.args, index)

      visitCallbackExpression(arg, scopes, wrappers, pendingPlainFunctionArgs, context, deps)
    }
    return
  }

  if (expression.type === 'ArrayLiteral') {
    for (let index = 0; index < expression.elements.length; index = index + 1) {
      const element = callbackNodeAt(expression.elements, index)

      visitCallbackExpression(element, scopes, wrappers, pendingPlainFunctionArgs, context, deps)
    }
    return
  }

  if (expression.type === 'ObjectLiteral') {
    for (let index = 0; index < expression.properties.length; index = index + 1) {
      const property = callbackNodeAt(expression.properties, index)

      if (property.value.functionType != null) {
        registerCallbackExpression(property.value, property.value.functionType, scopes, wrappers, context, deps)
      }

      visitCallbackExpression(property.value, scopes, wrappers, pendingPlainFunctionArgs, context, deps)
    }
    return
  }

  if (expression.type === 'ArrowFunctionExpression') {
    visitNestedCallbackArrowExpression(expression, scopes, wrappers, pendingPlainFunctionArgs, context, deps)
  }
}

function visitCallbackCallExpression(
  expression: AnyNode,
  scopes: CallbackScope[],
  wrappers: CallbackWrapperMap,
  pendingPlainFunctionArgs: PendingPlainFunctionArg[],
  context: CallbackEmitContext,
  deps: CallbackLoweringDependencies
): void {
  if (isTimerStartCallExpression(expression)) {
    registerRuntimeCallbackExpression(expression.args[0], timerCallbackFunctionType(), scopes, wrappers, context, deps)
  }

  const params = resolveStaticFunctionParams(expression.callee, context)

  for (let index = 0; index < expression.args.length; index = index + 1) {
    const arg = expression.args[index]
    let param: CFunctionParam | null = null

    if (params != null && index < params.length) {
      param = params[index]
    }

    if (param != null && param.valueType === 'function') {
      visitCallbackFunctionArg(expression, arg, index, param, scopes, wrappers, pendingPlainFunctionArgs, context, deps)
    }

    visitCallbackExpression(arg, scopes, wrappers, pendingPlainFunctionArgs, context, deps)
  }

  visitCallbackExpression(expression.callee, scopes, wrappers, pendingPlainFunctionArgs, context, deps)
}

function visitCallbackFunctionArg(
  expression: AnyNode,
  arg: AnyNode,
  index: number,
  param: CFunctionParam,
  scopes: CallbackScope[],
  wrappers: CallbackWrapperMap,
  pendingPlainFunctionArgs: PendingPlainFunctionArg[],
  context: CallbackEmitContext,
  deps: CallbackLoweringDependencies
): void {
  if (isNullableFunctionType(param.valueType, param.nullable)) {
    registerRuntimeCallbackExpression(arg, param.functionType, scopes, wrappers, context, deps)
    return
  }

  if (isRuntimeFunctionType(param.functionType)) {
    registerRuntimeCallbackExpression(arg, param.functionType, scopes, wrappers, context, deps)
    return
  }

  pendingPlainFunctionArgs.push({
    callee: expression.callee,
    index: index,
    arg: arg,
    functionType: normalizeFunctionType(param.functionType),
    scopes: scopes
  })

  const argInfo = callbackArgumentInfo(arg, scopes)

  if (callbackExpressionHasCaptures(arg, scopes, context, deps) || (argInfo != null && argInfo.runtimeCallback === true)) {
    markRuntimeFunctionParam(expression.callee, index, param.functionType, context)
  }
}

function callbackArgumentInfo(arg: AnyNode, scopes: CallbackScope[]): CallbackScopeBinding | null {
  if (arg.type === 'Reference' && arg.path.length === 1) {
    return lookupCallbackBinding(arg.path[0], scopes)
  }

  return null
}

function callbackAssignmentTargetInfo(target: AnyNode | null | undefined, scopes: CallbackScope[]): CallbackScopeBinding | null {
  if (target != null && target.type === 'Reference' && target.path.length === 1) {
    return lookupCallbackBinding(target.path[0], scopes)
  }

  return null
}

function visitPromiseConstructorCallbackExpression(
  expression: AnyNode,
  scopes: CallbackScope[],
  wrappers: CallbackWrapperMap,
  pendingPlainFunctionArgs: PendingPlainFunctionArg[],
  context: CallbackEmitContext,
  deps: CallbackLoweringDependencies
): void {
  visitCallbackExpression(expression.callee, scopes, wrappers, pendingPlainFunctionArgs, context, deps)

  const executor = expression.args[0]

  if (executor == null || executor.type !== 'ArrowFunctionExpression') {
    for (let index = 0; index < expression.args.length; index = index + 1) {
      const arg = callbackNodeAt(expression.args, index)

      visitCallbackExpression(arg, scopes, wrappers, pendingPlainFunctionArgs, context, deps)
    }
    return
  }

  const scope: CallbackScope = new Map()

  for (let index = 0; index < executor.params.length; index = index + 1) {
    const param = callbackNodeAt(executor.params, index)
    declareCallbackBinding(scope, param.name, {
      name: param.name,
      valueType: 'promise-settlement',
      promiseSettlementKind: promiseSettlementKindForParamIndex(index),
      loc: param.loc,
      mutable: false
    })
  }

  const executorScopes = appendCallbackScope(scopes, scope)

  if (executor.expressionBody) {
    visitCallbackExpression(executor.body, executorScopes, wrappers, pendingPlainFunctionArgs, context, deps)
  } else {
    for (let index = 0; index < executor.body.length; index = index + 1) {
      const statement = callbackNodeAt(executor.body, index)

      visitCallbackStatement(statement, executorScopes, wrappers, pendingPlainFunctionArgs, context, deps)
    }
  }
}

function promiseSettlementKindForParamIndex(index: number): 'reject' | 'resolve' {
  if (index === 1) {
    return 'reject'
  }

  return 'resolve'
}

function visitNestedCallbackArrowExpression(
  expression: AnyNode,
  scopes: CallbackScope[],
  wrappers: CallbackWrapperMap,
  pendingPlainFunctionArgs: PendingPlainFunctionArg[],
  context: CallbackEmitContext,
  deps: CallbackLoweringDependencies
): void {
  const scope: CallbackScope = new Map()

  for (let index = 0; index < expression.params.length; index = index + 1) {
    const param = callbackNodeAt(expression.params, index)

    declareCallbackBinding(scope, param.name, {
      name: param.name,
      valueType: param.valueType,
      declaration: param,
      functionType: param.functionType,
      nullable: param.nullable === true,
      shape: param.shape,
      runtimeManaged: isManagedRuntimeCallbackParamValueType(param.valueType),
      mutable: false
    })
  }

  const arrowScopes = appendCallbackScope(scopes, scope)

  if (expression.expressionBody) {
    visitCallbackExpression(expression.body, arrowScopes, wrappers, pendingPlainFunctionArgs, context, deps)
  } else {
    for (let index = 0; index < expression.body.length; index = index + 1) {
      const statement = callbackNodeAt(expression.body, index)

      visitCallbackStatement(statement, arrowScopes, wrappers, pendingPlainFunctionArgs, context, deps)
    }
  }
}

export function collectArrowCaptures(
  expression: AnyNode,
  outerScopes: CallbackScope[],
  context: CallbackEmitContext,
  deps: CallbackLoweringDependencies
): CRuntimeArrowCapture[] {
  const captures: RuntimeArrowCaptureMap = new Map()
  const localScope: CallbackScope = new Map()
  const localScopes: CallbackScope[] = [localScope]

  for (let index = 0; index < expression.params.length; index = index + 1) {
    const param = callbackNodeAt(expression.params, index)

    declareCallbackBinding(localScope, param.name, {
      name: param.name,
      valueType: param.valueType,
      mutable: true
    })
  }

  const state: RuntimeArrowCaptureScanState = {
    captures: captures,
    context: context,
    deps: deps,
    localScopes: localScopes,
    outerScopes: outerScopes
  }

  if (expression.expressionBody) {
    visitRuntimeArrowCaptureExpression(expression.body, state)
  } else {
    for (let index = 0; index < expression.body.length; index = index + 1) {
      const statement = callbackNodeAt(expression.body, index)

      visitRuntimeArrowCaptureStatement(statement, state)
    }
  }

  const result: CRuntimeArrowCapture[] = []

  for (const capture of captures.values()) {
    result.push(capture)
  }

  return result
}

function addRuntimeArrowCaptureReference(reference: AnyNode, state: RuntimeArrowCaptureScanState): void {
  if (reference.path.length !== 1) {
    return
  }

  const name = reference.path[0]

  if (
    lookupCallbackBinding(name, state.localScopes) != null ||
    state.context.functionNames.has(name) ||
    isCJsGlobalRoot(name, state.context)
  ) {
    return
  }

  const outer = lookupCallbackBinding(name, state.outerScopes)

  if (outer != null && !state.captures.has(name)) {
    state.captures.set(name, runtimeArrowCaptureFromBinding(name, outer))
  }
}

function runtimeArrowCaptureFromBinding(name: string, binding: CallbackScopeBinding): CRuntimeArrowCapture {
  return {
    name: name,
    declaration: binding.declaration,
    functionType: binding.functionType,
    loc: binding.loc,
    mutable: binding.mutable,
    promiseSettlementKind: binding.promiseSettlementKind,
    runtimeManaged: binding.runtimeManaged,
    shape: binding.shape,
    valueType: binding.valueType
  }
}

function declareRuntimeArrowCaptureLocal(statement: AnyNode, state: RuntimeArrowCaptureScanState): void {
  const scope = state.localScopes[state.localScopes.length - 1]

  declareCallbackBinding(scope, statement.name, {
    name: statement.name,
    valueType: statement.valueType,
    functionType: statement.functionType,
    shape: statement.shape,
    mutable: statement.kind === 'let'
  })
}

function visitRuntimeArrowCaptureStatement(
  statement: AnyNode | null | undefined,
  state: RuntimeArrowCaptureScanState
): void {
  if (statement == null) {
    return
  }

  if (statement.type === 'VariableDeclaration') {
    visitRuntimeArrowCaptureExpression(statement.init, state)
    declareRuntimeArrowCaptureLocal(statement, state)
    return
  }

  if (statement.type === 'ExpressionStatement') {
    visitRuntimeArrowCaptureExpression(statement.expression, state)
    return
  }

  if (statement.type === 'ReturnStatement' || statement.type === 'ThrowStatement') {
    visitRuntimeArrowCaptureExpression(statement.argument, state)
    return
  }

  if (statement.type === 'BlockStatement') {
    const scope: CallbackScope = new Map()
    state.localScopes.push(scope)

    for (let index = 0; index < statement.body.length; index = index + 1) {
      const item = callbackNodeAt(statement.body, index)

      visitRuntimeArrowCaptureStatement(item, state)
    }

    state.localScopes.pop()
    return
  }

  if (statement.type === 'IfStatement') {
    visitRuntimeArrowCaptureExpression(statement.condition, state)
    visitRuntimeArrowCaptureStatement(statement.consequent, state)
    visitRuntimeArrowCaptureStatement(statement.alternate, state)
    return
  }

  if (statement.type === 'WhileStatement') {
    visitRuntimeArrowCaptureExpression(statement.condition, state)
    visitRuntimeArrowCaptureStatement(statement.body, state)
    return
  }

  if (statement.type === 'ForStatement') {
    const scope: CallbackScope = new Map()
    state.localScopes.push(scope)

    if (statement.init != null && statement.init.type === 'VariableDeclaration') {
      visitRuntimeArrowCaptureStatement(statement.init, state)
    } else {
      visitRuntimeArrowCaptureExpression(statement.init, state)
    }

    visitRuntimeArrowCaptureExpression(statement.test, state)
    visitRuntimeArrowCaptureExpression(statement.update, state)
    visitRuntimeArrowCaptureStatement(statement.body, state)
    state.localScopes.pop()
    return
  }

  if (statement.type === 'ForOfStatement') {
    visitRuntimeArrowCaptureExpression(statement.iterable, state)

    const scope: CallbackScope = new Map()
    declareCallbackBinding(scope, statement.name, {
      name: statement.name,
      valueType: 'unknown',
      mutable: statement.kind === 'let'
    })

    state.localScopes.push(scope)
    visitRuntimeArrowCaptureStatement(statement.body, state)
    state.localScopes.pop()
    return
  }

  if (statement.type === 'SwitchStatement') {
    visitRuntimeArrowCaptureExpression(statement.discriminant, state)

    for (let index = 0; index < statement.cases.length; index = index + 1) {
      const item = callbackNodeAt(statement.cases, index)

      visitRuntimeArrowCaptureExpression(item.test, state)
      const scope: CallbackScope = new Map()
      state.localScopes.push(scope)

      for (let consequentIndex = 0; consequentIndex < item.consequent.length; consequentIndex = consequentIndex + 1) {
        const consequent = callbackNodeAt(item.consequent, consequentIndex)

        visitRuntimeArrowCaptureStatement(consequent, state)
      }

      state.localScopes.pop()
    }
    return
  }

  if (statement.type === 'TryStatement') {
    visitRuntimeArrowCaptureStatement(statement.block, state)

    if (statement.handler != null) {
      const catchScope: CallbackScope = new Map()

      if (statement.handler.param != null) {
        declareCallbackBinding(catchScope, statement.handler.param, {
          name: statement.handler.param,
          valueType: 'string',
          mutable: true
        })
      }

      state.localScopes.push(catchScope)
      visitRuntimeArrowCaptureStatement(statement.handler.body, state)
      state.localScopes.pop()
    }

    visitRuntimeArrowCaptureStatement(statement.finalizer, state)
  }
}

function visitRuntimeArrowCaptureExpression(
  node: AnyNode | null | undefined,
  state: RuntimeArrowCaptureScanState
): void {
  if (node == null) {
    return
  }

  if (node.type === 'TemplateLiteral') {
    const placeholders = state.deps.collectTemplatePlaceholderExpressions(node)

    for (let index = 0; index < placeholders.length; index = index + 1) {
      const expression = callbackNodeAt(placeholders, index)

      visitRuntimeArrowCaptureExpression(expression, state)
    }

    return
  }

  if (node.type === 'Reference') {
    addRuntimeArrowCaptureReference(node, state)
    return
  }

  if (node.type === 'MemberExpression' || node.type === 'OptionalMemberExpression') {
    visitRuntimeArrowCaptureExpression(node.object, state)
    return
  }

  if (node.type === 'IndexExpression' || node.type === 'OptionalIndexExpression') {
    visitRuntimeArrowCaptureExpression(node.object, state)
    visitRuntimeArrowCaptureExpression(node.index, state)
    return
  }

  if (node.type === 'CallExpression' || node.type === 'OptionalCallExpression' || node.type === 'NewExpression') {
    visitRuntimeArrowCaptureExpression(node.callee, state)

    for (let index = 0; index < node.args.length; index = index + 1) {
      const arg = callbackNodeAt(node.args, index)

      visitRuntimeArrowCaptureExpression(arg, state)
    }

    return
  }

  if (node.type === 'AssignmentExpression') {
    visitRuntimeArrowCaptureExpression(node.target, state)
    visitRuntimeArrowCaptureExpression(node.value, state)
    return
  }

  if (node.type === 'BinaryExpression') {
    visitRuntimeArrowCaptureExpression(node.left, state)
    visitRuntimeArrowCaptureExpression(node.right, state)
    return
  }

  if (node.type === 'UnaryExpression' || node.type === 'UpdateExpression' || node.type === 'AwaitExpression') {
    visitRuntimeArrowCaptureExpression(node.argument, state)
    return
  }

  if (node.type === 'ArrayLiteral') {
    for (let index = 0; index < node.elements.length; index = index + 1) {
      const element = callbackNodeAt(node.elements, index)

      visitRuntimeArrowCaptureExpression(element, state)
    }

    return
  }

  if (node.type === 'ObjectLiteral') {
    for (let index = 0; index < node.properties.length; index = index + 1) {
      const property = callbackNodeAt(node.properties, index)

      visitRuntimeArrowCaptureExpression(property.value, state)
    }
  }
}

function resolveStaticFunctionParams(callee: AnyNode | null | undefined, context: CallbackEmitContext): CFunctionParam[] | null {
  if (callee == null || callee.type !== 'Reference' || callee.path.length !== 1) {
    return null
  }

  const params = context.functionParams.get(callee.path[0])

  if (params != null) {
    return params
  }

  return null
}

function runtimeCallbackWrapperKey(target: string, functionType: CFunctionType): string {
  const paramTypes: string[] = []

  for (let index = 0; index < functionType.params.length; index = index + 1) {
    const param = callbackParamAt(functionType.params, index)

    paramTypes.push(param.valueType)
  }

  return `${target}:${functionType.returnType}(${joinStrings(paramTypes, ',')})`
}

export function runtimeCallbackWrapperFor(
  target: string,
  functionType: CFunctionType,
  context: CallbackEmitContext
): CCallbackWrapper | null {
  const wrapper = context.callbackWrappers.get(runtimeCallbackWrapperKey(target, functionType))

  if (wrapper != null) {
    return wrapper
  }

  return null
}

export function emitRuntimeCallbackWrapperHead(wrapper: CRuntimeCallbackWrapper): string {
  return `static ccjs_status ${wrapper.name}(void* context, const ccjs_value* args, size_t arg_count, ccjs_value* out)`
}

export function isRuntimeCallbackWrapper(wrapper: CCallbackWrapper): boolean {
  return wrapper.kind !== 'plain-arrow'
}

export function emitPlainArrowCallbackWrapperHead(wrapper: CPlainArrowCallbackWrapper): string {
  return `static ${emitFunctionPointerReturnType(wrapper.functionType)} ${wrapper.name}(${emitPlainArrowCallbackParams(wrapper)})`
}

function emitPlainArrowCallbackParams(wrapper: CPlainArrowCallbackWrapper): string {
  const params = wrapper.functionType.params

  if (params.length === 0) {
    return 'void'
  }

  const emitted: string[] = []
  let index = 0

  for (let paramIndex = 0; paramIndex < params.length; paramIndex = paramIndex + 1) {
    const param = callbackParamAt(params, paramIndex)

    emitted.push(`${emitCType(param.valueType)} ${plainArrowCallbackParamName(wrapper, index)}`)
    index = index + 1
  }

  return joinStrings(emitted, ', ')
}

export function emitPlainArrowCallbackWrapperDeclaration(
  wrapper: CPlainArrowCallbackWrapper,
  baseContext: CallbackEmitContext,
  deps: CallbackLoweringDependencies
): string[] {
  const returnType = wrapper.functionType.returnType
  const params = wrapper.functionType.params

  const context = deps.createFunctionContext(baseContext, returnType, false)
  context.cleanupEnabled = false

  for (let index = 0; index < params.length; index = index + 1) {
    const param = callbackParamAt(params, index)

    context.variables.set(plainArrowCallbackParamName(wrapper, index), param.valueType)
  }

  let statements: AnyNode[] = wrapper.expression.body

  if (wrapper.expression.expressionBody) {
    statements = [
      {
        type: 'ReturnStatement',
        argument: wrapper.expression.body,
        loc: wrapper.expression.loc
      }
    ]
  }

  const statementLines = deps.emitStatementList(statements, context)
  const lines: string[] = [`${emitPlainArrowCallbackWrapperHead(wrapper)} {`]

  pushIndentedLines(lines, deps.emitReturnValueDeclarations(context))
  pushIndentedLines(lines, deps.emitReturnFlowDeclarations(context))
  pushIndentedLines(lines, deps.emitOwnedValueDeclarations(context))
  pushIndentedLines(lines, deps.emitBoxedValueDeclarations(context))
  pushIndentedLines(lines, statementLines)

  if (deps.shouldEmitCleanupLabel(context)) {
    lines.push('ccjs_cleanup:')
    pushIndentedLines(lines, deps.emitOwnedValueCleanup(context))
    pushIndentedLines(lines, deps.emitBoxedValueCleanup(context))
    lines.push(`  ${deps.emitCleanupReturn(context)}`)
  }

  lines.push('}')

  return lines
}

function plainArrowCallbackParamName(wrapper: CPlainArrowCallbackWrapper, index: number): string {
  const param = wrapper.expression.params[index] ?? null

  if (param != null) {
    return param.name
  }

  return `ccjs_arg_${index}`
}

function pushLines(target: string[], lines: string[]): void {
  for (const line of lines) {
    target.push(line)
  }
}

function pushIndentedLines(target: string[], lines: string[]): void {
  for (const line of lines) {
    target.push(`  ${line}`)
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

function emitIndentedRuntimeArgCountCheck(paramCount: number): string {
  let argsCheck = ''

  if (paramCount !== 0) {
    argsCheck = ' || args == 0'
  }

  return `  if (out == 0 || arg_count != ${paramCount}${argsCheck}) return CCJS_ERR_TYPE;`
}

export function emitRuntimeCallbackWrapperDeclaration(
  wrapper: CRuntimeCallbackWrapper,
  context: CallbackEmitContext,
  deps: CallbackLoweringDependencies
): string[] {
  if (wrapper.kind === 'arrow') {
    return emitRuntimeArrowCallbackWrapperDeclaration(wrapper, context, deps)
  }

  const targetTakesEventLoop = functionTakesEventLoopParam(wrapper.target, context)
  const lines: string[] = [`${emitRuntimeCallbackWrapperHead(wrapper)} {`]

  if (targetTakesEventLoop) {
    lines.push('  if (context == 0) return CCJS_ERR_TYPE;')
  } else {
    lines.push('  (void)context;')
  }

  lines.push(emitIndentedRuntimeArgCountCheck(wrapper.functionType.params.length))
  lines.push('  *out = ccjs_undefined_value();')
  const args: string[] = []
  let index = 0

  for (const param of wrapper.functionType.params) {
    pushIndentedLines(lines, emitRuntimeCallbackWrapperArgChecks(param, index))
    args.push(emitRuntimeCallbackWrapperArg(param, index))
    index = index + 1
  }

  const callArgs: string[] = []

  if (targetTakesEventLoop) {
    callArgs.push('(ccjs_loop*)context')
  }

  for (const arg of args) {
    callArgs.push(arg)
  }

  let functionName = context.functionNames.get(wrapper.target)

  if (functionName == null) {
    functionName = emitCFunctionName(wrapper.target)
  }

  const call = `${functionName}(${joinStrings(callArgs, ', ')})`

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

export function isRuntimeArrowCallbackWrapperWithContext(
  wrapper: CCallbackWrapper | null | undefined
): boolean {
  return wrapper != null && wrapper.kind === 'arrow' && hasRuntimeArrowCallbackContext(wrapper)
}

export function isPromiseChainCallbackWrapperWithContext(
  wrapper: CPromiseChainWrapper | null | undefined
): boolean {
  return wrapper != null && wrapper.kind === 'promise-chain-arrow' && hasRuntimeArrowCallbackContext(wrapper)
}

export function hasRuntimeArrowCallbackContext(wrapper: CCallbackContextWrapper): boolean {
  return wrapper.captures.length > 0 || wrapper.needsEventLoop === true
}

export function emitRuntimeArrowCallbackContextType(wrapper: CCallbackContextWrapper): string[] {
  const lines: string[] = [`typedef struct ${wrapper.contextTypeName} {`]

  if (wrapper.needsEventLoop === true) {
    lines.push('  ccjs_loop* ccjs_loop;')
  }

  for (const capture of wrapper.captures) {
    lines.push(`  ${emitRuntimeArrowCaptureCType(capture)} ${emitRuntimeArrowCaptureField(capture)};`)
  }

  lines.push(`} ${wrapper.contextTypeName};`)

  return lines
}

export function emitRuntimeArrowCallbackContextFinalizerDeclaration(wrapper: CCallbackContextWrapper): string[] {
  const lines = [
    `static void ${wrapper.finalizerName}(void* context) {`,
    '  if (context == 0) return;',
    `  ${wrapper.contextTypeName}* captured = (${wrapper.contextTypeName}*)context;`
  ]

  for (const capture of wrapper.captures) {
    if (isRetainedRuntimeArrowCapture(capture)) {
      lines.push(`  ccjs_release(captured->${emitRuntimeArrowCaptureField(capture)});`)
    }
  }

  for (const capture of wrapper.captures) {
    if (isPromiseSettlementRuntimeArrowCapture(capture)) {
      lines.push(`  if (captured->${emitRuntimeArrowCaptureField(capture)} != 0) {`)
      lines.push(`    ccjs_promise_release(captured->${emitRuntimeArrowCaptureField(capture)});`)
      lines.push('  }')
    }
  }

  lines.push(
    `  ccjs_default_free(0, context, sizeof(${wrapper.contextTypeName}), _Alignof(${wrapper.contextTypeName}));`
  )
  lines.push('}')

  return lines
}

function emitRuntimeArrowCallbackWrapperDeclaration(
  wrapper: CRuntimeArrowCallbackWrapper,
  baseContext: CallbackEmitContext,
  deps: CallbackLoweringDependencies
): string[] {
  const lines: string[] = []

  if (isRuntimeArrowCallbackWrapperWithContext(wrapper)) {
    pushLines(lines, emitRuntimeArrowCallbackContextFinalizerDeclaration(wrapper))
    lines.push('')
  }

  const context = deps.createFunctionContext(baseContext, 'void', false)
  context.cleanupEnabled = false
  context.statusReturn = true
  context.runtimeCallbackReturnType = wrapper.functionType.returnType
  if (wrapper.functionType.returnShape != null) {
    context.runtimeCallbackReturnShape = wrapper.functionType.returnShape
  } else {
    context.runtimeCallbackReturnShape = null
  }
  context.runtimeCallbackReturnOut = '(*out)'
  context.runtimeCallbackCleanupLabel = 'ccjs_callback_cleanup'
  const bodyLines: string[] = []

  pushLines(bodyLines, emitRuntimeArrowCallbackContextLocals(wrapper, context, deps))
  pushLines(bodyLines, emitRuntimeArrowCallbackParamPrelude(wrapper, context, deps))
  const statementLines = emitRuntimeArrowCallbackStatementLines(wrapper, context, deps)

  lines.push(`${emitRuntimeCallbackWrapperHead(wrapper)} {`)

  if (isRuntimeArrowCallbackWrapperWithContext(wrapper)) {
    lines.push('  if (context == 0) return CCJS_ERR_TYPE;')
  } else {
    lines.push('  (void)context;')
  }

  lines.push(emitIndentedRuntimeArgCountCheck(wrapper.functionType.params.length))
  lines.push('  *out = ccjs_undefined_value();')
  pushIndentedLines(lines, bodyLines)
  pushIndentedLines(lines, deps.emitLoopFlowDeclarations(context))
  pushIndentedLines(lines, deps.emitReturnFlowDeclarations(context))
  pushIndentedLines(lines, deps.emitOwnedValueDeclarations(context))
  pushIndentedLines(lines, deps.emitErrorChannelDeclarations(context))
  pushIndentedLines(lines, deps.emitBoxedValueDeclarations(context))
  pushIndentedLines(lines, statementLines)
  if (context.usedRuntimeCallbackCleanupGoto === true) {
    lines.push(`${context.runtimeCallbackCleanupLabel}:`)
  }
  pushIndentedLines(lines, deps.emitOwnedValueCleanup(context))
  pushIndentedLines(lines, deps.emitBoxedValueCleanup(context))
  lines.push('  return CCJS_OK;')
  lines.push('}')

  return lines
}

function emitRuntimeArrowCallbackStatementLines(
  wrapper: CRuntimeArrowCallbackWrapper,
  context: CallbackFunctionContext,
  deps: CallbackLoweringDependencies
): string[] {
  if (wrapper.functionType.returnType === 'number' || wrapper.functionType.returnType === 'boolean') {
    if (!wrapper.expression.expressionBody) {
      return deps.emitStatementList(wrapper.expression.body, context)
    }

    const value = deps.emitPreparedNumberExpression(wrapper.expression.body, context)
    let expression = `ccjs_bool_value((${value.expression}) != 0)`

    if (wrapper.functionType.returnType === 'number') {
      expression = `ccjs_number_value(${value.expression})`
    }

    const lines: string[] = []
    pushLines(lines, value.lines)
    lines.push(`*out = ${expression};`)

    return lines
  }

  if (isManagedRuntimeReturnType(wrapper.functionType.returnType)) {
    if (!wrapper.expression.expressionBody) {
      return deps.emitStatementList(wrapper.expression.body, context)
    }

    return deps.emitRuntimeCallbackRuntimeValueReturnLines(wrapper.expression.body, context)
  }

  let statements: AnyNode[] = wrapper.expression.body

  if (wrapper.expression.expressionBody) {
    statements = [
      {
        type: 'ExpressionStatement',
        expression: wrapper.expression.body
      }
    ]
  }

  return deps.emitStatementList(statements, context)
}

export function emitRuntimeArrowCallbackContextLocals(
  wrapper: CCallbackContextWrapper,
  context: CallbackFunctionContext,
  deps: CallbackLoweringDependencies
): string[] {
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
      let kind: 'reject' | 'resolve' = 'resolve'

      if (capture.promiseSettlementKind != null) {
        kind = capture.promiseSettlementKind
      }

      context.promiseConstructorHandlers.set(capture.name, {
        kind: kind,
        promise
      })
      lines.push(`ccjs_promise* ${promise} = captured->${emitRuntimeArrowCaptureField(capture)};`)
      continue
    }

    context.variables.set(capture.name, capture.valueType)

    if (isSupportedMutableRuntimeArrowCapture(capture, context)) {
      context.boxedVariables.add(capture.name)

      if (capture.valueType === 'object') {
        deps.registerObjectShape(context, capture.name, capture.shape)
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
        deps.registerObjectShape(context, capture.name, capture.shape)
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

function emitRuntimeArrowCallbackParamPrelude(
  wrapper: CRuntimeArrowCallbackWrapper,
  context: CallbackFunctionContext,
  deps: CallbackLoweringDependencies
): string[] {
  const lines: string[] = []
  let index = 0

  for (const param of wrapper.functionType.params) {
    const name = runtimeArrowCallbackParamName(wrapper, index)

    pushLines(lines, emitRuntimeCallbackWrapperArgChecks(param, index))
    context.variables.set(name, param.valueType)

    if (param.valueType === 'string') {
      context.runtimeStrings.add(name)
      lines.push(`ccjs_string* ${name} = (ccjs_string*)args[${index}].as.ref;`)
      continue
    }

    if (param.valueType === 'object') {
      deps.registerObjectShape(context, name, param.shape)
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

    index = index + 1
  }

  return lines
}

function runtimeArrowCallbackParamName(wrapper: CRuntimeArrowCallbackWrapper, index: number): string {
  const param = wrapper.expression.params[index] ?? null

  if (param != null) {
    return param.name
  }

  return `ccjs_arg_${index}`
}

export function emitRuntimeArrowCaptureCType(capture: CRuntimeArrowCapture): string {
  if (capture.mutable) {
    if (isPlainCallbackParamValueType(capture.valueType)) {
      return 'double*'
    }

    if (isManagedRuntimeCallbackParamValueType(capture.valueType)) {
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

export function emitRuntimeArrowCaptureField(capture: CRuntimeArrowCapture): string {
  return emitCIdentifier(capture.name)
}

export function isRetainedRuntimeArrowCapture(capture: CRuntimeArrowCapture): boolean {
  return (
    capture.runtimeManaged === true &&
    isManagedRuntimeCallbackParamValueType(capture.valueType) &&
    !capture.mutable
  )
}

export function isPromiseSettlementRuntimeArrowCapture(capture: CRuntimeArrowCapture): boolean {
  return capture.valueType === 'promise-settlement'
}

export function isSupportedMutableRuntimeArrowCapture(
  capture: CRuntimeArrowCapture,
  context: CallbackFunctionContext
): boolean {
  if (capture.mutable !== true) {
    return false
  }

  if (!isSupportedRuntimeCallbackParamValueType(capture.valueType)) {
    return false
  }

  const declaration = capture.declaration

  if (declaration == null) {
    return false
  }

  return context.boxedMutableCaptureDeclarations.has(declaration)
}

function emitRuntimeCallbackWrapperArgChecks(param: CFunctionParam, index: number): string[] {
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

function emitRuntimeCallbackWrapperArg(param: CFunctionParam, index: number): string {
  if (param.valueType === 'number') {
    return `args[${index}].as.number`
  }

  if (param.valueType === 'boolean') {
    return `(args[${index}].as.boolean ? 1 : 0)`
  }

  return `args[${index}]`
}

export function emitFunctionPointerReturnType(functionType: CFunctionType | null | undefined): string {
  if (functionType != null) {
    return emitCType(functionType.returnType)
  }

  return emitCType('void')
}

export function emitFunctionPointerParams(functionType: CFunctionType | null | undefined): string {
  if (functionType == null || functionType.params.length === 0) {
    return 'void'
  }

  const params: string[] = []

  for (const param of functionType.params) {
    params.push(emitCType(param.valueType))
    appendObjectShapeFunctionPointerParamTypes(params, param.shape, [])
  }

  return joinStrings(params, ', ')
}

function appendObjectShapeFunctionPointerParamTypes(
  params: string[],
  shape: CObjectShape | null | undefined,
  seen: CObjectShape[]
): void {
  if (shape == null || shape.fields == null) {
    return
  }

  for (const item of seen) {
    if (item === shape) {
      return
    }
  }

  seen.push(shape)

  for (const field of shape.fields) {
    if (field.valueType === 'function') {
      params.push(emitFunctionPointerParamType(field.functionType))
    } else if (field.valueType === 'object') {
      appendObjectShapeFunctionPointerParamTypes(params, field.shape, seen)
    }
  }

  seen.pop()
}

function emitFunctionPointerParamType(functionType: CFunctionType | null | undefined): string {
  if (isRuntimeFunctionType(functionType)) {
    return 'ccjs_value'
  }

  return `${emitFunctionPointerReturnType(functionType)} (*)(${emitFunctionPointerParams(functionType)})`
}
