import type { AnyNode, Diagnostic, IrProgram, SourceLocation } from '../../../types.ts'
import type { LibraryAsyncResultOperationKind } from '../../../extensions/types.ts'
import { typeRefTraitArgument, typeRefValueTypeOrNull } from '../../../extensions/type-ref-compatibility.ts'
import { collectArrowCaptures, functionUsesExternalEventLoop } from './callbacks.ts'
import { cCompilerLibrarySetValue, cTypeRefMapValue } from '../types.ts'
import { compilerLibraryIntrinsicAsyncResultCValidExpression } from '../value-types.ts'
import type {
  CCallbackContextWrapper,
  CCallbackWrapper,
  CClassInfo,
  CCompilerLibrarySet,
  CFunctionParam,
  CFunctionType,
  CObjectShape,
  CObjectShapeField,
  CAsyncResultChainWrapper,
  CAsyncResultConstructorHandler,
  CRuntimeArrowCapture,
  CTypeRefMap,
  CPreparedCallOptions as PreparedCallOptions,
  CPreparedExpression as PreparedExpression
} from '../types.ts'
import type { CallbackLoweringDependencies, CallbackScope, CallbackScopeBinding } from './callbacks.ts'

type AsyncResultNode = AnyNode
type AsyncResultAnyNodeWrapperMap = Map<AnyNode, CAsyncResultChainWrapper>
type AsyncResultBooleanMap = Map<string, boolean>
type AsyncResultCallbackArrowWrapperMap = Map<AnyNode, CCallbackWrapper>
type AsyncResultCallbackWrapperMap = Map<string, CCallbackWrapper>
type AsyncResultConstructorHandlerMap = Map<string, CAsyncResultConstructorHandler>
type AsyncResultFunctionParamMap = Map<string, CFunctionParam[]>
type AsyncResultFunctionTypeMap = Map<string, CFunctionType>
type AsyncResultMutableDeclarationSet = Set<AnyNode | null | undefined>
type AsyncResultObjectShapeMap = Map<string, CObjectShapeField[]>
type AsyncResultStringMap = Map<string, string>
type AsyncResultStringNullableMap = Map<string, string | null>
type AsyncResultStringSet = Set<string>

type AsyncResultConstructorHandlerSnapshot = {
  name: string
  previous: CAsyncResultConstructorHandler | null
}

type AsyncResultEmitContext = {
  boxedMutableCaptureDeclarations: AsyncResultMutableDeclarationSet
  callbackArrowWrappers: AsyncResultCallbackArrowWrapperMap
  callbackWrappers: AsyncResultCallbackWrapperMap
  classInfos: Map<string, CClassInfo>
  diagnostics: Diagnostic[]
  externalEventLoopFunctions: AsyncResultStringSet
  functionAsyncFlags: AsyncResultBooleanMap
  functionNames: AsyncResultStringMap
  functionParams: AsyncResultFunctionParamMap
  functionReturnAsyncResultValueTypes: AsyncResultStringNullableMap
  functionReturnTypeRefs: CTypeRefMap
  functionReturnTypes: AsyncResultStringMap
  jsGlobalRoots: AsyncResultStringSet
  libraries: CCompilerLibrarySet
  asyncResultChainArrowWrappers: AsyncResultAnyNodeWrapperMap
  runtimeFunctionParams: AsyncResultFunctionTypeMap
}

type AsyncResultFunctionContext = AsyncResultEmitContext & {
  boxedVariables: AsyncResultStringSet
  cleanupEnabled: boolean
  cppValueTypes: AsyncResultStringMap
  eventLoopUsed: boolean
  explicitEventLoop: boolean
  externalEventLoop: boolean
  failureStatement?: string | null
  failureStatementUsed?: boolean
  localValueNames: AsyncResultStringSet
  functionTypes: AsyncResultFunctionTypeMap
  nextId: number
  objectShapes: AsyncResultObjectShapeMap
  ownedAsyncResults: string[]
  ownedValues: string[]
  asyncResultConstructorHandlers: AsyncResultConstructorHandlerMap
  asyncResultRejectionValueTypes: AsyncResultStringMap
  asyncResultValueTypes: AsyncResultStringMap
  returnType?: string
  runtimeCallbackCleanupLabel?: string
  runtimeCallbackReturnOut?: string
  runtimeCallbackReturnShape?: CObjectShape | null
  runtimeCallbackReturnType?: string
  runtimeCallbacks: AsyncResultStringSet
  runtimeStrings: AsyncResultStringSet
  statusReturn: boolean
  usedRuntimeCallbackCleanupGoto?: boolean
  variables: AsyncResultStringMap
}

function asyncResultBooleanValueIsTrue(value: boolean | null | undefined): boolean {
  if (value === null || typeof value === 'undefined') {
    return false
  }

  if (value) {
    return true
  }

  return false
}

function asyncResultNodeValueType(node: AsyncResultNode): string {
  const valueType = node.valueType

  if (valueType !== null && typeof valueType !== 'undefined') {
    return valueType
  }

  return 'unknown'
}

export function cAsyncResultOperationKind(
  expression: AnyNode | null | undefined
): LibraryAsyncResultOperationKind | null {
  if (expression === null || typeof expression === 'undefined') {
    return null
  }

  const kind = expression.libraryAsyncResultOperation

  if (
    kind === 'create' ||
    kind === 'fulfill' ||
    kind === 'reject' ||
    kind === 'map-fulfilled' ||
    kind === 'map-rejected'
  ) {
    return kind
  }

  return null
}

export function isAsyncResultConstructorExpression(expression: AnyNode | null | undefined): boolean {
  return expression?.type === 'NewExpression' && cAsyncResultOperationKind(expression) === 'create'
}

export function isAsyncResultChainExpression(expression: AnyNode | null | undefined): boolean {
  const kind = cAsyncResultOperationKind(expression)
  return expression?.type === 'CallExpression' && (kind === 'map-rejected' || kind === 'map-fulfilled')
}

type AsyncResultEventLoopFunctionContext = {
  externalEventLoopFunctions: Set<string>
  functionAsyncFlags: Map<string, boolean>
  functionReturnTypes: Map<string, string>
}

export function isPlainAsyncResultReturningFunctionName(name: string, context: AsyncResultEventLoopFunctionContext): boolean {
  return (
    context.functionReturnTypes.get(name) === 'async-result' &&
    !asyncResultBooleanValueIsTrue(context.functionAsyncFlags.get(name))
  )
}

export function isAsyncAsyncResultFunctionName(name: string, context: AsyncResultEventLoopFunctionContext): boolean {
  return (
    context.functionReturnTypes.get(name) === 'async-result' &&
    asyncResultBooleanValueIsTrue(context.functionAsyncFlags.get(name))
  )
}

export function functionTakesEventLoopParam(name: string, context: AsyncResultEventLoopFunctionContext): boolean {
  return (
    isPlainAsyncResultReturningFunctionName(name, context) ||
    isAsyncAsyncResultFunctionName(name, context) ||
    context.externalEventLoopFunctions.has(name)
  )
}

export function isAsyncResultReturningFunctionCallee(
  callee: AnyNode | null | undefined,
  context: AsyncResultEventLoopFunctionContext
): boolean {
  const name = asyncResultReferenceName(callee)

  return name !== null && typeof name !== 'undefined' && isPlainAsyncResultReturningFunctionName(name, context)
}

export function isExternalEventLoopFunctionCallee(
  callee: AnyNode | null | undefined,
  context: AsyncResultEventLoopFunctionContext
): boolean {
  const name = asyncResultReferenceName(callee)

  return name !== null && typeof name !== 'undefined' && functionTakesEventLoopParam(name, context)
}

export function resolveAsyncResultReturningFunctionValueType(
  callee: AnyNode | null | undefined,
  context: AsyncResultEmitContext
): string {
  const name = asyncResultReferenceName(callee)

  if (name === null || typeof name === 'undefined') {
    return 'unknown'
  }

  if (!isPlainAsyncResultReturningFunctionName(name, context)) {
    return 'unknown'
  }

  const valueType = context.functionReturnAsyncResultValueTypes.get(name)

  if (valueType !== null && typeof valueType !== 'undefined') {
    return valueType
  }

  return 'unknown'
}

export function resolveAsyncResultExpressionValueType(
  expression: AnyNode | null | undefined,
  context: AsyncResultFunctionContext
): string | null {
  if (expression === null || typeof expression === 'undefined') {
    return null
  }

  const directType = knownValueType(expression.asyncResultValueType)

  if (directType !== null && typeof directType !== 'undefined') {
    return directType
  }

  if (expression.type === 'CallExpression') {
    if (isAsyncResultReturningFunctionCallee(expression.callee, context)) {
      return knownValueType(resolveAsyncResultReturningFunctionValueType(expression.callee, context))
    }

    if (isAsyncFunctionCallee(expression.callee, context)) {
      return knownValueType(resolveCAsyncFunctionAwaitValueType(expression.callee, context))
    }
  }

  const expressionName = asyncResultReferenceName(expression)

  if (expressionName !== null && typeof expressionName !== 'undefined') {
    return knownValueType(context.asyncResultValueTypes.get(expressionName))
  }

  return null
}

export function knownValueType(valueType: string | null | undefined): string | null {
  if (valueType === null || typeof valueType === 'undefined' || valueType === 'unknown') {
    return null
  }

  if (valueType.startsWith('union<')) {
    return null
  }

  if (valueType === 'boolean') {
    return 'boolean'
  }

  if (valueType === 'bytes') {
    return 'bytes'
  }

  if (valueType === 'class') {
    return 'class'
  }

  if (valueType === 'function') {
    return 'function'
  }

  if (valueType === 'null') {
    return 'null'
  }

  if (valueType === 'number') {
    return 'number'
  }

  if (valueType === 'object') {
    return 'object'
  }

  if (valueType === 'optional') {
    return 'optional'
  }

  if (valueType === 'async-result') {
    return 'async-result'
  }

  if (valueType === 'string') {
    return 'string'
  }

  if (valueType === 'void') {
    return 'void'
  }

  return valueType
}

function optionalString(value: string | null | undefined): string {
  if (value === null || typeof value === 'undefined') {
    return ''
  }

  return value
}

function optionalBoolean(value: boolean | null | undefined): boolean {
  return asyncResultBooleanValueIsTrue(value)
}

export function isAsyncFunctionCallee(callee: AnyNode | null | undefined, context: AsyncResultEmitContext): boolean {
  const name = asyncResultReferenceName(callee)

  return name !== null && typeof name !== 'undefined' && asyncResultBooleanValueIsTrue(context.functionAsyncFlags.get(name))
}

export function resolveCAsyncFunctionAwaitValueType(
  callee: AnyNode | null | undefined,
  context: AsyncResultEmitContext
): string | null {
  const name = asyncResultReferenceName(callee)

  if (name === null || typeof name === 'undefined') {
    return null
  }

  if (!asyncResultBooleanValueIsTrue(context.functionAsyncFlags.get(name))) {
    return null
  }

  const libraries = cCompilerLibrarySetValue(context.libraries)
  const returnTypeRef = cTypeRefMapValue(context.functionReturnTypeRefs, name)

  try {
    const fulfilledTypeRef = typeRefTraitArgument(returnTypeRef, 'awaitable', 0, libraries)

    if (fulfilledTypeRef !== null) {
      return typeRefValueTypeOrNull(fulfilledTypeRef, libraries)
    }
  } catch {
    // Invalid descriptor templates are diagnosed by library-set validation.
  }

  const valueType = context.functionReturnAsyncResultValueTypes.get(name)

  if (valueType !== null && typeof valueType !== 'undefined') {
    return valueType
  }

  return 'unknown'
}

import { diagnostic } from '../../../diagnostics.ts'
import { collectIrTopLevelNodeEntries } from '../../../ir.ts'
import {
  emitEventLoopReference,
  emitFailureStatement,
  emitRuntimeTypeCheck,
  emitStatusCheck,
  nextCName,
  registerEventLoop,
  registerOwnedValue,
  registerOwnedAsyncResult
} from '../context.ts'
import { runtimeObjectLikeValueMismatchCondition } from '../runtime-values.ts'
import { isManagedRuntimeReturnType } from '../value-types.ts'
import { cClassNameFromValueType, emitCClassDescriptorNameForClassName } from '../values/classes.ts'
import { registerObjectShape } from '../values/objects.ts'

export type AsyncResultChainLoweringDependencies = {
  callbackLoweringDependencies: CallbackLoweringDependencies
  createFunctionContext(
    baseContext: AsyncResultEmitContext,
    returnType: string,
    returnNullable: boolean
  ): AsyncResultFunctionContext
  emitBoxedValueCleanup(context: AsyncResultFunctionContext): string[]
  emitBoxedValueDeclarations(context: AsyncResultFunctionContext): string[]
  emitErrorChannelDeclarations(context: AsyncResultFunctionContext): string[]
  emitLoopFlowDeclarations(context: AsyncResultFunctionContext): string[]
  emitOwnedValueCleanup(context: AsyncResultFunctionContext): string[]
  emitOwnedValueDeclarations(context: AsyncResultFunctionContext): string[]
  emitPreparedNumberExpression(expression: AnyNode, context: AsyncResultFunctionContext): PreparedExpression
  emitReturnFlowDeclarations(context: AsyncResultFunctionContext): string[]
  emitRuntimeArrowCallbackContextFinalizerDeclaration(wrapper: CCallbackContextWrapper): string[]
  emitRuntimeArrowCallbackContextLocals(
    wrapper: CCallbackContextWrapper,
    context: AsyncResultFunctionContext,
    deps: CallbackLoweringDependencies,
    contextParameterName?: string
  ): string[]
  emitRuntimeCallbackRuntimeValueReturnLines(argument: AnyNode, context: AsyncResultFunctionContext): string[]
  emitStatementList(statements: AnyNode[], context: AsyncResultFunctionContext): string[]
  isAsyncResultChainCallbackWrapperWithContext(wrapper: CAsyncResultChainWrapper | null | undefined): boolean
}

export type AsyncResultLoweringDependencies = {
  emitCValueExpression(expression: AnyNode, context: AsyncResultFunctionContext): PreparedExpression
  emitPreparedCompilerLibraryCallExpression(
    expression: AnyNode,
    context: AsyncResultFunctionContext,
    options?: PreparedCallOptions
  ): PreparedExpression | null
  emitPreparedAsyncFunctionAsyncResultCallExpression(
    expression: AnyNode | null | undefined,
    context: AsyncResultFunctionContext,
    options?: PreparedCallOptions
  ): PreparedExpression | null
  emitPreparedCallExpression(expression: AnyNode, context: AsyncResultFunctionContext): PreparedExpression
  emitRuntimeArrowCaptureStoreLines(
    capture: CRuntimeArrowCapture,
    contextName: string,
    context: AsyncResultFunctionContext
  ): string[]
  emitStatementList(statements: AnyNode[], context: AsyncResultFunctionContext): string[]
  inferExpressionType(expression: AnyNode, context: AsyncResultFunctionContext): string
  inferRejectedValueType(expression: AnyNode, context: AsyncResultFunctionContext): string
  isAsyncResultChainCallbackWrapperWithContext(wrapper: CAsyncResultChainWrapper | null | undefined): boolean
}

type AsyncResultChainArrowBody = {
  kind: string
  prefixStatements: AsyncResultNode[]
  returnExpression: AsyncResultNode | null
  statements: AsyncResultNode[]
}

type AsyncResultTopLevelNodeEntry = {
  kind: string
  node: AsyncResultNode
}

type AsyncResultCallbackContext = {
  lines: string[]
  expression: string
  finalizer: string
}

function asyncResultNodeArray(
  value: AsyncResultNode | AsyncResultNode[] | null | undefined
): AsyncResultNode[] {
  if (Array.isArray(value)) {
    return value
  }

  return []
}

function asyncResultNodeOrNull(
  value: AsyncResultNode | AsyncResultNode[] | null | undefined
): AsyncResultNode | null {
  if (value === null || typeof value === 'undefined' || Array.isArray(value)) {
    return null
  }

  return value
}

function asyncResultObjectShapeOrNull(
  shape: CObjectShape | null | undefined
): CObjectShape | null {
  if (shape === null || typeof shape === 'undefined') {
    return null
  }

  return shape
}

function asyncResultObjectShapeFields(
  fields: CObjectShapeField[] | null | undefined
): CObjectShapeField[] {
  if (Array.isArray(fields)) {
    return fields
  }

  return []
}

function asyncResultReferenceName(expression: AsyncResultNode | null | undefined): string | null {
  if (
    expression === null ||
    typeof expression === 'undefined' ||
    expression.type !== 'Reference' ||
    expression.path.length !== 1
  ) {
    return null
  }

  return expression.path[0] ?? null
}

export function emitPreparedAsyncResultStaticExpression(
  expression: AnyNode | null | undefined,
  context: AsyncResultFunctionContext,
  dependencies: AsyncResultLoweringDependencies,
  options: PreparedCallOptions = {}
): PreparedExpression | null {
  if (expression === null || typeof expression === 'undefined') {
    return null
  }

  const method = cAsyncResultOperationKind(expression)

  if ((method !== 'fulfill' && method !== 'reject') || typeof expression.libraryCExpression !== 'string') {
    return null
  }

  if (expression.valueType !== 'async-result') {
    return null
  }

  registerEventLoop(context)

  const rejectionValueType = asyncResultStaticRejectionValueType(method, expression, context, dependencies)
  const target = expression.libraryCExpression
  const argument = expression.args[0]
  const value = emitPreparedAsyncResultArgumentValue(argument, context, dependencies)
  const lines: string[] = []
  let call = `${target}()`

  if (argument !== null && typeof argument !== 'undefined') {
    appendLines(lines, value.lines)
    call = `${target}(${value.expression})`
  }

  if (
    options.owned === false &&
    (options.out === null || typeof options.out === 'undefined')
  ) {
    return {
      lines,
      expression: call,
      rejectionValueType
    }
  }

  const out = preparedAsyncResultOut(options, context, 'inox_async_result')

  if (options.owned !== false) {
    registerOwnedAsyncResult(context, out, expressionAsyncResultValueType(expression), rejectionValueType)
  }

  lines.push(`${out} = ${call};`)
  lines.push(emitAsyncResultRuntimeTypeCheck(out, context))

  return {
    lines,
    expression: out,
    rejectionValueType
  }
}

export function emitPreparedAsyncResultConstructorExpression(
  expression: AnyNode | null | undefined,
  context: AsyncResultFunctionContext,
  dependencies: AsyncResultLoweringDependencies,
  options: PreparedCallOptions = {}
): PreparedExpression | null {
  if (expression === null || typeof expression === 'undefined' || !isAsyncResultConstructorExpression(expression)) {
    return null
  }

  if (expression.valueType !== 'async-result') {
    return null
  }

  registerEventLoop(context)

  const out = preparedAsyncResultOut(options, context, 'inox_async_result')
  const executor = expression.args[0]
  const valueType = expressionAsyncResultValueType(expression)
  const rejectionValueType = asyncResultConstructorRejectionValueType(executor, context, dependencies)

  if (options.owned !== false) {
    registerOwnedAsyncResult(context, out, valueType, rejectionValueType)
  }

  const target = expression.libraryCExpression

  if (typeof target !== 'string') {
    return null
  }

  const lines = [`${out} = ${target}();`, emitAsyncResultRuntimeTypeCheck(out, context)]

  if (executor === null || typeof executor === 'undefined' || executor.type !== 'ArrowFunctionExpression') {
    context.diagnostics.push(
      diagnostic(
        'INOX_C_ASYNC',
        'async-result constructor currently supports only arrow-function executors in C',
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

  const resolveName = asyncResultExecutorParamName(executor, 0)
  const rejectName = asyncResultExecutorParamName(executor, 1)
  const statements = asyncResultExecutorStatements(executor)

  const fulfillExpression = expression.libraryCAsyncFulfillExpression
  const rejectExpression = expression.libraryCAsyncRejectExpression

  if (typeof fulfillExpression !== 'string' || typeof rejectExpression !== 'string') {
    return null
  }

  const handlerSnapshots = pushAsyncResultConstructorHandlers(
    context,
    resolveName,
    rejectName,
    out,
    fulfillExpression,
    rejectExpression
  )

  try {
    appendLines(lines, dependencies.emitStatementList(statements, context))
  } finally {
    restoreAsyncResultConstructorHandlers(context, handlerSnapshots)
  }

  return {
    lines,
    expression: out,
    valueType,
    rejectionValueType
  }
}

export function emitAsyncResultConstructorSettlementCall(
  expression: AnyNode | null | undefined,
  context: AsyncResultFunctionContext,
  dependencies: AsyncResultLoweringDependencies
): string[] | null {
  if (expression === null || typeof expression === 'undefined' || expression.type !== 'CallExpression') {
    return null
  }

  const handlerName = asyncResultReferenceName(expression.callee)

  if (handlerName === null || typeof handlerName === 'undefined') {
    return null
  }

  const handler = context.asyncResultConstructorHandlers.get(handlerName)

  if (handler === null || typeof handler === 'undefined') {
    return null
  }

  if (expression.args.length > 1) {
    context.diagnostics.push(
      diagnostic(
        'INOX_C_ASYNC',
        'async-result constructor settlement handlers currently support at most one argument in C',
        expression.loc
      )
    )
  }

  const value = emitPreparedAsyncResultArgumentValue(expression.args[0], context, dependencies)
  const lines: string[] = []
  appendLines(lines, value.lines)
  lines.push(`${asyncResultConstructorHandlerAsyncResult(handler)}.${handler.cExpression}(${value.expression});`)

  return lines
}

export function emitPreparedAsyncResultChainExpression(
  expression: AnyNode | null | undefined,
  context: AsyncResultFunctionContext,
  dependencies: AsyncResultLoweringDependencies,
  options: PreparedCallOptions = {}
): PreparedExpression | null {
  if (
    expression === null ||
    typeof expression === 'undefined' ||
    !isAsyncResultMethodCallExpression(expression, context, dependencies)
  ) {
    return null
  }

  const method = cAsyncResultOperationKind(expression)

  if (
    (method !== 'map-fulfilled' && method !== 'map-rejected') ||
    typeof expression.libraryCExpression !== 'string'
  ) {
    return null
  }
  const callback = expression.args[0]
  let wrapper: CAsyncResultChainWrapper | null = null

  if (callback !== null && typeof callback !== 'undefined') {
    const existingWrapper = context.asyncResultChainArrowWrappers.get(callback)

    if (existingWrapper !== null && typeof existingWrapper !== 'undefined') {
      wrapper = existingWrapper
    }
  }

  if (wrapper === null || typeof wrapper === 'undefined') {
    context.diagnostics.push(
      diagnostic(
        'INOX_C_ASYNC',
        'async-result chaining currently supports only non-capturing expression-body, single-return block-body, straight-line block-body or simple control-flow block-body arrow callbacks in C',
        expression.loc
      )
    )

    return {
      lines: [],
      expression: '0',
      valueType: expressionAsyncResultValueType(expression),
      rejectionValueType: 'unknown'
    }
  }

  const receiver = emitPreparedAsyncResultExpression(expression.callee.object, context, dependencies, {})

  if (receiver === null || typeof receiver === 'undefined') {
    context.diagnostics.push(
      diagnostic(
        'INOX_C_ASYNC',
        'this async-result chain receiver is not supported by the current C++ backend slice',
        expression.loc
      )
    )

    return {
      lines: [],
      expression: '0',
      valueType: expressionAsyncResultValueType(expression),
      rejectionValueType: 'unknown'
    }
  }

  const out = preparedAsyncResultOut(options, context, 'inox_async_result')
  const valueType = expressionAsyncResultValueType(expression)
  const rejectionValueType = asyncResultMethodRejectionValueType(method, receiver)
  const callbackContext = emitAsyncResultChainCallbackContext(wrapper, context, dependencies)
  const runtimeCall = asyncResultMethodRuntimeCall(
    expression.libraryCExpression,
    receiver,
    wrapper,
    callbackContext,
    out
  )
  const runtimeCallLines = asyncResultMethodRuntimeCallLines(runtimeCall, out, callbackContext, wrapper, context)

  if (options.owned !== false) {
    registerOwnedAsyncResult(context, out, valueType, rejectionValueType)
  }

  const lines: string[] = []
  appendLines(lines, preparedAsyncResultLines(receiver))
  appendLines(lines, callbackContext.lines)
  appendLines(lines, runtimeCallLines)

  return {
    lines,
    expression: out,
    valueType,
    rejectionValueType
  }
}

export function emitPreparedAsyncResultExpression(
  expression: AnyNode | null | undefined,
  context: AsyncResultFunctionContext,
  dependencies: AsyncResultLoweringDependencies,
  options: PreparedCallOptions = {}
): PreparedExpression | null {
  if (expression === null || typeof expression === 'undefined') {
    return null
  }

  const libraryCall = dependencies.emitPreparedCompilerLibraryCallExpression(expression, context, options)

  if (libraryCall !== null && expression.valueType === 'async-result') {
    return preparedAsyncResultWithValueType(
      libraryCall,
      resolvedAsyncResultExpressionValueType(expression, context, libraryCall.valueType)
    )
  }

  const asyncResultConstructor = emitPreparedAsyncResultConstructorExpression(expression, context, dependencies, options)

  if (asyncResultConstructor !== null && typeof asyncResultConstructor !== 'undefined') {
    return preparedAsyncResultWithValueType(
      asyncResultConstructor,
      resolvedAsyncResultExpressionValueType(expression, context, asyncResultConstructor.valueType)
    )
  }

  const asyncResultResolve = emitPreparedAsyncResultStaticExpression(expression, context, dependencies, options)

  if (asyncResultResolve !== null && typeof asyncResultResolve !== 'undefined') {
    return preparedAsyncResultWithValueType(asyncResultResolve, resolvedAsyncResultExpressionValueType(expression, context, null))
  }

  const asyncResultMethod = emitPreparedAsyncResultChainExpression(expression, context, dependencies, options)

  if (asyncResultMethod !== null && typeof asyncResultMethod !== 'undefined') {
    return preparedAsyncResultWithValueType(asyncResultMethod, resolvedAsyncResultExpressionValueType(expression, context, null))
  }

  const asyncAsyncResultCall = dependencies.emitPreparedAsyncFunctionAsyncResultCallExpression(expression, context, options)

  if (asyncAsyncResultCall !== null && typeof asyncAsyncResultCall !== 'undefined') {
    return preparedAsyncResultWithValueType(asyncAsyncResultCall, resolvedAsyncResultExpressionValueType(expression, context, null))
  }

  const asyncResultCall = emitPreparedAsyncResultReturningCallExpression(expression, context, dependencies, options)

  if (asyncResultCall !== null && typeof asyncResultCall !== 'undefined') {
    return asyncResultCall
  }

  if (
    expression.type === 'CallExpression' &&
    expression.valueType === 'async-result' &&
    expression.callee?.functionType?.returnType === 'async-result'
  ) {
    const runtimeCallbackCall = dependencies.emitPreparedCallExpression(expression, context)

    return preparedAsyncResultWithValueType(
      runtimeCallbackCall,
      resolvedAsyncResultExpressionValueType(expression, context, runtimeCallbackCall.valueType)
    )
  }

  const expressionName = asyncResultReferenceName(expression)

  if (expressionName !== null && typeof expressionName !== 'undefined') {
    if (context.variables.get(expressionName) === 'async-result') {
      return {
        lines: [],
        expression: expressionName,
        valueType: asyncResultContextValueType(context, expressionName),
        rejectionValueType: asyncResultContextRejectionValueType(context, expressionName)
      }
    }
  }

  return null
}

export function emitPreparedAsyncResultReturningCallExpression(
  expression: AnyNode | null | undefined,
  context: AsyncResultFunctionContext,
  dependencies: AsyncResultLoweringDependencies,
  options: PreparedCallOptions = {}
): PreparedExpression | null {
  if (expression === null || typeof expression === 'undefined' || expression.type !== 'CallExpression') {
    return null
  }

  if (!isAsyncResultReturningFunctionCallee(expression.callee, context)) {
    return null
  }

  const out = preparedAsyncResultOut(options, context, 'inox_async_result')
  const valueType = resolveAsyncResultReturningFunctionValueType(expression.callee, context)
  const call = dependencies.emitPreparedCallExpression(expression, context)

  if (options.owned !== false) {
    registerOwnedAsyncResult(context, out, valueType)
  }

  const lines: string[] = []
  appendLines(lines, call.lines)
  lines.push(`${out} = ${call.expression};`)
  lines.push(`if (!(${asyncResultValidExpression(context.libraries, out)})) ${emitFailureStatement(context)}`)

  return {
    lines,
    expression: out,
    valueType,
    rejectionValueType: 'unknown'
  }
}

function asyncResultValidExpression(libraries: CCompilerLibrarySet, source: string): string {
  return compilerLibraryIntrinsicAsyncResultCValidExpression(libraries, source)
}

function emitAsyncResultRuntimeTypeCheck(source: string, context: AsyncResultFunctionContext): string {
  return emitRuntimeTypeCheck(`!(${asyncResultValidExpression(context.libraries, source)})`, context)
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

function preparedAsyncResultOut(options: PreparedCallOptions, context: AsyncResultFunctionContext, prefix: string): string {
  const out = options.out

  if (out !== null && typeof out !== 'undefined') {
    return out
  }

  return nextCName(context, prefix)
}

function expressionAsyncResultValueType(expression: AnyNode): string {
  if (expression.asyncResultValueType !== null && typeof expression.asyncResultValueType !== 'undefined') {
    return expression.asyncResultValueType
  }

  return 'unknown'
}

function asyncResultStaticRejectionValueType(
  method: string | null,
  expression: AnyNode,
  context: AsyncResultFunctionContext,
  dependencies: AsyncResultLoweringDependencies
): string {
  if (method === 'reject') {
    const reason = expression.args[0]

    if (reason !== null && typeof reason !== 'undefined') {
      return dependencies.inferRejectedValueType(reason, context)
    }
  }

  return 'unknown'
}

function emitPreparedAsyncResultArgumentValue(
  argument: AnyNode | null | undefined,
  context: AsyncResultFunctionContext,
  dependencies: AsyncResultLoweringDependencies
): PreparedExpression {
  if (argument === null || typeof argument === 'undefined') {
    return {
      lines: [],
      expression: 'inox_undefined_value()'
    }
  }

  return emitPreparedAsyncResultRuntimeArgumentValue(dependencies.emitCValueExpression(argument, context), context)
}

function emitPreparedAsyncResultRuntimeArgumentValue(
  value: PreparedExpression,
  context: AsyncResultFunctionContext
): PreparedExpression {
  const className = cClassNameFromValueType(value.valueType)

  if (className === null || typeof className === 'undefined') {
    return value
  }

  const temp = nextCName(context, 'inox_class_instance')
  const lines: string[] = []

  appendLines(lines, value.lines)
  registerOwnedValue(context, temp)
  lines.push(
    emitStatusCheck(
      `inox_class_instance_ref_copy(&inox_default_allocator, &${emitCClassDescriptorNameForClassName(
        context,
        className
      )}, &${value.expression}, ${temp}.out())`,
      context
    )
  )

  return {
    lines,
    expression: temp,
    valueType: 'object'
  }
}

function asyncResultExecutorParamName(executor: AnyNode, index: number): string | null {
  const param = executor.params[index]

  if (param === null || typeof param === 'undefined') {
    return null
  }

  if (param.name !== null && typeof param.name !== 'undefined') {
    return param.name
  }

  return null
}

function asyncResultExecutorStatements(executor: AnyNode): AnyNode[] {
  const body = asyncResultNodeOrNull(executor.body)
  const bodyStatements = asyncResultNodeArray(executor.body)

  if (executor.expressionBody) {
    let loc: SourceLocation | null | undefined = executor.loc

    if (body !== null && body.loc !== null && typeof body.loc !== 'undefined') {
      loc = body.loc
    }

    return [
      {
        type: 'ExpressionStatement',
        expression: body,
        loc: loc
      }
    ]
  }

  if (bodyStatements.length > 0) {
    return bodyStatements
  }

  if (body !== null) {
    return asyncResultNodeArray(body.body)
  }

  return []
}

function asyncResultConstructorHandlerAsyncResult(handler: CAsyncResultConstructorHandler | null | undefined): string {
  if (handler === null || typeof handler === 'undefined') {
    return '0'
  }

  return handler.asyncResult
}

function preparedAsyncResultLines(prepared: PreparedExpression | null | undefined): string[] {
  if (prepared === null || typeof prepared === 'undefined') {
    return []
  }

  return prepared.lines
}

function preparedAsyncResultExpression(prepared: PreparedExpression | null | undefined): string {
  if (prepared === null || typeof prepared === 'undefined') {
    return '0'
  }

  return prepared.expression
}

function preparedAsyncResultRejectionValueType(prepared: PreparedExpression | null | undefined): string {
  if (prepared === null || typeof prepared === 'undefined') {
    return ''
  }

  return optionalString(prepared.rejectionValueType)
}

function asyncResultChainWrapperName(wrapper: CAsyncResultChainWrapper | null | undefined): string {
  if (wrapper === null || typeof wrapper === 'undefined') {
    return '0'
  }

  return wrapper.name
}

function asyncResultChainWrapperFinalizerName(wrapper: CAsyncResultChainWrapper | null | undefined): string {
  if (wrapper === null || typeof wrapper === 'undefined') {
    return '0'
  }

  return wrapper.finalizerName
}

function asyncResultMethodRejectionValueType(method: string, receiver: PreparedExpression | null | undefined): string {
  if (method === 'map-fulfilled') {
    const rejectionValueType = preparedAsyncResultRejectionValueType(receiver)

    if (rejectionValueType !== '') {
      return rejectionValueType
    }
  }

  return 'unknown'
}

function asyncResultMethodRuntimeCall(
  method: string,
  receiver: PreparedExpression | null | undefined,
  wrapper: CAsyncResultChainWrapper | null | undefined,
  callbackContext: AsyncResultCallbackContext,
  out: string
): string {
  const receiverExpression = preparedAsyncResultExpression(receiver)
  const wrapperName = asyncResultChainWrapperName(wrapper)

  return `${out} = ${receiverExpression}.${method}(${wrapperName}, ${callbackContext.expression}, ${callbackContext.finalizer});`
}

function asyncResultMethodRuntimeCallLines(
  runtimeCall: string,
  out: string,
  callbackContext: AsyncResultCallbackContext,
  wrapper: CAsyncResultChainWrapper | null | undefined,
  context: AsyncResultFunctionContext
): string[] {
  if (callbackContext.expression === '0') {
    return [runtimeCall, emitAsyncResultRuntimeTypeCheck(out, context)]
  }

  return [
    runtimeCall,
    `if (!(${asyncResultValidExpression(context.libraries, out)})) {`,
    `  ${asyncResultChainWrapperFinalizerName(wrapper)}(${callbackContext.expression});`,
    `  ${emitFailureStatement(context)}`,
    '}'
  ]
}

function preparedAsyncResultWithValueType(prepared: PreparedExpression, valueType: string): PreparedExpression {
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

function resolvedAsyncResultExpressionValueType(
  expression: AnyNode,
  context: AsyncResultFunctionContext,
  fallback: string | null | undefined
): string {
  const resolved = resolveAsyncResultExpressionValueType(expression, context)

  if (resolved !== null && typeof resolved !== 'undefined') {
    return resolved
  }

  if (fallback !== null && typeof fallback !== 'undefined') {
    return fallback
  }

  return 'unknown'
}

function asyncResultContextValueType(context: AsyncResultFunctionContext, name: string): string {
  const valueType = context.asyncResultValueTypes.get(name)

  if (valueType !== null && typeof valueType !== 'undefined') {
    return valueType
  }

  return 'unknown'
}

function asyncResultContextRejectionValueType(context: AsyncResultFunctionContext, name: string): string {
  const valueType = context.asyncResultRejectionValueTypes.get(name)

  if (valueType !== null && typeof valueType !== 'undefined') {
    return valueType
  }

  return 'unknown'
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

function asyncResultCallbackReturnType(callback: AnyNode, expression: AnyNode): string {
  const callbackReturnType = knownAsyncResultValueType(callback.returnType)

  if (callbackReturnType !== null && typeof callbackReturnType !== 'undefined') {
    return callbackReturnType
  }

  const bodyReturnType = asyncResultCallbackBodyReturnType(callback)

  if (bodyReturnType !== null && typeof bodyReturnType !== 'undefined') {
    return bodyReturnType
  }

  const expressionValueType = knownAsyncResultValueType(expression.asyncResultValueType)

  if (expressionValueType !== null && typeof expressionValueType !== 'undefined') {
    return expressionValueType
  }

  return 'unknown'
}

function knownAsyncResultValueType(valueType: string | null | undefined): string | null {
  if (valueType !== null && typeof valueType !== 'undefined' && valueType !== 'unknown') {
    return valueType
  }

  return null
}

function asyncResultCallbackBodyReturnType(callback: AnyNode): string | null {
  const expression = asyncResultCallbackReturnExpression(callback)

  if (expression === null || typeof expression === 'undefined') {
    return null
  }

  const valueType = knownAsyncResultValueType(expression.valueType)

  if (valueType !== null && typeof valueType !== 'undefined') {
    return valueType
  }

  return asyncResultCallbackParamMemberReturnType(callback, expression)
}

function asyncResultCallbackReturnExpression(callback: AnyNode): AnyNode | null {
  const body = resolveAsyncResultChainArrowBody(callback)

  if (body === null || typeof body === 'undefined' || body.kind !== 'prepared-return') {
    return null
  }

  return body.returnExpression
}

function asyncResultCallbackParamMemberReturnType(callback: AnyNode, expression: AnyNode): string | null {
  const field = asyncResultCallbackParamMemberShapeField(callback, expression)

  if (field !== null && typeof field !== 'undefined') {
    return knownAsyncResultValueType(field.valueType)
  }

  return null
}

function asyncResultCallbackParamMemberShapeField(
  callback: AnyNode,
  expression: AnyNode
): CObjectShapeField | null {
  const object = asyncResultNodeOrNull(expression.object)

  if (
    expression.type !== 'MemberExpression' ||
    object === null ||
    object.type !== 'Reference' ||
    object.path.length !== 1
  ) {
    return null
  }

  const paramName = object.path[0]
  const param = asyncResultCallbackParamByName(callback, paramName)

  if (param === null || typeof param === 'undefined') {
    return null
  }

  return asyncResultShapeFieldByName(param.shape, expression.property)
}

function asyncResultCallbackParamByName(callback: AnyNode, name: string): AnyNode | null {
  const params = asyncResultNodeArray(callback.params)

  for (let index = 0; index < params.length; index = index + 1) {
    const param = params[index]

    if (param.name === name) {
      return param
    }
  }

  return null
}

function asyncResultShapeFieldByName(shape: CObjectShape | null | undefined, name: string): CObjectShapeField | null {
  if (shape === null || typeof shape === 'undefined') {
    return null
  }

  const fields = asyncResultObjectShapeFields(shape.fields)

  for (let index = 0; index < fields.length; index = index + 1) {
    const field = fields[index]

    if (field.name === name) {
      return field
    }
  }

  return null
}

function asyncResultCallbackReturnShape(callback: AnyNode): CObjectShape | null {
  const returnShape = asyncResultObjectShapeOrNull(callback.returnShape)

  if (returnShape !== null) {
    return returnShape
  }

  const expression = asyncResultCallbackReturnExpression(callback)

  if (expression === null || typeof expression === 'undefined') {
    return null
  }

  const expressionShape = asyncResultObjectShapeOrNull(expression.shape)

  if (expressionShape !== null) {
    return expressionShape
  }

  const field = asyncResultCallbackParamMemberShapeField(callback, expression)

  if (field !== null && typeof field !== 'undefined') {
    return asyncResultObjectShapeOrNull(field.shape)
  }

  return null
}

function callbackParamValueType(param: AnyNode): string {
  if (param.valueType !== null && typeof param.valueType !== 'undefined') {
    return param.valueType
  }

  return 'unknown'
}

function asyncResultChainCallbackBodyStatements(callback: AsyncResultNode): AsyncResultNode[] | null {
  const bodyStatements = asyncResultNodeArray(callback.body)

  if (Array.isArray(callback.body)) {
    return bodyStatements
  }

  const body = asyncResultNodeOrNull(callback.body)

  if (body !== null && body.type === 'BlockStatement') {
    return asyncResultNodeArray(body.body)
  }

  return null
}

function lastAsyncResultChainCallbackStatement(statements: AsyncResultNode[] | null | undefined): AsyncResultNode | null {
  if (statements === null || typeof statements === 'undefined' || statements.length === 0) {
    return null
  }

  return statements[statements.length - 1]
}

function asyncResultChainCallbackStatementsBeforeLast(statements: AsyncResultNode[] | null | undefined): AsyncResultNode[] {
  const result: AsyncResultNode[] = []

  if (statements === null || typeof statements === 'undefined') {
    return result
  }

  for (let index = 0; index < statements.length - 1; index = index + 1) {
    const statement = statements[index]

    if (statement !== null && typeof statement !== 'undefined') {
      result.push(statement)
    }
  }

  return result
}

function asyncResultReturnStatementArgument(statement: AsyncResultNode | null | undefined): AsyncResultNode | null {
  if (statement === null || typeof statement === 'undefined') {
    return null
  }

  if (statement.argument !== null && typeof statement.argument !== 'undefined') {
    return statement.argument
  }

  return null
}

function asyncResultStatementsOrEmpty(statements: AsyncResultNode[] | null | undefined): AsyncResultNode[] {
  if (statements === null || typeof statements === 'undefined') {
    return []
  }

  return statements
}

function allStraightLineAsyncResultCallbackStatements(statements: AsyncResultNode[] | null | undefined): boolean {
  if (statements === null || typeof statements === 'undefined') {
    return false
  }

  for (let index = 0; index < statements.length; index = index + 1) {
    const statement = statements[index]

    if (!isStraightLineAsyncResultCallbackStatement(statement)) {
      return false
    }
  }

  return true
}

function allAsyncResultChainCallbackStatements(statements: AsyncResultNode[] | null | undefined): boolean {
  if (statements === null || typeof statements === 'undefined') {
    return false
  }

  for (let index = 0; index < statements.length; index = index + 1) {
    const statement = statements[index]

    if (!isAsyncResultChainCallbackStatement(statement)) {
      return false
    }
  }

  return true
}

function pushAsyncResultConstructorHandlers(
  context: AsyncResultFunctionContext,
  resolveName: string | null,
  rejectName: string | null,
  asyncResult: string,
  fulfillExpression: string,
  rejectExpression: string
): AsyncResultConstructorHandlerSnapshot[] {
  const snapshots: AsyncResultConstructorHandlerSnapshot[] = []

  if (resolveName !== null && typeof resolveName !== 'undefined') {
    snapshots.push({
      name: resolveName,
      previous: asyncResultConstructorHandlerOrNull(context.asyncResultConstructorHandlers.get(resolveName))
    })
    context.asyncResultConstructorHandlers.set(resolveName, {
      cExpression: fulfillExpression,
      kind: 'fulfill',
      asyncResult: asyncResult
    })
  }

  if (rejectName !== null && typeof rejectName !== 'undefined') {
    snapshots.push({
      name: rejectName,
      previous: asyncResultConstructorHandlerOrNull(context.asyncResultConstructorHandlers.get(rejectName))
    })
    context.asyncResultConstructorHandlers.set(rejectName, {
      cExpression: rejectExpression,
      kind: 'reject',
      asyncResult: asyncResult
    })
  }

  return snapshots
}

function restoreAsyncResultConstructorHandlers(
  context: AsyncResultFunctionContext,
  snapshots: AsyncResultConstructorHandlerSnapshot[]
): void {
  for (let index = 0; index < snapshots.length; index = index + 1) {
    const snapshot = snapshots[index]
    const previous = snapshot.previous

    if (previous === null || typeof previous === 'undefined') {
      context.asyncResultConstructorHandlers.delete(snapshot.name)
    } else {
      context.asyncResultConstructorHandlers.set(snapshot.name, previous)
    }
  }
}

function asyncResultConstructorHandlerOrNull(
  value: CAsyncResultConstructorHandler | null | undefined
): CAsyncResultConstructorHandler | null {
  if (value === null || typeof value === 'undefined') {
    return null
  }

  return value
}

function asyncResultConstructorRejectionValueType(
  executor: AnyNode | null | undefined,
  context: AsyncResultFunctionContext,
  dependencies: AsyncResultLoweringDependencies
): string {
  if (executor === null || typeof executor === 'undefined' || executor.type !== 'ArrowFunctionExpression') {
    return 'unknown'
  }

  const rejectName = optionalString(asyncResultExecutorParamName(executor, 1))

  if (rejectName === '') {
    return 'unknown'
  }

  const types: string[] = []
  visitAsyncResultConstructorRejectionNode(executor.body, rejectName, types, context, dependencies)

  return uniqueValueTypes(types)
}

function visitAsyncResultConstructorRejectionNode(
  node: AnyNode | AnyNode[] | null | undefined,
  rejectName: string,
  types: string[],
  context: AsyncResultFunctionContext,
  dependencies: AsyncResultLoweringDependencies
): void {
  if (node === null || typeof node === 'undefined') {
    return
  }

  if (Array.isArray(node)) {
    for (let index = 0; index < node.length; index = index + 1) {
      const item = node[index]

      visitAsyncResultConstructorRejectionNode(item, rejectName, types, context, dependencies)
    }
    return
  }

  const current = node

  if (current.type === 'CallExpression' && asyncResultReferenceName(current.callee) === rejectName) {
    const rejectedValue = current.args[0]

    if (rejectedValue !== null && typeof rejectedValue !== 'undefined') {
      types.push(dependencies.inferRejectedValueType(rejectedValue, context))
    }
  }

  visitAsyncResultConstructorRejectionChildren(current, rejectName, types, context, dependencies)
}

function visitAsyncResultConstructorRejectionChildren(
  current: AnyNode,
  rejectName: string,
  types: string[],
  context: AsyncResultFunctionContext,
  dependencies: AsyncResultLoweringDependencies
): void {
  if (current.type === 'BlockStatement') {
    visitAsyncResultConstructorRejectionNode(current.body, rejectName, types, context, dependencies)
    return
  }

  if (current.type === 'ExpressionStatement') {
    visitAsyncResultConstructorRejectionNode(current.expression, rejectName, types, context, dependencies)
    return
  }

  if (current.type === 'VariableDeclaration') {
    visitAsyncResultConstructorRejectionNode(current.init, rejectName, types, context, dependencies)
    return
  }

  if (current.type === 'ReturnStatement' || current.type === 'ThrowStatement') {
    visitAsyncResultConstructorRejectionNode(current.argument, rejectName, types, context, dependencies)
    return
  }

  if (
    current.type === 'CallExpression' ||
    current.type === 'NewExpression' ||
    current.type === 'OptionalCallExpression'
  ) {
    visitAsyncResultConstructorRejectionNode(current.args, rejectName, types, context, dependencies)
    return
  }

  if (current.type === 'AssignmentExpression') {
    visitAsyncResultConstructorRejectionNode(current.target, rejectName, types, context, dependencies)
    visitAsyncResultConstructorRejectionNode(current.value, rejectName, types, context, dependencies)
    return
  }

  if (current.type === 'BinaryExpression') {
    visitAsyncResultConstructorRejectionNode(current.left, rejectName, types, context, dependencies)
    visitAsyncResultConstructorRejectionNode(current.right, rejectName, types, context, dependencies)
    return
  }

  if (current.type === 'UnaryExpression' || current.type === 'UpdateExpression' || current.type === 'AwaitExpression') {
    visitAsyncResultConstructorRejectionNode(current.argument, rejectName, types, context, dependencies)
    return
  }

  if (current.type === 'MemberExpression' || current.type === 'OptionalMemberExpression') {
    visitAsyncResultConstructorRejectionNode(current.object, rejectName, types, context, dependencies)
    return
  }

  if (current.type === 'IndexExpression' || current.type === 'OptionalIndexExpression') {
    visitAsyncResultConstructorRejectionNode(current.object, rejectName, types, context, dependencies)
    visitAsyncResultConstructorRejectionNode(current.index, rejectName, types, context, dependencies)
    return
  }

  if (current.type === 'ArrayLiteral') {
    visitAsyncResultConstructorRejectionNode(current.elements, rejectName, types, context, dependencies)
    return
  }

  if (current.type === 'ObjectLiteral') {
    for (let index = 0; index < current.properties.length; index = index + 1) {
      const property = current.properties[index]

      visitAsyncResultConstructorRejectionNode(property.value, rejectName, types, context, dependencies)
    }
    return
  }

  if (current.type === 'IfStatement') {
    visitAsyncResultConstructorRejectionNode(current.condition, rejectName, types, context, dependencies)
    visitAsyncResultConstructorRejectionNode(current.consequent, rejectName, types, context, dependencies)
    visitAsyncResultConstructorRejectionNode(current.alternate, rejectName, types, context, dependencies)
    return
  }

  if (current.type === 'WhileStatement') {
    visitAsyncResultConstructorRejectionNode(current.condition, rejectName, types, context, dependencies)
    visitAsyncResultConstructorRejectionNode(current.body, rejectName, types, context, dependencies)
    return
  }

  if (current.type === 'ForStatement') {
    visitAsyncResultConstructorRejectionNode(current.init, rejectName, types, context, dependencies)
    visitAsyncResultConstructorRejectionNode(current.test, rejectName, types, context, dependencies)
    visitAsyncResultConstructorRejectionNode(current.update, rejectName, types, context, dependencies)
    visitAsyncResultConstructorRejectionNode(current.body, rejectName, types, context, dependencies)
    return
  }

  if (current.type === 'ForOfStatement') {
    visitAsyncResultConstructorRejectionNode(current.iterable, rejectName, types, context, dependencies)
    visitAsyncResultConstructorRejectionNode(current.body, rejectName, types, context, dependencies)
    return
  }

  if (current.type === 'SwitchStatement') {
    visitAsyncResultConstructorRejectionNode(current.discriminant, rejectName, types, context, dependencies)

    for (let index = 0; index < current.cases.length; index = index + 1) {
      const item = current.cases[index]

      visitAsyncResultConstructorRejectionNode(item.test, rejectName, types, context, dependencies)
      visitAsyncResultConstructorRejectionNode(item.consequent, rejectName, types, context, dependencies)
    }
    return
  }

  if (current.type === 'TryStatement') {
    visitAsyncResultConstructorRejectionNode(current.block, rejectName, types, context, dependencies)

    if (current.handler !== null && typeof current.handler !== 'undefined') {
      visitAsyncResultConstructorRejectionNode(current.handler.body, rejectName, types, context, dependencies)
    }

    visitAsyncResultConstructorRejectionNode(current.finalizer, rejectName, types, context, dependencies)
  }
}

function uniqueValueTypes(types: string[]): string {
  if (types.length === 0) {
    return 'unknown'
  }

  const first = types[0]

  for (let index = 0; index < types.length; index = index + 1) {
    const valueType = types[index]

    if (valueType !== first) {
      return 'unknown'
    }
  }

  return first
}

function emitAsyncResultChainCallbackContext(
  wrapper: CAsyncResultChainWrapper | null | undefined,
  context: AsyncResultFunctionContext,
  dependencies: AsyncResultLoweringDependencies
): AsyncResultCallbackContext {
  if (
    wrapper === null ||
    typeof wrapper === 'undefined' ||
    !dependencies.isAsyncResultChainCallbackWrapperWithContext(wrapper)
  ) {
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
          'mutable async-result callback captures are outside the current C++ backend MVP; use const captures or move mutation outside the callback',
          wrapper.expression.loc
        )
      )
    }

    if (!isSupportedAsyncResultCaptureValueType(capture.valueType)) {
      context.diagnostics.push(
        diagnostic(
          'INOX_C_ASYNC',
          'capturing async-result callbacks currently support only const number/boolean/string/object bindings',
          wrapper.expression.loc
        )
      )
    }
  }

  const contextName = nextCName(context, 'inox_async_result_callback_ctx')

  lines.push(
    `${wrapper.contextTypeName}* ${contextName} = (${wrapper.contextTypeName}*)inox_default_alloc(0, sizeof(${wrapper.contextTypeName}), _Alignof(${wrapper.contextTypeName}));`
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

function isAsyncResultMethodCallExpression(
  expression: AnyNode | null | undefined,
  context: AsyncResultFunctionContext,
  dependencies: AsyncResultLoweringDependencies
): boolean {
  if (expression === null || typeof expression === 'undefined' || expression.type !== 'CallExpression') {
    return false
  }

  if (!isAsyncResultChainExpression(expression)) {
    return false
  }

  return dependencies.inferExpressionType(expression.callee.object, context) === 'async-result'
}

export function collectAsyncResultChainWrappers(
  irPrograms: IrProgram[],
  context: AsyncResultEmitContext,
  deps: AsyncResultChainLoweringDependencies
): Map<string, CAsyncResultChainWrapper> {
  const wrappers: Map<string, CAsyncResultChainWrapper> = new Map()

  for (let irIndex = 0; irIndex < irPrograms.length; irIndex = irIndex + 1) {
    const ir = irPrograms[irIndex]
    const topLevelScope: CallbackScope = new Map()
    const entries: AsyncResultTopLevelNodeEntry[] = collectIrTopLevelNodeEntries(ir)

    for (let entryIndex = 0; entryIndex < entries.length; entryIndex = entryIndex + 1) {
      const item: AsyncResultTopLevelNodeEntry = entries[entryIndex]

      if (item.kind === 'function') {
        const scope: CallbackScope = new Map()
        declareAsyncResultCallbackParams(scope, item.node.params)
        const functionScopes: CallbackScope[] = [topLevelScope, scope]

        for (let statementIndex = 0; statementIndex < item.node.body.length; statementIndex = statementIndex + 1) {
          const statement = item.node.body[statementIndex]

          visitAsyncResultChainStatement(statement, functionScopes, wrappers, context, deps)
        }
      } else if (item.kind === 'statement') {
        visitAsyncResultChainStatement(item.node, [topLevelScope], wrappers, context, deps)
      }
    }
  }

  return wrappers
}

function declareAsyncResultCallbackBinding(scope: CallbackScope, name: string, info: CallbackScopeBinding): void {
  scope.set(name, info)
}

function declareAsyncResultCallbackParams(scope: CallbackScope, params: AnyNode[]): void {
  for (let index = 0; index < params.length; index = index + 1) {
    const param = params[index]
    const valueType = asyncResultNodeValueType(param)

    declareAsyncResultCallbackBinding(scope, param.name, {
      name: param.name,
      valueType,
      functionType: param.functionType,
      nullable: param.nullable === true,
      shape: param.shape,
      runtimeManaged: isAsyncResultRuntimeManagedValueType(valueType),
      mutable: false
    })
  }
}

function lookupAsyncResultCallbackBinding(name: string, scopes: CallbackScope[]): CallbackScopeBinding | null {
  for (let index = scopes.length - 1; index >= 0; index = index - 1) {
    const scope = scopes[index]

    if (!scope.has(name)) {
      continue
    }

    const entry = scope.get(name)

    if (entry !== null && typeof entry !== 'undefined') {
      return entry
    }
  }

  return null
}

function isAsyncResultRuntimeManagedValueType(valueType: string): boolean {
  return valueType === 'string' || valueType === 'object'
}

function isSupportedAsyncResultCaptureValueType(valueType: string): boolean {
  return valueType === 'number' || valueType === 'boolean' || isAsyncResultRuntimeManagedValueType(valueType)
}

function isRuntimeManagedCaptureBinding(statement: AnyNode, scopes: CallbackScope[], valueType: string): boolean {
  if (valueType === 'object') {
    return true
  }

  if (valueType !== 'string') {
    return false
  }

  if (statement.init !== null && typeof statement.init !== 'undefined' && statement.init.type === 'StringLiteral') {
    return false
  }

  if (
    statement.init !== null &&
    typeof statement.init !== 'undefined' &&
    statement.init.type === 'TemplateLiteral' &&
    !statement.init.raw.includes('${')
  ) {
    return false
  }

  const initName = asyncResultReferenceName(statement.init)

  if (initName !== null && typeof initName !== 'undefined') {
    const binding = lookupAsyncResultCallbackBinding(initName, scopes)

    if (binding !== null && typeof binding !== 'undefined' && binding.runtimeManaged === true) {
      return true
    }

    return false
  }

  return true
}

function declareAsyncResultCallbackVariable(scope: CallbackScope, statement: AnyNode, scopes: CallbackScope[]): void {
  const mutable = statement.kind === 'let'
  const valueType = asyncResultNodeValueType(statement)
  const runtimeManaged = isRuntimeManagedCaptureBinding(statement, scopes, valueType)
  let declaration: AnyNode | null = null

  if (mutable) {
    declaration = statement
  }

  declareAsyncResultCallbackBinding(scope, statement.name, {
    name: statement.name,
    valueType,
    declaration: declaration,
    functionType: statement.functionType,
    nullable: statement.nullable === true,
    shape: statement.shape,
    runtimeManaged: runtimeManaged,
    mutable: mutable
  })
}

function registerAsyncResultChainExpression(
  expression: AnyNode,
  scopes: CallbackScope[],
  wrappers: Map<string, CAsyncResultChainWrapper>,
  context: AsyncResultEmitContext,
  deps: AsyncResultChainLoweringDependencies
): void {
  if (!isAsyncResultChainExpression(expression)) {
    return
  }

  const callback = expression.args[0]

  if (callback === null || typeof callback === 'undefined' || callback.type !== 'ArrowFunctionExpression') {
    return
  }

  if (callback.params.length > 1) {
    return
  }

  if (!resolveAsyncResultChainArrowBody(callback)) {
    return
  }

  if (context.asyncResultChainArrowWrappers.has(callback)) {
    return
  }

  const index = wrappers.size
  const key = `asyncResult-chain-arrow:${index}`
  const captures = collectArrowCaptures(callback, scopes, context, deps.callbackLoweringDependencies)
  for (let captureIndex = 0; captureIndex < captures.length; captureIndex = captureIndex + 1) {
    const capture = captures[captureIndex]
    const declaration = capture.declaration

    if (
      asyncResultBooleanValueIsTrue(capture.mutable) &&
      isAsyncResultRuntimeManagedOrScalarCapture(capture.valueType) &&
      declaration !== null &&
      typeof declaration !== 'undefined'
    ) {
      context.boxedMutableCaptureDeclarations.add(declaration)
    }
  }

  const returnType = asyncResultCallbackReturnType(callback, expression)
  const returnShape = asyncResultCallbackReturnShape(callback)
  const needsEventLoop = functionUsesExternalEventLoop(
    callback,
    context.externalEventLoopFunctions,
    deps.callbackLoweringDependencies
  )
  const wrapper: CAsyncResultChainWrapper = {
    kind: 'asyncResult-chain-arrow',
    key: key,
    name: `inox_async_result_chain_arrow_${index}`,
    contextTypeName: `inox_async_result_chain_context_${index}`,
    finalizerName: `inox_async_result_chain_context_${index}_finalize`,
    expression: callback,
    returnType: returnType,
    returnShape: returnShape,
    needsEventLoop: needsEventLoop,
    captures: captures
  }

  wrappers.set(key, wrapper)
  context.asyncResultChainArrowWrappers.set(callback, wrapper)
}

function isAsyncResultRuntimeManagedOrScalarCapture(valueType: string): boolean {
  return valueType === 'number' || valueType === 'boolean' || valueType === 'string' || valueType === 'object'
}

function visitAsyncResultChainStatement(
  statement: AnyNode | null | undefined,
  scopes: CallbackScope[],
  wrappers: Map<string, CAsyncResultChainWrapper>,
  context: AsyncResultEmitContext,
  deps: AsyncResultChainLoweringDependencies
): void {
  if (statement === null || typeof statement === 'undefined') {
    return
  }

  if (statement.type === 'VariableDeclaration') {
    visitAsyncResultChainExpression(statement.init, scopes, wrappers, context, deps)
    const scope = scopes[scopes.length - 1]

    if (scope === null || typeof scope === 'undefined') {
      throw new Error('async result callback scope is missing')
    }

    declareAsyncResultCallbackVariable(scope, statement, scopes)
    return
  }

  if (statement.type === 'ExpressionStatement') {
    visitAsyncResultChainExpression(statement.expression, scopes, wrappers, context, deps)
    return
  }

  if (statement.type === 'ReturnStatement' || statement.type === 'ThrowStatement') {
    visitAsyncResultChainExpression(statement.argument, scopes, wrappers, context, deps)
    return
  }

  if (statement.type === 'BlockStatement') {
    const scope: CallbackScope = new Map()
    const blockScopes = appendCallbackScope(scopes, scope)

    for (let index = 0; index < statement.body.length; index = index + 1) {
      const item = statement.body[index]

      visitAsyncResultChainStatement(item, blockScopes, wrappers, context, deps)
    }
    return
  }

  if (statement.type === 'IfStatement') {
    visitAsyncResultChainExpression(statement.condition, scopes, wrappers, context, deps)
    visitAsyncResultChainStatement(statement.consequent, scopes, wrappers, context, deps)
    visitAsyncResultChainStatement(statement.alternate, scopes, wrappers, context, deps)
    return
  }

  if (statement.type === 'WhileStatement') {
    visitAsyncResultChainExpression(statement.condition, scopes, wrappers, context, deps)
    visitAsyncResultChainStatement(statement.body, scopes, wrappers, context, deps)
    return
  }

  if (statement.type === 'ForStatement') {
    const scope: CallbackScope = new Map()
    const loopScopes = appendCallbackScope(scopes, scope)

    if (
      statement.init !== null &&
      typeof statement.init !== 'undefined' &&
      statement.init.type === 'VariableDeclaration'
    ) {
      visitAsyncResultChainStatement(statement.init, loopScopes, wrappers, context, deps)
    } else {
      visitAsyncResultChainExpression(statement.init, loopScopes, wrappers, context, deps)
    }

    visitAsyncResultChainExpression(statement.test, loopScopes, wrappers, context, deps)
    visitAsyncResultChainExpression(statement.update, loopScopes, wrappers, context, deps)
    visitAsyncResultChainStatement(statement.body, loopScopes, wrappers, context, deps)
    return
  }

  if (statement.type === 'ForOfStatement') {
    visitAsyncResultChainExpression(statement.iterable, scopes, wrappers, context, deps)
    const scope: CallbackScope = new Map()
    declareAsyncResultCallbackBinding(scope, statement.name, {
      name: statement.name,
      valueType: 'unknown',
      mutable: statement.kind === 'let'
    })
    visitAsyncResultChainStatement(statement.body, appendCallbackScope(scopes, scope), wrappers, context, deps)
    return
  }

  if (statement.type === 'SwitchStatement') {
    visitAsyncResultChainExpression(statement.discriminant, scopes, wrappers, context, deps)

    for (let index = 0; index < statement.cases.length; index = index + 1) {
      const item = statement.cases[index]
      const consequent = asyncResultNodeArray(item.consequent)

      visitAsyncResultChainExpression(item.test, scopes, wrappers, context, deps)
      const scope: CallbackScope = new Map()
      const caseScopes = appendCallbackScope(scopes, scope)

      for (let consequentIndex = 0; consequentIndex < consequent.length; consequentIndex = consequentIndex + 1) {
        const caseStatement = consequent[consequentIndex]

        visitAsyncResultChainStatement(caseStatement, caseScopes, wrappers, context, deps)
      }
    }
    return
  }

  if (statement.type === 'TryStatement') {
    visitAsyncResultChainStatement(statement.block, scopes, wrappers, context, deps)

    if (statement.handler !== null && typeof statement.handler !== 'undefined') {
      visitAsyncResultChainStatement(statement.handler.body, scopes, wrappers, context, deps)
    }

    visitAsyncResultChainStatement(statement.finalizer, scopes, wrappers, context, deps)
  }
}

function visitAsyncResultChainExpression(
  expression: AnyNode | null | undefined,
  scopes: CallbackScope[],
  wrappers: Map<string, CAsyncResultChainWrapper>,
  context: AsyncResultEmitContext,
  deps: AsyncResultChainLoweringDependencies
): void {
  if (expression === null || typeof expression === 'undefined') {
    return
  }

  if (expression.type === 'CallExpression') {
    registerAsyncResultChainExpression(expression, scopes, wrappers, context, deps)
    visitAsyncResultChainExpression(expression.callee, scopes, wrappers, context, deps)

    for (let index = 0; index < expression.args.length; index = index + 1) {
      const arg = expression.args[index]

      visitAsyncResultChainExpression(arg, scopes, wrappers, context, deps)
    }
    return
  }

  if (expression.type === 'OptionalCallExpression' || expression.type === 'NewExpression') {
    visitAsyncResultChainExpression(expression.callee, scopes, wrappers, context, deps)

    for (let index = 0; index < expression.args.length; index = index + 1) {
      const arg = expression.args[index]

      visitAsyncResultChainExpression(arg, scopes, wrappers, context, deps)
    }
    return
  }

  if (expression.type === 'AssignmentExpression') {
    visitAsyncResultChainExpression(expression.target, scopes, wrappers, context, deps)
    visitAsyncResultChainExpression(expression.value, scopes, wrappers, context, deps)
    return
  }

  if (expression.type === 'BinaryExpression') {
    visitAsyncResultChainExpression(expression.left, scopes, wrappers, context, deps)
    visitAsyncResultChainExpression(expression.right, scopes, wrappers, context, deps)
    return
  }

  if (
    expression.type === 'UnaryExpression' ||
    expression.type === 'UpdateExpression' ||
    expression.type === 'AwaitExpression'
  ) {
    visitAsyncResultChainExpression(expression.argument, scopes, wrappers, context, deps)
    return
  }

  if (expression.type === 'MemberExpression' || expression.type === 'OptionalMemberExpression') {
    visitAsyncResultChainExpression(expression.object, scopes, wrappers, context, deps)
    return
  }

  if (expression.type === 'IndexExpression' || expression.type === 'OptionalIndexExpression') {
    visitAsyncResultChainExpression(expression.object, scopes, wrappers, context, deps)
    visitAsyncResultChainExpression(expression.index, scopes, wrappers, context, deps)
    return
  }

  if (expression.type === 'ArrayLiteral') {
    for (let index = 0; index < expression.elements.length; index = index + 1) {
      const element = expression.elements[index]

      visitAsyncResultChainExpression(element, scopes, wrappers, context, deps)
    }
    return
  }

  if (expression.type === 'ObjectLiteral') {
    for (let index = 0; index < expression.properties.length; index = index + 1) {
      const property = expression.properties[index]

      visitAsyncResultChainExpression(property.value, scopes, wrappers, context, deps)
    }
  }
}

export function emitAsyncResultChainCallbackWrapperHead(wrapper: CAsyncResultChainWrapper): string {
  return `static inox_status ${wrapper.name}(void* context, inox_value inox_value_input, inox_value* out)`
}

export function emitAsyncResultChainCallbackWrapperDeclaration(
  wrapper: CAsyncResultChainWrapper,
  baseContext: AsyncResultEmitContext,
  deps: AsyncResultChainLoweringDependencies
): string[] {
  const lines: string[] = []

  if (deps.isAsyncResultChainCallbackWrapperWithContext(wrapper)) {
    appendLines(lines, deps.emitRuntimeArrowCallbackContextFinalizerDeclaration(wrapper))
    lines.push('')
  }

  const context = deps.createFunctionContext(baseContext, 'void', false)
  context.cleanupEnabled = false
  context.statusReturn = true
  context.runtimeCallbackReturnType = wrapper.returnType
  context.runtimeCallbackReturnShape = wrapper.returnShape
  context.runtimeCallbackReturnOut = '(*out)'
  context.runtimeCallbackCleanupLabel = 'inox_async_result_callback_cleanup'
  const bodyLines: string[] = []
  appendLines(
    bodyLines,
    deps.emitRuntimeArrowCallbackContextLocals(wrapper, context, deps.callbackLoweringDependencies, 'context')
  )
  appendLines(bodyLines, emitAsyncResultChainCallbackParamPrelude(wrapper, context))
  const statementLines = emitAsyncResultChainCallbackStatementLines(wrapper, context, deps)

  lines.push(`${emitAsyncResultChainCallbackWrapperHead(wrapper)} {`)

  if (deps.isAsyncResultChainCallbackWrapperWithContext(wrapper)) {
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

function emitAsyncResultChainCallbackParamPrelude(
  wrapper: CAsyncResultChainWrapper,
  context: AsyncResultFunctionContext
): string[] {
  const param = wrapper.expression.params[0]

  if (param === null || typeof param === 'undefined') {
    return ['(void)inox_value_input;']
  }

  const valueType = callbackParamValueType(param)
  context.variables.set(param.name, valueType)
  registerAsyncResultCallbackParamShape(param, context)

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
      emitRuntimeTypeCheck(runtimeObjectLikeValueMismatchCondition('inox_value_input'), context),
      `inox_value ${param.name} = inox_value_input;`
    ]
  }

  return [`inox_value ${param.name} = inox_value_input;`]
}

function registerAsyncResultCallbackParamShape(param: AnyNode, context: AsyncResultFunctionContext): void {
  if (param.valueType !== 'object') {
    return
  }

  registerObjectShape(context, param.name, param.shape)
}

function emitAsyncResultChainCallbackStatementLines(
  wrapper: CAsyncResultChainWrapper,
  context: AsyncResultFunctionContext,
  deps: AsyncResultChainLoweringDependencies
): string[] {
  const body = resolveAsyncResultChainArrowBody(wrapper.expression)

  if (body === null || typeof body === 'undefined') {
    return []
  }

  if (body.kind === 'statement-list') {
    return deps.emitStatementList(body.statements, context)
  }

  const prefixLines = deps.emitStatementList(body.prefixStatements, context)
  const lines: string[] = []
  appendLines(lines, prefixLines)
  appendLines(lines, emitAsyncResultChainCallbackReturnLines(body.returnExpression, wrapper, context, deps))

  return lines
}

function emitAsyncResultChainCallbackReturnLines(
  returnExpression: AnyNode | null,
  wrapper: CAsyncResultChainWrapper,
  context: AsyncResultFunctionContext,
  deps: AsyncResultChainLoweringDependencies
): string[] {
  if (returnExpression === null || typeof returnExpression === 'undefined') {
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

export function resolveAsyncResultChainArrowBody(callback: AnyNode | null | undefined): AsyncResultChainArrowBody | null {
  if (callback === null || typeof callback === 'undefined' || callback.type !== 'ArrowFunctionExpression') {
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

  const statements = asyncResultChainCallbackBodyStatements(callback)

  if (statements === null || typeof statements === 'undefined' || statements.length === 0) {
    return null
  }

  const returnStatement = lastAsyncResultChainCallbackStatement(statements)

  if (
    returnStatement === null ||
    typeof returnStatement === 'undefined' ||
    returnStatement.type !== 'ReturnStatement'
  ) {
    return null
  }

  const prefixStatements = asyncResultChainCallbackStatementsBeforeLast(statements)

  if (allStraightLineAsyncResultCallbackStatements(prefixStatements)) {
    return {
      kind: 'prepared-return',
      prefixStatements,
      returnExpression: asyncResultReturnStatementArgument(returnStatement),
      statements: []
    }
  }

  if (!allAsyncResultChainCallbackStatements(statements)) {
    return null
  }

  return {
    kind: 'statement-list',
    prefixStatements: [],
    returnExpression: null,
    statements: asyncResultStatementsOrEmpty(statements)
  }
}

function isStraightLineAsyncResultCallbackStatement(statement: AnyNode | null | undefined): boolean {
  if (statement === null || typeof statement === 'undefined') {
    return false
  }

  return statement.type === 'VariableDeclaration' || statement.type === 'ExpressionStatement'
}

function isAsyncResultChainCallbackStatement(statement: AnyNode | null | undefined): boolean {
  if (statement === null || typeof statement === 'undefined') {
    return false
  }

  if (
    isStraightLineAsyncResultCallbackStatement(statement) ||
    statement.type === 'ReturnStatement' ||
    statement.type === 'ThrowStatement' ||
    statement.type === 'BreakStatement' ||
    statement.type === 'ContinueStatement'
  ) {
    return true
  }

  if (statement.type === 'BlockStatement') {
    return allAsyncResultChainCallbackStatements(statement.body)
  }

  if (statement.type === 'WhileStatement' || statement.type === 'ForStatement') {
    return isAsyncResultChainCallbackStatement(statement.body)
  }

  if (statement.type === 'SwitchStatement') {
    return isAsyncResultChainCallbackSwitchStatement(statement)
  }

  if (statement.type === 'TryStatement') {
    return (
      isAsyncResultChainCallbackStatement(statement.block) &&
      (statement.handler === null ||
        typeof statement.handler === 'undefined' ||
        isAsyncResultChainCallbackStatement(statement.handler.body)) &&
      (statement.finalizer === null ||
        typeof statement.finalizer === 'undefined' ||
        isAsyncResultChainCallbackStatement(statement.finalizer))
    )
  }

  if (statement.type !== 'IfStatement') {
    return false
  }

  return (
    isAsyncResultChainCallbackStatement(statement.consequent) &&
    (statement.alternate === null ||
      typeof statement.alternate === 'undefined' ||
      isAsyncResultChainCallbackStatement(statement.alternate))
  )
}

function isAsyncResultChainCallbackSwitchStatement(statement: AnyNode): boolean {
  for (let index = 0; index < statement.cases.length; index = index + 1) {
    const item = statement.cases[index]

    if (!allAsyncResultChainCallbackStatements(asyncResultNodeArray(item.consequent))) {
      return false
    }
  }

  return true
}
