import type {
  CPreparedCallOptions as PreparedCallOptions,
  CPreparedExpression as PreparedExpression,
  CCallbackContextWrapper,
  CCallbackWrapper,
  CFunctionParam,
  CFunctionType,
  CObjectShape,
  CObjectShapeField,
  CPromiseConstructorHandler,
  CPromiseChainWrapper,
  CRuntimeArrowCapture
} from '../types.ts'
import type { AnyNode, Diagnostic, IrProgram, SourceLocation } from '../../types.ts'
import type { CallbackLoweringDependencies, CallbackScope, CallbackScopeBinding } from './callbacks.ts'

type PromiseNode = AnyNode
type PromiseAnyNodeWrapperMap = Map<AnyNode, CPromiseChainWrapper>
type PromiseBooleanMap = Map<string, boolean>
type PromiseCallbackArrowWrapperMap = Map<AnyNode, CCallbackWrapper>
type PromiseCallbackWrapperMap = Map<string, CCallbackWrapper>
type PromiseConstructorHandlerMap = Map<string, CPromiseConstructorHandler>
type PromiseFunctionParamMap = Map<string, CFunctionParam[]>
type PromiseFunctionTypeMap = Map<string, CFunctionType>
type PromiseMutableDeclarationSet = Set<AnyNode | null | undefined>
type PromiseObjectShapeMap = Map<string, CObjectShapeField[]>
type PromiseStringMap = Map<string, string>
type PromiseStringNullableMap = Map<string, string | null>
type PromiseStringSet = Set<string>

type PromiseConstructorHandlerSnapshot = {
  name: string
  previous: CPromiseConstructorHandler | null
}

type PromiseEmitContext = {
  boxedMutableCaptureDeclarations: PromiseMutableDeclarationSet
  callbackArrowWrappers: PromiseCallbackArrowWrapperMap
  callbackWrappers: PromiseCallbackWrapperMap
  diagnostics: Diagnostic[]
  externalEventLoopFunctions: PromiseStringSet
  functionAsyncFlags: PromiseBooleanMap
  functionNames: PromiseStringMap
  functionParams: PromiseFunctionParamMap
  functionReturnPromiseValueTypes: PromiseStringNullableMap
  functionReturnTypes: PromiseStringMap
  jsGlobalRoots: PromiseStringSet
  promiseChainArrowWrappers: PromiseAnyNodeWrapperMap
  runtimeFunctionParams: PromiseFunctionTypeMap
}

type PromiseFunctionContext = PromiseEmitContext & {
  boxedVariables: PromiseStringSet
  cleanupEnabled: boolean
  eventLoopUsed: boolean
  externalEventLoop: boolean
  failureStatement?: string | null
  failureStatementUsed?: boolean
  nextId: number
  objectShapes: PromiseObjectShapeMap
  ownedPromises: string[]
  promiseConstructorHandlers: PromiseConstructorHandlerMap
  promiseRejectionValueTypes: PromiseStringMap
  promiseValueTypes: PromiseStringMap
  returnType?: string
  runtimeCallbackCleanupLabel?: string
  runtimeCallbackReturnOut?: string
  runtimeCallbackReturnShape?: CObjectShape | null
  runtimeCallbackReturnType?: string
  runtimeStrings: PromiseStringSet
  statusReturn: boolean
  throwingFunction: boolean
  usedCleanupGoto: boolean
  usedRuntimeCallbackCleanupGoto?: boolean
  variables: PromiseStringMap
}

function promiseBooleanValueIsTrue(value: boolean | null | undefined): boolean {
  if (value == null) {
    return false
  }

  if (value) {
    return true
  }

  return false
}

export function cPromiseRuntimeCallName(callee: AnyNode | null | undefined): string | null {
  if (callee == null) {
    return null
  }

  if (callee.type !== 'MemberExpression') {
    return null
  }

  if (promiseMemberObjectReferenceName(callee) !== 'Promise') {
    return null
  }

  if (callee.property === 'resolve') {
    return 'resolve'
  }

  if (callee.property === 'reject') {
    return 'reject'
  }

  return null
}

export function isPromiseConstructorExpression(expression: AnyNode | null | undefined): boolean {
  if (expression == null || expression.type !== 'NewExpression') {
    return false
  }

  return promiseReferenceName(expression.callee) === 'Promise'
}

export function isPromiseMethodAst(expression: AnyNode | null | undefined): boolean {
  if (expression == null || expression.type !== 'CallExpression') {
    return false
  }

  if (expression.callee == null || expression.callee.type !== 'MemberExpression') {
    return false
  }

  return expression.callee.property === 'catch' || expression.callee.property === 'then'
}

type PromiseEventLoopFunctionContext = {
  externalEventLoopFunctions: Set<string>
  functionAsyncFlags: Map<string, boolean>
  functionReturnTypes: Map<string, string>
}

export function isPlainPromiseReturningFunctionName(name: string, context: PromiseEventLoopFunctionContext): boolean {
  return context.functionReturnTypes.get(name) === 'promise' && !promiseBooleanValueIsTrue(context.functionAsyncFlags.get(name))
}

export function functionTakesEventLoopParam(name: string, context: PromiseEventLoopFunctionContext): boolean {
  return isPlainPromiseReturningFunctionName(name, context) || context.externalEventLoopFunctions.has(name)
}

export function isPromiseReturningFunctionCallee(callee: AnyNode | null | undefined, context: PromiseEventLoopFunctionContext): boolean {
  const name = promiseReferenceName(callee)

  return name != null && isPlainPromiseReturningFunctionName(name, context)
}

export function isExternalEventLoopFunctionCallee(callee: AnyNode | null | undefined, context: PromiseEventLoopFunctionContext): boolean {
  const name = promiseReferenceName(callee)

  return name != null && context.externalEventLoopFunctions.has(name)
}

export function resolvePromiseReturningFunctionValueType(callee: AnyNode | null | undefined, context: PromiseEmitContext): string {
  const name = promiseReferenceName(callee)

  if (name == null) {
    return 'unknown'
  }

  if (!isPlainPromiseReturningFunctionName(name, context)) {
    return 'unknown'
  }

  const valueType = context.functionReturnPromiseValueTypes.get(name)

  if (valueType != null) {
    return valueType
  }

  return 'unknown'
}

export function resolvePromiseExpressionValueType(
  expression: AnyNode | null | undefined,
  context: PromiseFunctionContext
): string | null {
  if (expression == null) {
    return null
  }

  const directType = knownValueType(expression.promiseValueType)

  if (directType != null) {
    return directType
  }

  if (expression.type === 'CallExpression') {
    if (isPromiseReturningFunctionCallee(expression.callee, context)) {
      return knownValueType(resolvePromiseReturningFunctionValueType(expression.callee, context))
    }

    if (isAsyncFunctionCallee(expression.callee, context)) {
      return knownValueType(resolveCAsyncFunctionAwaitValueType(expression.callee, context))
    }
  }

  const expressionName = promiseReferenceName(expression)

  if (expressionName != null) {
    return knownValueType(context.promiseValueTypes.get(expressionName))
  }

  return null
}

export function knownValueType(valueType: string | null | undefined): string | null {
  if (valueType == null || valueType === 'unknown') {
    return null
  }

  return valueType
}

function optionalString(value: string | null | undefined): string {
  if (value == null) {
    return ''
  }

  return value
}

function optionalBoolean(value: boolean | null | undefined): boolean {
  return promiseBooleanValueIsTrue(value)
}

export function isAsyncFunctionCallee(callee: AnyNode | null | undefined, context: PromiseEmitContext): boolean {
  const name = promiseReferenceName(callee)

  return name != null && promiseBooleanValueIsTrue(context.functionAsyncFlags.get(name))
}

export function resolveCAsyncFunctionAwaitValueType(
  callee: AnyNode | null | undefined,
  context: PromiseEmitContext
): string | null {
  const name = promiseReferenceName(callee)

  if (name == null) {
    return null
  }

  if (!promiseBooleanValueIsTrue(context.functionAsyncFlags.get(name))) {
    return null
  }

  const valueType = context.functionReturnPromiseValueTypes.get(name)

  if (valueType != null) {
    return valueType
  }

  return 'unknown'
}


import { collectIrTopLevelNodeEntries } from '../../ir.ts'
import { diagnostic } from '../../diagnostics.ts'
import {
  emitEventLoopReference,
  emitFailureStatement,
  emitPrepareOwnedValueWrite,
  emitRuntimeTypeCheck,
  emitStatusCheck,
  nextCName,
  registerEventLoop,
  registerOwnedPromise
} from '../context.ts'
import { isManagedRuntimeReturnType } from '../value-types.ts'


export type PromiseChainLoweringDependencies = {
  callbackLoweringDependencies: CallbackLoweringDependencies
  collectArrowCaptures(
    expression: AnyNode,
    outerScopes: CallbackScope[],
    context: PromiseEmitContext,
    deps: CallbackLoweringDependencies
  ): CRuntimeArrowCapture[]
  createFunctionContext(
    baseContext: PromiseEmitContext,
    returnType: string,
    returnNullable: boolean
  ): PromiseFunctionContext
  emitBoxedValueCleanup(context: PromiseFunctionContext): string[]
  emitBoxedValueDeclarations(context: PromiseFunctionContext): string[]
  emitErrorChannelDeclarations(context: PromiseFunctionContext): string[]
  emitLoopFlowDeclarations(context: PromiseFunctionContext): string[]
  emitOwnedValueCleanup(context: PromiseFunctionContext): string[]
  emitOwnedValueDeclarations(context: PromiseFunctionContext): string[]
  emitPreparedNumberExpression(expression: AnyNode, context: PromiseFunctionContext): PreparedExpression
  emitReturnFlowDeclarations(context: PromiseFunctionContext): string[]
  emitRuntimeArrowCallbackContextFinalizerDeclaration(wrapper: CCallbackContextWrapper): string[]
  emitRuntimeArrowCallbackContextLocals(
    wrapper: CCallbackContextWrapper,
    context: PromiseFunctionContext,
    deps: CallbackLoweringDependencies,
    contextParameterName?: string
  ): string[]
  emitRuntimeCallbackRuntimeValueReturnLines(argument: AnyNode, context: PromiseFunctionContext): string[]
  emitStatementList(statements: AnyNode[], context: PromiseFunctionContext): string[]
  functionUsesExternalEventLoop(node: AnyNode, externalNames: Set<string>): boolean
  isPromiseChainCallbackWrapperWithContext(
    wrapper: CPromiseChainWrapper | null | undefined
  ): boolean
}

export type PromiseLoweringDependencies = {
  emitCValueExpression(expression: AnyNode, context: PromiseFunctionContext): PreparedExpression
  emitPreparedAsyncFunctionPromiseCallExpression(
    expression: AnyNode | null | undefined,
    context: PromiseFunctionContext,
    options?: PreparedCallOptions
  ): PreparedExpression | null
  emitPreparedCallExpression(expression: AnyNode, context: PromiseFunctionContext): PreparedExpression
  emitPreparedFetchCallExpression(
    expression: AnyNode | null | undefined,
    context: PromiseFunctionContext,
    options?: PreparedCallOptions
  ): PreparedExpression | null
  emitPreparedFsCallExpression(
    expression: AnyNode | null | undefined,
    context: PromiseFunctionContext,
    options?: PreparedCallOptions
  ): PreparedExpression | null
  emitRuntimeArrowCaptureStoreLines(
    capture: CRuntimeArrowCapture,
    contextName: string,
    context: PromiseFunctionContext
  ): string[]
  emitStatementList(statements: AnyNode[], context: PromiseFunctionContext): string[]
  inferExpressionType(expression: AnyNode, context: PromiseFunctionContext): string
  inferRejectedValueType(expression: AnyNode, context: PromiseFunctionContext): string
  isPromiseChainCallbackWrapperWithContext(
    wrapper: CPromiseChainWrapper | null | undefined
  ): boolean
}

type PromiseChainArrowBody = {
  kind: string
  prefixStatements: PromiseNode[]
  returnExpression: PromiseNode | null
  statements: PromiseNode[]
}

type PromiseTopLevelNodeEntry = {
  kind: string
  node: PromiseNode
}

type PromiseCallbackContext = {
  lines: string[]
  expression: string
  finalizer: string
}

function promiseNodeAt(values: PromiseNode[], index: number): PromiseNode {
  return values[index]
}

function promiseProgramAt(values: IrProgram[], index: number): IrProgram {
  return values[index]
}

function promiseCallbackScopeAt(values: CallbackScope[], index: number): CallbackScope {
  return values[index]
}

function promiseHandlerSnapshotAt(
  values: PromiseConstructorHandlerSnapshot[],
  index: number
): PromiseConstructorHandlerSnapshot {
  return values[index]
}

function promiseRuntimeArrowCaptureAt(values: CRuntimeArrowCapture[], index: number): CRuntimeArrowCapture {
  return values[index]
}

function promiseStringAt(values: string[], index: number): string {
  return values[index]
}

function promiseReferenceName(expression: PromiseNode | null | undefined): string | null {
  if (expression == null || expression.type !== 'Reference' || expression.path.length !== 1) {
    return null
  }

  return expression.path[0] ?? null
}

function promiseMemberObjectReferenceName(expression: PromiseNode | null | undefined): string | null {
  if (expression == null || expression.type !== 'MemberExpression') {
    return null
  }

  return promiseReferenceName(expression.object)
}

export function emitPreparedPromiseStaticExpression(
  expression: AnyNode | null | undefined,
  context: PromiseFunctionContext,
  dependencies: PromiseLoweringDependencies,
  options: PreparedCallOptions = {}
): PreparedExpression | null {
  if (expression == null) {
    return null
  }

  const method = cPromiseRuntimeCallName(expression.callee)

  if (method == null) {
    return null
  }

  if (expression.valueType !== 'promise') {
    return null
  }

  registerEventLoop(context)

  const out = preparedPromiseOut(options, context, 'inox_promise')
  const rejectionValueType = promiseStaticRejectionValueType(method, expression, context, dependencies)

  if (options.owned !== false) {
    registerOwnedPromise(context, out, expressionPromiseValueType(expression), rejectionValueType)
  }
  const runtimeCall = promiseStaticRuntimeCall(method)
  const value = emitPreparedPromiseArgumentValue(expression.args[0], context, dependencies)
  const lines: string[] = []
  appendLines(lines, value.lines)
  lines.push(emitStatusCheck(`${runtimeCall}(${emitEventLoopReference(context)}, ${value.expression}, &${out})`, context))

  return {
    lines,
    expression: out,
    rejectionValueType
  }
}

export function emitPreparedPromiseConstructorExpression(
  expression: AnyNode | null | undefined,
  context: PromiseFunctionContext,
  dependencies: PromiseLoweringDependencies,
  options: PreparedCallOptions = {}
): PreparedExpression | null {
  if (expression == null || !isPromiseConstructorExpression(expression)) {
    return null
  }

  if (expression.valueType !== 'promise') {
    return null
  }

  registerEventLoop(context)

  const out = preparedPromiseOut(options, context, 'inox_promise')
  const executor = expression.args[0]
  const valueType = expressionPromiseValueType(expression)
  const rejectionValueType = promiseConstructorRejectionValueType(executor, context, dependencies)

  if (options.owned !== false) {
    registerOwnedPromise(context, out, valueType, rejectionValueType)
  }

  const lines = [emitStatusCheck(`inox_promise_new(${emitEventLoopReference(context)}, &${out})`, context)]

  if (executor == null || executor.type !== 'ArrowFunctionExpression') {
    context.diagnostics.push(
      diagnostic(
        'INOX_C_ASYNC',
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

  const resolveName = promiseExecutorParamName(executor, 0)
  const rejectName = promiseExecutorParamName(executor, 1)
  const statements = promiseExecutorStatements(executor)

  const handlerSnapshots = pushPromiseConstructorHandlers(context, resolveName, rejectName, out)

  try {
    appendLines(lines, dependencies.emitStatementList(statements, context))
  } finally {
    restorePromiseConstructorHandlers(context, handlerSnapshots)
  }

  return {
    lines,
    expression: out,
    valueType,
    rejectionValueType
  }
}

export function emitPromiseConstructorSettlementCall(
  expression: AnyNode | null | undefined,
  context: PromiseFunctionContext,
  dependencies: PromiseLoweringDependencies
): string[] | null {
  if (expression == null || expression.type !== 'CallExpression') {
    return null
  }

  const handlerName = promiseReferenceName(expression.callee)

  if (handlerName == null) {
    return null
  }

  const handler = context.promiseConstructorHandlers.get(handlerName)

  if (handler == null) {
    return null
  }

  if (expression.args.length > 1) {
    context.diagnostics.push(
      diagnostic(
        'INOX_C_ASYNC',
        'Promise constructor resolve/reject handlers currently support at most one argument in C',
        expression.loc
      )
    )
  }

  const value = emitPreparedPromiseArgumentValue(expression.args[0], context, dependencies)
  const runtimeCall = promiseConstructorHandlerRuntimeCall(handler)
  const lines: string[] = []
  appendLines(lines, value.lines)
  lines.push(emitStatusCheck(`${runtimeCall}(${promiseConstructorHandlerPromise(handler)}, ${value.expression})`, context))

  return lines
}

export function emitPreparedPromiseMethodExpression(
  expression: AnyNode | null | undefined,
  context: PromiseFunctionContext,
  dependencies: PromiseLoweringDependencies,
  options: PreparedCallOptions = {}
): PreparedExpression | null {
  if (expression == null || !isPromiseMethodCallExpression(expression, context, dependencies)) {
    return null
  }

  const method = expression.callee.property
  const callback = expression.args[0]
  let wrapper: CPromiseChainWrapper | null = null

  if (callback != null) {
    const existingWrapper = context.promiseChainArrowWrappers.get(callback)

    if (existingWrapper != null) {
      wrapper = existingWrapper
    }
  }

  if (wrapper == null) {
    context.diagnostics.push(
      diagnostic(
        'INOX_C_ASYNC',
        'Promise.then/catch currently supports only non-capturing expression-body, single-return block-body, straight-line block-body or simple control-flow block-body arrow callbacks in C',
        expression.loc
      )
    )

    return {
      lines: [],
      expression: '0',
      valueType: expressionPromiseValueType(expression),
      rejectionValueType: 'unknown'
    }
  }

  const receiver = emitPreparedPromiseExpression(expression.callee.object, context, dependencies, {})

  if (receiver == null) {
    context.diagnostics.push(
      diagnostic(
        'INOX_C_ASYNC',
        'this Promise chain receiver is not supported by the current C backend slice',
        expression.loc
      )
    )

    return {
      lines: [],
      expression: '0',
      valueType: expressionPromiseValueType(expression),
      rejectionValueType: 'unknown'
    }
  }

  const out = preparedPromiseOut(options, context, 'inox_promise')
  const valueType = expressionPromiseValueType(expression)
  const rejectionValueType = promiseMethodRejectionValueType(method, receiver)
  const callbackContext = emitPromiseChainCallbackContext(wrapper, context, dependencies)
  const runtimeCall = promiseMethodRuntimeCall(method, receiver, wrapper, callbackContext, out)
  const runtimeCallLines = promiseMethodRuntimeCallLines(runtimeCall, callbackContext, wrapper, context)

  if (options.owned !== false) {
    registerOwnedPromise(context, out, valueType, rejectionValueType)
  }

  const lines: string[] = []
  appendLines(lines, preparedPromiseLines(receiver))
  appendLines(lines, callbackContext.lines)
  appendLines(lines, runtimeCallLines)

  return {
    lines,
    expression: out,
    valueType,
    rejectionValueType
  }
}

export function emitPreparedPromiseExpression(
  expression: AnyNode | null | undefined,
  context: PromiseFunctionContext,
  dependencies: PromiseLoweringDependencies,
  options: PreparedCallOptions = {}
): PreparedExpression | null {
  if (expression == null) {
    return null
  }

  const fetchCall = dependencies.emitPreparedFetchCallExpression(expression, context, options)

  if (fetchCall != null) {
    return preparedPromiseWithValueType(fetchCall, resolvedPromiseExpressionValueType(expression, context, fetchCall.valueType))
  }

  const fsCall = dependencies.emitPreparedFsCallExpression(expression, context, options)

  if (fsCall != null) {
    return preparedPromiseWithValueType(fsCall, resolvedPromiseExpressionValueType(expression, context, null))
  }

  const promiseConstructor = emitPreparedPromiseConstructorExpression(expression, context, dependencies, options)

  if (promiseConstructor != null) {
    return preparedPromiseWithValueType(
      promiseConstructor,
      resolvedPromiseExpressionValueType(expression, context, promiseConstructor.valueType)
    )
  }

  const promiseResolve = emitPreparedPromiseStaticExpression(expression, context, dependencies, options)

  if (promiseResolve != null) {
    return preparedPromiseWithValueType(promiseResolve, resolvedPromiseExpressionValueType(expression, context, null))
  }

  const promiseMethod = emitPreparedPromiseMethodExpression(expression, context, dependencies, options)

  if (promiseMethod != null) {
    return preparedPromiseWithValueType(promiseMethod, resolvedPromiseExpressionValueType(expression, context, null))
  }

  const asyncPromiseCall = dependencies.emitPreparedAsyncFunctionPromiseCallExpression(expression, context, options)

  if (asyncPromiseCall != null) {
    return preparedPromiseWithValueType(asyncPromiseCall, resolvedPromiseExpressionValueType(expression, context, null))
  }

  const promiseCall = emitPreparedPromiseReturningCallExpression(expression, context, dependencies, options)

  if (promiseCall != null) {
    return promiseCall
  }

  const expressionName = promiseReferenceName(expression)

  if (expressionName != null) {
    if (context.variables.get(expressionName) === 'promise') {
      return {
        lines: [],
        expression: expressionName,
        valueType: promiseContextValueType(context, expressionName),
        rejectionValueType: promiseContextRejectionValueType(context, expressionName)
      }
    }
  }

  return null
}

export function emitPreparedPromiseReturningCallExpression(
  expression: AnyNode | null | undefined,
  context: PromiseFunctionContext,
  dependencies: PromiseLoweringDependencies,
  options: PreparedCallOptions = {}
): PreparedExpression | null {
  if (expression == null || expression.type !== 'CallExpression') {
    return null
  }

  if (!isPromiseReturningFunctionCallee(expression.callee, context)) {
    return null
  }

  const out = preparedPromiseOut(options, context, 'inox_promise')
  const valueType = resolvePromiseReturningFunctionValueType(expression.callee, context)
  const call = dependencies.emitPreparedCallExpression(expression, context)

  if (options.owned !== false) {
    registerOwnedPromise(context, out, valueType)
  }

  const lines: string[] = []
  appendLines(lines, call.lines)
  lines.push(`${out} = ${call.expression};`)
  lines.push(`if (${out} == 0) ${emitFailureStatement(context)}`)

  return {
    lines,
    expression: out,
    valueType,
    rejectionValueType: 'unknown'
  }
}

function appendLines(target: string[], values: string[]): void {
  for (const value of values) {
    target.push(value)
  }
}

function appendIndentedLines(target: string[], values: string[], indent: string): void {
  for (const value of values) {
    target.push(`${indent}${value}`)
  }
}

function preparedPromiseOut(options: PreparedCallOptions, context: PromiseFunctionContext, prefix: string): string {
  const out = options.out

  if (out != null) {
    return out
  }

  return nextCName(context, prefix)
}

function expressionPromiseValueType(expression: AnyNode): string {
  if (expression.promiseValueType != null) {
    return expression.promiseValueType
  }

  return 'unknown'
}

function promiseStaticRejectionValueType(
  method: string | null,
  expression: AnyNode,
  context: PromiseFunctionContext,
  dependencies: PromiseLoweringDependencies
): string {
  if (method === 'reject') {
    return dependencies.inferRejectedValueType(expression.args[0], context)
  }

  return 'unknown'
}

function promiseStaticRuntimeCall(method: string | null): string {
  if (method === 'resolve') {
    return 'inox_promise_resolved'
  }

  return 'inox_promise_rejected'
}

function emitPreparedPromiseArgumentValue(
  argument: AnyNode | null | undefined,
  context: PromiseFunctionContext,
  dependencies: PromiseLoweringDependencies
): PreparedExpression {
  if (argument == null) {
    return {
      lines: [],
      expression: 'inox_undefined_value()'
    }
  }

  return dependencies.emitCValueExpression(argument, context)
}

function promiseExecutorParamName(executor: AnyNode, index: number): string | null {
  const param = executor.params[index]

  if (param == null) {
    return null
  }

  if (param.name != null) {
    return param.name
  }

  return null
}

function promiseExecutorStatements(executor: AnyNode): AnyNode[] {
  if (executor.expressionBody) {
    let loc: SourceLocation | null | undefined = executor.loc

    if (executor.body != null && executor.body.loc != null) {
      loc = executor.body.loc
    }

    return [
      {
        type: 'ExpressionStatement',
        expression: executor.body,
        loc: loc
      }
    ]
  }

  if (Array.isArray(executor.body)) {
    return executor.body
  }

  if (executor.body != null && Array.isArray(executor.body.body)) {
    return executor.body.body
  }

  return []
}

function promiseConstructorRuntimeCall(kind: string): string {
  if (kind === 'resolve') {
    return 'inox_promise_resolve'
  }

  return 'inox_promise_reject'
}

function promiseConstructorHandlerRuntimeCall(handler: CPromiseConstructorHandler | null | undefined): string {
  if (handler == null) {
    return 'inox_promise_resolve'
  }

  return promiseConstructorRuntimeCall(handler.kind)
}

function promiseConstructorHandlerPromise(handler: CPromiseConstructorHandler | null | undefined): string {
  if (handler == null) {
    return '0'
  }

  return handler.promise
}

function preparedPromiseLines(prepared: PreparedExpression | null | undefined): string[] {
  if (prepared == null) {
    return []
  }

  return prepared.lines
}

function preparedPromiseExpression(prepared: PreparedExpression | null | undefined): string {
  if (prepared == null) {
    return '0'
  }

  return prepared.expression
}

function preparedPromiseRejectionValueType(prepared: PreparedExpression | null | undefined): string {
  if (prepared == null) {
    return ''
  }

  return optionalString(prepared.rejectionValueType)
}

function promiseChainWrapperName(wrapper: CPromiseChainWrapper | null | undefined): string {
  if (wrapper == null) {
    return '0'
  }

  return wrapper.name
}

function promiseChainWrapperFinalizerName(wrapper: CPromiseChainWrapper | null | undefined): string {
  if (wrapper == null) {
    return '0'
  }

  return wrapper.finalizerName
}

function promiseMethodRejectionValueType(method: string, receiver: PreparedExpression | null | undefined): string {
  if (method === 'then') {
    const rejectionValueType = preparedPromiseRejectionValueType(receiver)

    if (rejectionValueType !== '') {
      return rejectionValueType
    }
  }

  return 'unknown'
}

function promiseMethodRuntimeCall(
  method: string,
  receiver: PreparedExpression | null | undefined,
  wrapper: CPromiseChainWrapper | null | undefined,
  callbackContext: PromiseCallbackContext,
  out: string
): string {
  const receiverExpression = preparedPromiseExpression(receiver)
  const wrapperName = promiseChainWrapperName(wrapper)

  if (method === 'then') {
    return `inox_promise_chain(${receiverExpression}, ${wrapperName}, 0, ${callbackContext.expression}, ${callbackContext.finalizer}, &${out})`
  }

  return `inox_promise_catch(${receiverExpression}, ${wrapperName}, ${callbackContext.expression}, ${callbackContext.finalizer}, &${out})`
}

function promiseMethodRuntimeCallLines(
  runtimeCall: string,
  callbackContext: PromiseCallbackContext,
  wrapper: CPromiseChainWrapper | null | undefined,
  context: PromiseFunctionContext
): string[] {
  if (callbackContext.expression === '0') {
    return [emitStatusCheck(runtimeCall, context)]
  }

  return [
    `if (${runtimeCall} != INOX_OK) {`,
    `  ${promiseChainWrapperFinalizerName(wrapper)}(${callbackContext.expression});`,
    `  ${emitFailureStatement(context)}`,
    '}'
  ]
}

function preparedPromiseWithValueType(prepared: PreparedExpression, valueType: string): PreparedExpression {
  const result: PreparedExpression = {
    lines: prepared.lines,
    expression: prepared.expression,
    valueType
  }

  if (optionalBoolean(prepared.nullable)) {
    result.nullable = true
  }

  const rejectionValueType = optionalString(prepared.rejectionValueType)

  if (rejectionValueType !== '') {
    result.rejectionValueType = rejectionValueType
  }

  return result
}

function resolvedPromiseExpressionValueType(
  expression: AnyNode,
  context: PromiseFunctionContext,
  fallback: string | null | undefined
): string {
  const resolved = resolvePromiseExpressionValueType(expression, context)

  if (resolved != null) {
    return resolved
  }

  if (fallback != null) {
    return fallback
  }

  return 'unknown'
}

function promiseContextValueType(context: PromiseFunctionContext, name: string): string {
  const valueType = context.promiseValueTypes.get(name)

  if (valueType != null) {
    return valueType
  }

  return 'unknown'
}

function promiseContextRejectionValueType(context: PromiseFunctionContext, name: string): string {
  const valueType = context.promiseRejectionValueTypes.get(name)

  if (valueType != null) {
    return valueType
  }

  return 'unknown'
}

function appendCallbackScope(scopes: CallbackScope[], scope: CallbackScope): CallbackScope[] {
  const result: CallbackScope[] = []

  for (let index = 0; index < scopes.length; index = index + 1) {
    const item = promiseCallbackScopeAt(scopes, index)

    result.push(item)
  }

  result.push(scope)

  return result
}

function promiseCallbackReturnType(callback: AnyNode, expression: AnyNode): string {
  if (callback.returnType != null) {
    return callback.returnType
  }

  if (expression.promiseValueType != null) {
    return expression.promiseValueType
  }

  return 'unknown'
}

function promiseCallbackReturnShape(callback: AnyNode): CObjectShape | null {
  if (callback.returnShape != null) {
    return callback.returnShape
  }

  return null
}

function callbackParamValueType(param: AnyNode): string {
  if (param.valueType != null) {
    return param.valueType
  }

  return 'unknown'
}

function promiseChainCallbackBodyStatements(callback: PromiseNode): PromiseNode[] | null {
  if (Array.isArray(callback.body)) {
    return callback.body
  }

  if (callback.body != null && callback.body.type === 'BlockStatement') {
    return callback.body.body
  }

  return null
}

function lastPromiseChainCallbackStatement(statements: PromiseNode[] | null | undefined): PromiseNode | null {
  if (statements == null || statements.length === 0) {
    return null
  }

  return statements[statements.length - 1]
}

function promiseChainCallbackStatementsBeforeLast(statements: PromiseNode[] | null | undefined): PromiseNode[] {
  const result: PromiseNode[] = []

  if (statements == null) {
    return result
  }

  for (let index = 0; index < statements.length - 1; index = index + 1) {
    result.push(statements[index])
  }

  return result
}

function promiseReturnStatementArgument(statement: PromiseNode | null | undefined): PromiseNode | null {
  if (statement == null) {
    return null
  }

  if (statement.argument != null) {
    return statement.argument
  }

  return null
}

function promiseStatementsOrEmpty(statements: PromiseNode[] | null | undefined): PromiseNode[] {
  if (statements == null) {
    return []
  }

  return statements
}

function allStraightLinePromiseCallbackStatements(statements: PromiseNode[] | null | undefined): boolean {
  if (statements == null) {
    return false
  }

  for (let index = 0; index < statements.length; index = index + 1) {
    const statement = promiseNodeAt(statements, index)

    if (!isStraightLinePromiseCallbackStatement(statement)) {
      return false
    }
  }

  return true
}

function allPromiseChainCallbackStatements(statements: PromiseNode[] | null | undefined): boolean {
  if (statements == null) {
    return false
  }

  for (let index = 0; index < statements.length; index = index + 1) {
    const statement = promiseNodeAt(statements, index)

    if (!isPromiseChainCallbackStatement(statement)) {
      return false
    }
  }

  return true
}

function pushPromiseConstructorHandlers(
  context: PromiseFunctionContext,
  resolveName: string | null,
  rejectName: string | null,
  promise: string
): PromiseConstructorHandlerSnapshot[] {
  const snapshots: PromiseConstructorHandlerSnapshot[] = []

  if (resolveName != null) {
    snapshots.push({
      name: resolveName,
      previous: promiseConstructorHandlerOrNull(context.promiseConstructorHandlers.get(resolveName))
    })
    context.promiseConstructorHandlers.set(resolveName, {
      kind: 'resolve',
      promise: promise
    })
  }

  if (rejectName != null) {
    snapshots.push({
      name: rejectName,
      previous: promiseConstructorHandlerOrNull(context.promiseConstructorHandlers.get(rejectName))
    })
    context.promiseConstructorHandlers.set(rejectName, {
      kind: 'reject',
      promise: promise
    })
  }

  return snapshots
}

function restorePromiseConstructorHandlers(
  context: PromiseFunctionContext,
  snapshots: PromiseConstructorHandlerSnapshot[]
): void {
  for (let index = 0; index < snapshots.length; index = index + 1) {
    const snapshot = promiseHandlerSnapshotAt(snapshots, index)
    const previous = snapshot.previous

    if (previous == null) {
      context.promiseConstructorHandlers.delete(snapshot.name)
    } else {
      context.promiseConstructorHandlers.set(snapshot.name, previous)
    }
  }
}

function promiseConstructorHandlerOrNull(
  value: CPromiseConstructorHandler | null | undefined
): CPromiseConstructorHandler | null {
  if (value == null) {
    return null
  }

  return value
}

function promiseConstructorRejectionValueType(
  executor: AnyNode | null | undefined,
  context: PromiseFunctionContext,
  dependencies: PromiseLoweringDependencies
): string {
  if (executor == null || executor.type !== 'ArrowFunctionExpression') {
    return 'unknown'
  }

  const rejectName = optionalString(promiseExecutorParamName(executor, 1))

  if (rejectName === '') {
    return 'unknown'
  }

  const types: string[] = []
  visitPromiseConstructorRejectionNode(executor.body, rejectName, types, context, dependencies)

  return uniqueValueTypes(types)
}

function visitPromiseConstructorRejectionNode(
  node: AnyNode | AnyNode[] | null | undefined,
  rejectName: string,
  types: string[],
  context: PromiseFunctionContext,
  dependencies: PromiseLoweringDependencies
): void {
  if (node == null) {
    return
  }

  if (Array.isArray(node)) {
    for (let index = 0; index < node.length; index = index + 1) {
      const item = promiseNodeAt(node, index)

      visitPromiseConstructorRejectionNode(item, rejectName, types, context, dependencies)
    }
    return
  }

  const current = node

  if (
    current.type === 'CallExpression' &&
    promiseReferenceName(current.callee) === rejectName
  ) {
    types.push(dependencies.inferRejectedValueType(promiseNodeAt(current.args, 0), context))
  }

  visitPromiseConstructorRejectionChildren(current, rejectName, types, context, dependencies)
}

function visitPromiseConstructorRejectionChildren(
  current: AnyNode,
  rejectName: string,
  types: string[],
  context: PromiseFunctionContext,
  dependencies: PromiseLoweringDependencies
): void {
  if (current.type === 'BlockStatement') {
    visitPromiseConstructorRejectionNode(current.body, rejectName, types, context, dependencies)
    return
  }

  if (current.type === 'ExpressionStatement') {
    visitPromiseConstructorRejectionNode(current.expression, rejectName, types, context, dependencies)
    return
  }

  if (current.type === 'VariableDeclaration') {
    visitPromiseConstructorRejectionNode(current.init, rejectName, types, context, dependencies)
    return
  }

  if (current.type === 'ReturnStatement' || current.type === 'ThrowStatement') {
    visitPromiseConstructorRejectionNode(current.argument, rejectName, types, context, dependencies)
    return
  }

  if (current.type === 'CallExpression' || current.type === 'NewExpression' || current.type === 'OptionalCallExpression') {
    visitPromiseConstructorRejectionNode(current.args, rejectName, types, context, dependencies)
    return
  }

  if (current.type === 'AssignmentExpression') {
    visitPromiseConstructorRejectionNode(current.target, rejectName, types, context, dependencies)
    visitPromiseConstructorRejectionNode(current.value, rejectName, types, context, dependencies)
    return
  }

  if (current.type === 'BinaryExpression') {
    visitPromiseConstructorRejectionNode(current.left, rejectName, types, context, dependencies)
    visitPromiseConstructorRejectionNode(current.right, rejectName, types, context, dependencies)
    return
  }

  if (
    current.type === 'UnaryExpression' ||
    current.type === 'UpdateExpression' ||
    current.type === 'AwaitExpression'
  ) {
    visitPromiseConstructorRejectionNode(current.argument, rejectName, types, context, dependencies)
    return
  }

  if (current.type === 'MemberExpression' || current.type === 'OptionalMemberExpression') {
    visitPromiseConstructorRejectionNode(current.object, rejectName, types, context, dependencies)
    return
  }

  if (current.type === 'IndexExpression' || current.type === 'OptionalIndexExpression') {
    visitPromiseConstructorRejectionNode(current.object, rejectName, types, context, dependencies)
    visitPromiseConstructorRejectionNode(current.index, rejectName, types, context, dependencies)
    return
  }

  if (current.type === 'ArrayLiteral') {
    visitPromiseConstructorRejectionNode(current.elements, rejectName, types, context, dependencies)
    return
  }

  if (current.type === 'ObjectLiteral') {
    for (let index = 0; index < current.properties.length; index = index + 1) {
      const property = promiseNodeAt(current.properties, index)

      visitPromiseConstructorRejectionNode(property.value, rejectName, types, context, dependencies)
    }
    return
  }

  if (current.type === 'IfStatement') {
    visitPromiseConstructorRejectionNode(current.condition, rejectName, types, context, dependencies)
    visitPromiseConstructorRejectionNode(current.consequent, rejectName, types, context, dependencies)
    visitPromiseConstructorRejectionNode(current.alternate, rejectName, types, context, dependencies)
    return
  }

  if (current.type === 'WhileStatement') {
    visitPromiseConstructorRejectionNode(current.condition, rejectName, types, context, dependencies)
    visitPromiseConstructorRejectionNode(current.body, rejectName, types, context, dependencies)
    return
  }

  if (current.type === 'ForStatement') {
    visitPromiseConstructorRejectionNode(current.init, rejectName, types, context, dependencies)
    visitPromiseConstructorRejectionNode(current.test, rejectName, types, context, dependencies)
    visitPromiseConstructorRejectionNode(current.update, rejectName, types, context, dependencies)
    visitPromiseConstructorRejectionNode(current.body, rejectName, types, context, dependencies)
    return
  }

  if (current.type === 'ForOfStatement') {
    visitPromiseConstructorRejectionNode(current.iterable, rejectName, types, context, dependencies)
    visitPromiseConstructorRejectionNode(current.body, rejectName, types, context, dependencies)
    return
  }

  if (current.type === 'SwitchStatement') {
    visitPromiseConstructorRejectionNode(current.discriminant, rejectName, types, context, dependencies)

    for (let index = 0; index < current.cases.length; index = index + 1) {
      const item = promiseNodeAt(current.cases, index)

      visitPromiseConstructorRejectionNode(item.test, rejectName, types, context, dependencies)
      visitPromiseConstructorRejectionNode(item.consequent, rejectName, types, context, dependencies)
    }
    return
  }

  if (current.type === 'TryStatement') {
    visitPromiseConstructorRejectionNode(current.block, rejectName, types, context, dependencies)

    if (current.handler != null) {
      visitPromiseConstructorRejectionNode(current.handler.body, rejectName, types, context, dependencies)
    }

    visitPromiseConstructorRejectionNode(current.finalizer, rejectName, types, context, dependencies)
  }
}

function uniqueValueTypes(types: string[]): string {
  if (types.length === 0) {
    return 'unknown'
  }

  const first = types[0]

  for (let index = 0; index < types.length; index = index + 1) {
    const valueType = promiseStringAt(types, index)

    if (valueType !== first) {
      return 'unknown'
    }
  }

  return first
}

function emitPromiseChainCallbackContext(
  wrapper: CPromiseChainWrapper | null | undefined,
  context: PromiseFunctionContext,
  dependencies: PromiseLoweringDependencies
): PromiseCallbackContext {
  if (wrapper == null || !dependencies.isPromiseChainCallbackWrapperWithContext(wrapper)) {
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
          'INOX_C_ASYNC',
          'mutable Promise callback captures are outside the current C backend MVP; use const captures or move mutation outside the Promise callback',
          wrapper.expression.loc
        )
      )
    }

    if (!isSupportedPromiseCaptureValueType(capture.valueType)) {
      context.diagnostics.push(
        diagnostic(
          'INOX_C_ASYNC',
          'capturing Promise callbacks currently support only const number/boolean/string/object bindings',
          wrapper.expression.loc
        )
      )
    }
  }

  const contextName = nextCName(context, 'inox_promise_callback_ctx')

  lines.push(
    `${wrapper.contextTypeName}* ${contextName} = inox_default_alloc(0, sizeof(${wrapper.contextTypeName}), _Alignof(${wrapper.contextTypeName}));`
  )
  lines.push(`if (${contextName} == 0) ${emitFailureStatement(context)}`)

  if (wrapper.needsEventLoop === true) {
    registerEventLoop(context)
    lines.push(`${contextName}->inox_loop = ${emitEventLoopReference(context)};`)
  }

  for (const capture of wrapper.captures) {
    appendLines(lines, dependencies.emitRuntimeArrowCaptureStoreLines(capture, contextName, context))
  }

  return {
    lines,
    expression: contextName,
    finalizer: wrapper.finalizerName
  }
}

function isPromiseMethodCallExpression(
  expression: AnyNode | null | undefined,
  context: PromiseFunctionContext,
  dependencies: PromiseLoweringDependencies
): boolean {
  if (expression == null || expression.type !== 'CallExpression') {
    return false
  }

  if (expression.callee == null || expression.callee.type !== 'MemberExpression') {
    return false
  }

  if (expression.callee.property !== 'catch' && expression.callee.property !== 'then') {
    return false
  }

  return dependencies.inferExpressionType(expression.callee.object, context) === 'promise'
}

export function collectPromiseChainWrappers(
  irPrograms: IrProgram[],
  context: PromiseEmitContext,
  deps: PromiseChainLoweringDependencies
): Map<string, CPromiseChainWrapper> {
  const wrappers: Map<string, CPromiseChainWrapper> = new Map()

  for (let irIndex = 0; irIndex < irPrograms.length; irIndex = irIndex + 1) {
    const ir = promiseProgramAt(irPrograms, irIndex)
    const topLevelScope: CallbackScope = new Map()
    const entries: PromiseTopLevelNodeEntry[] = collectIrTopLevelNodeEntries(ir)

    for (let entryIndex = 0; entryIndex < entries.length; entryIndex = entryIndex + 1) {
      const item: PromiseTopLevelNodeEntry = entries[entryIndex]

      if (item.kind === 'function') {
        const scope: CallbackScope = new Map()
        declarePromiseCallbackParams(scope, item.node.params)
        const functionScopes: CallbackScope[] = [topLevelScope, scope]

        for (let statementIndex = 0; statementIndex < item.node.body.length; statementIndex = statementIndex + 1) {
          const statement = promiseNodeAt(item.node.body, statementIndex)

          visitPromiseChainStatement(statement, functionScopes, wrappers, context, deps)
        }
      } else if (item.kind === 'statement') {
        visitPromiseChainStatement(item.node, [topLevelScope], wrappers, context, deps)
      }
    }
  }

  return wrappers
}

function declarePromiseCallbackBinding(scope: CallbackScope, name: string, info: CallbackScopeBinding): void {
  scope.set(name, info)
}

function declarePromiseCallbackParams(scope: CallbackScope, params: AnyNode[]): void {
  for (let index = 0; index < params.length; index = index + 1) {
    const param = promiseNodeAt(params, index)

    declarePromiseCallbackBinding(scope, param.name, {
      name: param.name,
      valueType: param.valueType,
      declaration: param,
      functionType: param.functionType,
      nullable: param.nullable === true,
      shape: param.shape,
      runtimeManaged: isPromiseRuntimeManagedValueType(param.valueType),
      mutable: false
    })
  }
}

function lookupPromiseCallbackBinding(name: string, scopes: CallbackScope[]): CallbackScopeBinding | null {
  for (let index = scopes.length - 1; index >= 0; index = index - 1) {
    const entry = scopes[index].get(name)

    if (entry != null) {
      return entry
    }
  }

  return null
}

function isPromiseRuntimeManagedValueType(valueType: string): boolean {
  return valueType === 'string' || valueType === 'object'
}

function isSupportedPromiseCaptureValueType(valueType: string): boolean {
  return valueType === 'number' || valueType === 'boolean' || isPromiseRuntimeManagedValueType(valueType)
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

  const initName = promiseReferenceName(statement.init)

  if (initName != null) {
    const binding = lookupPromiseCallbackBinding(initName, scopes)

    if (binding != null && binding.runtimeManaged === true) {
      return true
    }

    return false
  }

  return true
}

function declarePromiseCallbackVariable(scope: CallbackScope, statement: AnyNode, scopes: CallbackScope[]): void {
  declarePromiseCallbackBinding(scope, statement.name, {
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

function registerPromiseChainExpression(
  expression: AnyNode,
  scopes: CallbackScope[],
  wrappers: Map<string, CPromiseChainWrapper>,
  context: PromiseEmitContext,
  deps: PromiseChainLoweringDependencies
): void {
  if (!isPromiseMethodAst(expression)) {
    return
  }

  const callback = expression.args[0]

  if (callback == null || callback.type !== 'ArrowFunctionExpression') {
    return
  }

  if (callback.params.length > 1) {
    return
  }

  if (resolvePromiseChainArrowBody(callback) == null) {
    return
  }

  if (context.promiseChainArrowWrappers.has(callback)) {
    return
  }

  const index = wrappers.size
  const key = `promise-chain-arrow:${index}`
  const captures = deps.collectArrowCaptures(callback, scopes, context, deps.callbackLoweringDependencies)

  for (let captureIndex = 0; captureIndex < captures.length; captureIndex = captureIndex + 1) {
    const capture = promiseRuntimeArrowCaptureAt(captures, captureIndex)
    const declaration = capture.declaration

    if (
      promiseBooleanValueIsTrue(capture.mutable) &&
      isPromiseRuntimeManagedOrScalarCapture(capture.valueType) &&
      declaration != null
    ) {
      context.boxedMutableCaptureDeclarations.add(declaration)
    }
  }

  const wrapper: CPromiseChainWrapper = {
    kind: 'promise-chain-arrow',
    key: key,
    name: `inox_promise_chain_arrow_${index}`,
    contextTypeName: `inox_promise_chain_context_${index}`,
    finalizerName: `inox_promise_chain_context_${index}_finalize`,
    expression: callback,
    returnType: promiseCallbackReturnType(callback, expression),
    returnShape: promiseCallbackReturnShape(callback),
    needsEventLoop: deps.functionUsesExternalEventLoop(callback, context.externalEventLoopFunctions),
    captures: captures
  }

  wrappers.set(key, wrapper)
  context.promiseChainArrowWrappers.set(callback, wrapper)
}

function isPromiseRuntimeManagedOrScalarCapture(valueType: string): boolean {
  return valueType === 'number' || valueType === 'boolean' || valueType === 'string' || valueType === 'object'
}

function visitPromiseChainStatement(
  statement: AnyNode | null | undefined,
  scopes: CallbackScope[],
  wrappers: Map<string, CPromiseChainWrapper>,
  context: PromiseEmitContext,
  deps: PromiseChainLoweringDependencies
): void {
  if (statement == null) {
    return
  }

  if (statement.type === 'VariableDeclaration') {
    visitPromiseChainExpression(statement.init, scopes, wrappers, context, deps)
    declarePromiseCallbackVariable(scopes[scopes.length - 1], statement, scopes)
    return
  }

  if (statement.type === 'ExpressionStatement') {
    visitPromiseChainExpression(statement.expression, scopes, wrappers, context, deps)
    return
  }

  if (statement.type === 'ReturnStatement' || statement.type === 'ThrowStatement') {
    visitPromiseChainExpression(statement.argument, scopes, wrappers, context, deps)
    return
  }

  if (statement.type === 'BlockStatement') {
    const scope: CallbackScope = new Map()
    const blockScopes = appendCallbackScope(scopes, scope)

    for (let index = 0; index < statement.body.length; index = index + 1) {
      const item = promiseNodeAt(statement.body, index)

      visitPromiseChainStatement(item, blockScopes, wrappers, context, deps)
    }
    return
  }

  if (statement.type === 'IfStatement') {
    visitPromiseChainExpression(statement.condition, scopes, wrappers, context, deps)
    visitPromiseChainStatement(statement.consequent, scopes, wrappers, context, deps)
    visitPromiseChainStatement(statement.alternate, scopes, wrappers, context, deps)
    return
  }

  if (statement.type === 'WhileStatement') {
    visitPromiseChainExpression(statement.condition, scopes, wrappers, context, deps)
    visitPromiseChainStatement(statement.body, scopes, wrappers, context, deps)
    return
  }

  if (statement.type === 'ForStatement') {
    const scope: CallbackScope = new Map()
    const loopScopes = appendCallbackScope(scopes, scope)

    if (statement.init != null && statement.init.type === 'VariableDeclaration') {
      visitPromiseChainStatement(statement.init, loopScopes, wrappers, context, deps)
    } else {
      visitPromiseChainExpression(statement.init, loopScopes, wrappers, context, deps)
    }

    visitPromiseChainExpression(statement.test, loopScopes, wrappers, context, deps)
    visitPromiseChainExpression(statement.update, loopScopes, wrappers, context, deps)
    visitPromiseChainStatement(statement.body, loopScopes, wrappers, context, deps)
    return
  }

  if (statement.type === 'ForOfStatement') {
    visitPromiseChainExpression(statement.iterable, scopes, wrappers, context, deps)
    const scope: CallbackScope = new Map()
    declarePromiseCallbackBinding(scope, statement.name, {
      name: statement.name,
      valueType: 'unknown',
      mutable: statement.kind === 'let'
    })
    visitPromiseChainStatement(statement.body, appendCallbackScope(scopes, scope), wrappers, context, deps)
    return
  }

  if (statement.type === 'SwitchStatement') {
    visitPromiseChainExpression(statement.discriminant, scopes, wrappers, context, deps)

    for (let index = 0; index < statement.cases.length; index = index + 1) {
      const item = promiseNodeAt(statement.cases, index)

      visitPromiseChainExpression(item.test, scopes, wrappers, context, deps)
      const scope: CallbackScope = new Map()
      const caseScopes = appendCallbackScope(scopes, scope)

      for (let consequentIndex = 0; consequentIndex < item.consequent.length; consequentIndex = consequentIndex + 1) {
        const caseStatement = promiseNodeAt(item.consequent, consequentIndex)

        visitPromiseChainStatement(caseStatement, caseScopes, wrappers, context, deps)
      }
    }
    return
  }

  if (statement.type === 'TryStatement') {
    visitPromiseChainStatement(statement.block, scopes, wrappers, context, deps)

    if (statement.handler != null) {
      visitPromiseChainStatement(statement.handler.body, scopes, wrappers, context, deps)
    }

    visitPromiseChainStatement(statement.finalizer, scopes, wrappers, context, deps)
  }
}

function visitPromiseChainExpression(
  expression: AnyNode | null | undefined,
  scopes: CallbackScope[],
  wrappers: Map<string, CPromiseChainWrapper>,
  context: PromiseEmitContext,
  deps: PromiseChainLoweringDependencies
): void {
  if (expression == null) {
    return
  }

  if (expression.type === 'CallExpression') {
    registerPromiseChainExpression(expression, scopes, wrappers, context, deps)
    visitPromiseChainExpression(expression.callee, scopes, wrappers, context, deps)

    for (let index = 0; index < expression.args.length; index = index + 1) {
      const arg = promiseNodeAt(expression.args, index)

      visitPromiseChainExpression(arg, scopes, wrappers, context, deps)
    }
    return
  }

  if (expression.type === 'OptionalCallExpression' || expression.type === 'NewExpression') {
    visitPromiseChainExpression(expression.callee, scopes, wrappers, context, deps)

    for (let index = 0; index < expression.args.length; index = index + 1) {
      const arg = promiseNodeAt(expression.args, index)

      visitPromiseChainExpression(arg, scopes, wrappers, context, deps)
    }
    return
  }

  if (expression.type === 'AssignmentExpression') {
    visitPromiseChainExpression(expression.target, scopes, wrappers, context, deps)
    visitPromiseChainExpression(expression.value, scopes, wrappers, context, deps)
    return
  }

  if (expression.type === 'BinaryExpression') {
    visitPromiseChainExpression(expression.left, scopes, wrappers, context, deps)
    visitPromiseChainExpression(expression.right, scopes, wrappers, context, deps)
    return
  }

  if (
    expression.type === 'UnaryExpression' ||
    expression.type === 'UpdateExpression' ||
    expression.type === 'AwaitExpression'
  ) {
    visitPromiseChainExpression(expression.argument, scopes, wrappers, context, deps)
    return
  }

  if (expression.type === 'MemberExpression' || expression.type === 'OptionalMemberExpression') {
    visitPromiseChainExpression(expression.object, scopes, wrappers, context, deps)
    return
  }

  if (expression.type === 'IndexExpression' || expression.type === 'OptionalIndexExpression') {
    visitPromiseChainExpression(expression.object, scopes, wrappers, context, deps)
    visitPromiseChainExpression(expression.index, scopes, wrappers, context, deps)
    return
  }

  if (expression.type === 'ArrayLiteral') {
    for (let index = 0; index < expression.elements.length; index = index + 1) {
      const element = promiseNodeAt(expression.elements, index)

      visitPromiseChainExpression(element, scopes, wrappers, context, deps)
    }
    return
  }

  if (expression.type === 'ObjectLiteral') {
    for (let index = 0; index < expression.properties.length; index = index + 1) {
      const property = promiseNodeAt(expression.properties, index)

      visitPromiseChainExpression(property.value, scopes, wrappers, context, deps)
    }
  }
}

export function emitPromiseChainCallbackWrapperHead(wrapper: CPromiseChainWrapper): string {
  return `static inox_status ${wrapper.name}(void* context, inox_value inox_value_input, inox_value* out)`
}

export function emitPromiseChainCallbackWrapperDeclaration(
  wrapper: CPromiseChainWrapper,
  baseContext: PromiseEmitContext,
  deps: PromiseChainLoweringDependencies
): string[] {
  const lines: string[] = []

  if (deps.isPromiseChainCallbackWrapperWithContext(wrapper)) {
    appendLines(lines, deps.emitRuntimeArrowCallbackContextFinalizerDeclaration(wrapper))
    lines.push('')
  }

  const context = deps.createFunctionContext(baseContext, 'void', false)
  context.cleanupEnabled = false
  context.statusReturn = true
  context.runtimeCallbackReturnType = wrapper.returnType
  context.runtimeCallbackReturnShape = wrapper.returnShape
  context.runtimeCallbackReturnOut = '(*out)'
  context.runtimeCallbackCleanupLabel = 'inox_promise_callback_cleanup'
  const bodyLines: string[] = []
  appendLines(bodyLines, deps.emitRuntimeArrowCallbackContextLocals(wrapper, context, deps.callbackLoweringDependencies, 'context'))
  appendLines(bodyLines, emitPromiseChainCallbackParamPrelude(wrapper, context))
  const statementLines = emitPromiseChainCallbackStatementLines(wrapper, context, deps)

  lines.push(`${emitPromiseChainCallbackWrapperHead(wrapper)} {`)

  if (deps.isPromiseChainCallbackWrapperWithContext(wrapper)) {
    lines.push('  if (context == 0) return INOX_ERR_TYPE;')
  } else {
    lines.push('  (void)context;')
  }

  lines.push('  if (out == 0) return INOX_ERR_TYPE;')
  lines.push('  *out = inox_undefined_value();')
  appendIndentedLines(lines, bodyLines, '  ')
  appendIndentedLines(lines, deps.emitLoopFlowDeclarations(context), '  ')
  appendIndentedLines(lines, deps.emitReturnFlowDeclarations(context), '  ')
  appendIndentedLines(lines, deps.emitOwnedValueDeclarations(context), '  ')
  appendIndentedLines(lines, deps.emitErrorChannelDeclarations(context), '  ')
  appendIndentedLines(lines, deps.emitBoxedValueDeclarations(context), '  ')
  appendIndentedLines(lines, statementLines, '  ')

  if (context.usedRuntimeCallbackCleanupGoto === true) {
    lines.push(`${context.runtimeCallbackCleanupLabel}:`)
  }

  appendIndentedLines(lines, deps.emitOwnedValueCleanup(context), '  ')
  appendIndentedLines(lines, deps.emitBoxedValueCleanup(context), '  ')
  lines.push('  return INOX_OK;')
  lines.push('}')

  return lines
}

function emitPromiseChainCallbackParamPrelude(wrapper: CPromiseChainWrapper, context: PromiseFunctionContext): string[] {
  const param = wrapper.expression.params[0]

  if (param == null) {
    return ['(void)inox_value_input;']
  }

  const valueType = callbackParamValueType(param)
  context.variables.set(param.name, valueType)

  if (valueType === 'number') {
    return [
      emitRuntimeTypeCheck('inox_value_input.tag != INOX_TAG_NUMBER', context),
      `double ${param.name} = inox_value_input.as.number;`
    ]
  }

  if (valueType === 'boolean') {
    return [
      emitRuntimeTypeCheck('inox_value_input.tag != INOX_TAG_BOOL', context),
      `double ${param.name} = inox_value_input.as.boolean ? 1 : 0;`
    ]
  }

  if (valueType === 'string') {
    context.runtimeStrings.add(param.name)

    return [
      emitRuntimeTypeCheck('inox_value_input.tag != INOX_TAG_STRING || inox_value_input.as.ref == 0', context),
      `inox_string* ${param.name} = (inox_string*)inox_value_input.as.ref;`
    ]
  }

  if (valueType === 'object') {
    return [
      emitRuntimeTypeCheck('inox_value_input.tag != INOX_TAG_OBJECT || inox_value_input.as.ref == 0', context),
      `inox_value ${param.name} = inox_value_input;`
    ]
  }

  return [`inox_value ${param.name} = inox_value_input;`]
}

function emitPromiseChainCallbackStatementLines(
  wrapper: CPromiseChainWrapper,
  context: PromiseFunctionContext,
  deps: PromiseChainLoweringDependencies
): string[] {
  const body = resolvePromiseChainArrowBody(wrapper.expression)

  if (body == null) {
    return []
  }

  if (body.kind === 'statement-list') {
    return deps.emitStatementList(body.statements, context)
  }

  const prefixLines = deps.emitStatementList(body.prefixStatements, context)
  const lines: string[] = []
  appendLines(lines, prefixLines)
  appendLines(lines, emitPromiseChainCallbackReturnLines(body.returnExpression, wrapper, context, deps))

  return lines
}

function emitPromiseChainCallbackReturnLines(
  returnExpression: AnyNode | null,
  wrapper: CPromiseChainWrapper,
  context: PromiseFunctionContext,
  deps: PromiseChainLoweringDependencies
): string[] {
  if (returnExpression == null) {
    return []
  }

  if (wrapper.returnType === 'number' || wrapper.returnType === 'boolean') {
    const value = deps.emitPreparedNumberExpression(returnExpression, context)
    let expression = `inox_bool_value((${value.expression}) != 0)`

    if (wrapper.returnType === 'number') {
      expression = `inox_number_value(${value.expression})`
    }

    const lines: string[] = []
    appendLines(lines, value.lines)
    lines.push(`*out = ${expression};`)

    return lines
  }

  if (isManagedRuntimeReturnType(wrapper.returnType)) {
    return deps.emitRuntimeCallbackRuntimeValueReturnLines(returnExpression, context)
  }

  return []
}

export function resolvePromiseChainArrowBody(callback: AnyNode | null | undefined): PromiseChainArrowBody | null {
  if (callback == null || callback.type !== 'ArrowFunctionExpression') {
    return null
  }

  if (callback.expressionBody) {
    return {
      kind: 'prepared-return',
      prefixStatements: [],
      returnExpression: callback.body,
      statements: []
    }
  }

  const statements = promiseChainCallbackBodyStatements(callback)

  if (statements == null || statements.length === 0) {
    return null
  }

  const returnStatement = lastPromiseChainCallbackStatement(statements)

  if (returnStatement == null || returnStatement.type !== 'ReturnStatement') {
    return null
  }

  const prefixStatements = promiseChainCallbackStatementsBeforeLast(statements)

  if (allStraightLinePromiseCallbackStatements(prefixStatements)) {
    return {
      kind: 'prepared-return',
      prefixStatements,
      returnExpression: promiseReturnStatementArgument(returnStatement),
      statements: []
    }
  }

  if (!allPromiseChainCallbackStatements(statements)) {
    return null
  }

  return {
    kind: 'statement-list',
    prefixStatements: [],
    returnExpression: null,
    statements: promiseStatementsOrEmpty(statements)
  }
}

function isStraightLinePromiseCallbackStatement(statement: AnyNode | null | undefined): boolean {
  if (statement == null) {
    return false
  }

  return statement.type === 'VariableDeclaration' || statement.type === 'ExpressionStatement'
}

function isPromiseChainCallbackStatement(statement: AnyNode | null | undefined): boolean {
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
    return allPromiseChainCallbackStatements(statement.body)
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

function isPromiseChainCallbackSwitchStatement(statement: AnyNode): boolean {
  for (let index = 0; index < statement.cases.length; index = index + 1) {
    const item = promiseNodeAt(statement.cases, index)

    if (!allPromiseChainCallbackStatements(item.consequent)) {
      return false
    }
  }

  return true
}
