import type { CEmitContext, CFunctionContext } from '../context.ts'
import type {
  CPreparedCallOptions as PreparedCallOptions,
  CPreparedExpression as PreparedExpression,
  CCallbackContextWrapper,
  CPromiseChainWrapper,
  CRuntimeArrowCapture
} from '../types.ts'
import type { AnyNode, IrProgram } from '../../types.ts'
import type { CallbackLoweringDependencies, CallbackScope, CallbackScopeBinding } from './callbacks.ts'

export function cPromiseRuntimeCallName(callee: AnyNode): string | null {
  if (callee?.type !== 'MemberExpression' || callee.object.type !== 'Reference' || callee.object.path.length !== 1) {
    return null
  }

  if (callee.object.path[0] !== 'Promise') {
    return null
  }

  return ['resolve', 'reject'].includes(callee.property) ? callee.property : null
}

export function isPromiseConstructorExpression(expression: AnyNode): boolean {
  return (
    expression?.type === 'NewExpression' &&
    expression.callee?.type === 'Reference' &&
    expression.callee.path.length === 1 &&
    expression.callee.path[0] === 'Promise'
  )
}

export function isPromiseMethodAst(expression: AnyNode): boolean {
  return (
    expression?.type === 'CallExpression' &&
    expression.callee?.type === 'MemberExpression' &&
    ['catch', 'then'].includes(expression.callee.property)
  )
}

export function isPlainPromiseReturningFunctionName(name: string, context: CEmitContext): boolean {
  return context.functionReturnTypes.get(name) === 'promise' && context.functionAsyncFlags.get(name) !== true
}

export function functionTakesEventLoopParam(name: string, context: CEmitContext): boolean {
  return isPlainPromiseReturningFunctionName(name, context) || context.externalEventLoopFunctions.has(name)
}

export function isPromiseReturningFunctionCallee(callee: AnyNode, context: CEmitContext): boolean {
  return (
    callee?.type === 'Reference' &&
    callee.path.length === 1 &&
    isPlainPromiseReturningFunctionName(callee.path[0], context)
  )
}

export function isExternalEventLoopFunctionCallee(callee: AnyNode, context: CEmitContext): boolean {
  return (
    callee?.type === 'Reference' && callee.path.length === 1 && context.externalEventLoopFunctions.has(callee.path[0])
  )
}

export function resolvePromiseReturningFunctionValueType(callee: AnyNode, context: CEmitContext): string {
  if (!isPromiseReturningFunctionCallee(callee, context)) {
    return 'unknown'
  }

  return context.functionReturnPromiseValueTypes.get(callee.path[0]) ?? 'unknown'
}

export function resolvePromiseExpressionValueType(expression: AnyNode, context: CFunctionContext): string | null {
  const directType = knownValueType(expression?.promiseValueType)

  if (directType != null) {
    return directType
  }

  if (expression?.type === 'CallExpression') {
    if (isPromiseReturningFunctionCallee(expression.callee, context)) {
      return knownValueType(resolvePromiseReturningFunctionValueType(expression.callee, context))
    }

    if (isAsyncFunctionCallee(expression.callee, context)) {
      return knownValueType(resolveCAsyncFunctionAwaitValueType(expression.callee, context))
    }
  }

  if (expression?.type === 'Reference' && expression.path.length === 1) {
    return knownValueType(context.promiseValueTypes.get(expression.path[0]))
  }

  return null
}

export function knownValueType(valueType: string | null | undefined): string | null {
  return valueType == null || valueType === 'unknown' ? null : valueType
}

export function isAsyncFunctionCallee(callee: AnyNode, context: CEmitContext): boolean {
  return (
    callee?.type === 'Reference' && callee.path.length === 1 && context.functionAsyncFlags.get(callee.path[0]) === true
  )
}

export function resolveCAsyncFunctionAwaitValueType(callee: AnyNode, context: CEmitContext): string | null {
  if (!isAsyncFunctionCallee(callee, context)) {
    return null
  }

  return context.functionReturnPromiseValueTypes.get(callee.path[0]) ?? 'unknown'
}


import { collectIrTopLevelNodeEntries } from '../../ir.ts'
import { diagnostic } from '../../diagnostics.ts'
import {
  createFunctionContext,
  emitBoxedValueCleanup,
  emitBoxedValueDeclarations,
  emitEventLoopReference,
  emitErrorChannelDeclarations,
  emitFailureStatement,
  emitLoopFlowDeclarations,
  emitOwnedValueCleanup,
  emitOwnedValueDeclarations,
  emitPrepareOwnedValueWrite,
  emitReturnFlowDeclarations,
  emitRuntimeTypeCheck,
  emitStatusCheck,
  nextCName,
  registerEventLoop,
  registerOwnedPromise
} from '../context.ts'
import { isManagedRuntimeReturnType } from '../value-types.ts'


export type PromiseChainLoweringDependencies = {
  callbackLoweringDependencies: CallbackLoweringDependencies
  collectArrowCaptures: (
    expression: AnyNode,
    outerScopes: CallbackScope[],
    context: CEmitContext,
    deps: CallbackLoweringDependencies
  ) => CRuntimeArrowCapture[]
  emitPreparedNumberExpression: (expression: AnyNode, context: CFunctionContext) => PreparedExpression
  emitRuntimeArrowCallbackContextFinalizerDeclaration: (wrapper: CCallbackContextWrapper) => string[]
  emitRuntimeArrowCallbackContextLocals: (
    wrapper: CCallbackContextWrapper,
    context: CFunctionContext,
    deps: CallbackLoweringDependencies
  ) => string[]
  emitRuntimeCallbackRuntimeValueReturnLines: (argument: AnyNode, context: CFunctionContext) => string[]
  emitStatementList: (statements: AnyNode[], context: CFunctionContext) => string[]
  functionUsesExternalEventLoop: (node: AnyNode, externalNames: Set<string>) => boolean
  isPromiseChainCallbackWrapperWithContext: (
    wrapper: CPromiseChainWrapper | null | undefined
  ) => wrapper is CPromiseChainWrapper
}

export type PromiseLoweringDependencies = {
  emitCValueExpression: (expression: AnyNode, context: CFunctionContext) => PreparedExpression
  emitPreparedAsyncFunctionPromiseCallExpression: (
    expression: AnyNode,
    context: CFunctionContext,
    options?: PreparedCallOptions
  ) => PreparedExpression | null
  emitPreparedCallExpression: (expression: AnyNode, context: CFunctionContext) => PreparedExpression
  emitPreparedFetchCallExpression: (
    expression: AnyNode,
    context: CFunctionContext,
    options?: PreparedCallOptions
  ) => PreparedExpression | null
  emitPreparedFsCallExpression: (
    expression: AnyNode,
    context: CFunctionContext,
    options?: PreparedCallOptions
  ) => PreparedExpression | null
  emitRuntimeArrowCaptureStoreLines: (
    capture: CRuntimeArrowCapture,
    contextName: string,
    context: CFunctionContext
  ) => string[]
  emitStatementList: (statements: AnyNode[], context: CFunctionContext) => string[]
  inferExpressionType: (expression: AnyNode, context: CFunctionContext) => string
  inferRejectedValueType: (expression: AnyNode, context: CFunctionContext) => string
  isPromiseChainCallbackWrapperWithContext: (
    wrapper: CPromiseChainWrapper | null | undefined
  ) => wrapper is CPromiseChainWrapper
}

type PromiseChainArrowBody =
  | {
      kind: 'prepared-return'
      prefixStatements: AnyNode[]
      returnExpression: AnyNode | null
    }
  | {
      kind: 'statement-list'
      statements: AnyNode[]
    }

export function emitPreparedPromiseStaticExpression(
  expression: AnyNode,
  context: CFunctionContext,
  dependencies: PromiseLoweringDependencies,
  options: PreparedCallOptions = {}
): PreparedExpression | null {
  const method = cPromiseRuntimeCallName(expression?.callee)

  if (method == null || expression?.valueType !== 'promise') {
    return null
  }

  registerEventLoop(context)

  const out = options.out ?? nextCName(context, 'ccjs_promise')
  const rejectionValueType = method === 'reject' ? dependencies.inferRejectedValueType(expression.args[0], context) : 'unknown'

  if (options.owned !== false) {
    registerOwnedPromise(context, out, expression.promiseValueType ?? 'unknown', rejectionValueType)
  }
  const runtimeCall = method === 'resolve' ? 'ccjs_promise_resolved' : 'ccjs_promise_rejected'
  const value =
    expression.args[0] == null
      ? {
          lines: [],
          expression: 'ccjs_undefined_value()'
        }
      : dependencies.emitCValueExpression(expression.args[0], context)

  return {
    lines: [
      ...value.lines,
      emitStatusCheck(`${runtimeCall}(${emitEventLoopReference(context)}, ${value.expression}, &${out})`, context)
    ],
    expression: out,
    rejectionValueType
  }
}

export function emitPreparedPromiseConstructorExpression(
  expression: AnyNode,
  context: CFunctionContext,
  dependencies: PromiseLoweringDependencies,
  options: PreparedCallOptions = {}
): PreparedExpression | null {
  if (!isPromiseConstructorExpression(expression) || expression?.valueType !== 'promise') {
    return null
  }

  registerEventLoop(context)

  const out = options.out ?? nextCName(context, 'ccjs_promise')
  const executor = expression.args[0]
  const valueType = expression.promiseValueType ?? 'unknown'
  const rejectionValueType = promiseConstructorRejectionValueType(executor, context, dependencies)

  if (options.owned !== false) {
    registerOwnedPromise(context, out, valueType, rejectionValueType)
  }

  const lines = [emitStatusCheck(`ccjs_promise_new(${emitEventLoopReference(context)}, &${out})`, context)]

  if (executor?.type !== 'ArrowFunctionExpression') {
    context.diagnostics.push(
      diagnostic(
        'CCJS_C_ASYNC',
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

  const resolveName = executor.params[0]?.name ?? null
  const rejectName = executor.params[1]?.name ?? null
  const statements = executor.expressionBody
    ? [
        {
          type: 'ExpressionStatement',
          expression: executor.body,
          loc: executor.body?.loc ?? executor.loc
        }
      ]
    : executor.body

  lines.push(
    ...withPromiseConstructorHandlers(context, resolveName, rejectName, out, () =>
      dependencies.emitStatementList(statements, context)
    )
  )

  return {
    lines,
    expression: out,
    valueType,
    rejectionValueType
  }
}

export function emitPromiseConstructorSettlementCall(
  expression: AnyNode,
  context: CFunctionContext,
  dependencies: PromiseLoweringDependencies
): string[] | null {
  if (
    expression?.type !== 'CallExpression' ||
    expression.callee?.type !== 'Reference' ||
    expression.callee.path.length !== 1
  ) {
    return null
  }

  const handler = context.promiseConstructorHandlers.get(expression.callee.path[0])

  if (handler == null) {
    return null
  }

  if (expression.args.length > 1) {
    context.diagnostics.push(
      diagnostic(
        'CCJS_C_ASYNC',
        'Promise constructor resolve/reject handlers currently support at most one argument in C',
        expression.loc
      )
    )
  }

  const value =
    expression.args[0] == null
      ? {
          lines: [],
          expression: 'ccjs_undefined_value()'
        }
      : dependencies.emitCValueExpression(expression.args[0], context)
  const runtimeCall = handler.kind === 'resolve' ? 'ccjs_promise_resolve' : 'ccjs_promise_reject'

  return [...value.lines, emitStatusCheck(`${runtimeCall}(${handler.promise}, ${value.expression})`, context)]
}

export function emitPreparedPromiseMethodExpression(
  expression: AnyNode,
  context: CFunctionContext,
  dependencies: PromiseLoweringDependencies,
  options: PreparedCallOptions = {}
): PreparedExpression | null {
  if (!isPromiseMethodCallExpression(expression, context, dependencies)) {
    return null
  }

  const method = expression.callee.property
  const callback = expression.args[0]
  const wrapper = callback == null ? null : context.promiseChainArrowWrappers.get(callback)

  if (wrapper == null) {
    context.diagnostics.push(
      diagnostic(
        'CCJS_C_ASYNC',
        'Promise.then/catch currently supports only non-capturing expression-body, single-return block-body, straight-line block-body or simple control-flow block-body arrow callbacks in C',
        expression.loc
      )
    )

    return {
      lines: [],
      expression: '0',
      valueType: expression.promiseValueType ?? 'unknown',
      rejectionValueType: 'unknown'
    }
  }

  const receiver = emitPreparedPromiseExpression(expression.callee.object, context, dependencies)

  if (receiver == null) {
    context.diagnostics.push(
      diagnostic(
        'CCJS_C_ASYNC',
        'this Promise chain receiver is not supported by the current C backend slice',
        expression.loc
      )
    )

    return {
      lines: [],
      expression: '0',
      valueType: expression.promiseValueType ?? 'unknown',
      rejectionValueType: 'unknown'
    }
  }

  const out = options.out ?? nextCName(context, 'ccjs_promise')
  const valueType = expression.promiseValueType ?? 'unknown'
  const rejectionValueType = method === 'then' ? (receiver.rejectionValueType ?? 'unknown') : 'unknown'
  const callbackContext = emitPromiseChainCallbackContext(wrapper, context, dependencies)
  const runtimeCall =
    method === 'then'
      ? `ccjs_promise_chain(${receiver.expression}, ${wrapper.name}, 0, ${callbackContext.expression}, ${callbackContext.finalizer}, &${out})`
      : `ccjs_promise_catch(${receiver.expression}, ${wrapper.name}, ${callbackContext.expression}, ${callbackContext.finalizer}, &${out})`
  const runtimeCallLines =
    callbackContext.expression === '0'
      ? [emitStatusCheck(runtimeCall, context)]
      : [
          `if (${runtimeCall} != CCJS_OK) {`,
          `  ${wrapper.finalizerName}(${callbackContext.expression});`,
          `  ${emitFailureStatement(context)}`,
          '}'
        ]

  if (options.owned !== false) {
    registerOwnedPromise(context, out, valueType, rejectionValueType)
  }

  return {
    lines: [...receiver.lines, ...callbackContext.lines, ...runtimeCallLines],
    expression: out,
    valueType,
    rejectionValueType
  }
}

export function emitPreparedPromiseExpression(
  expression: AnyNode,
  context: CFunctionContext,
  dependencies: PromiseLoweringDependencies,
  options: PreparedCallOptions = {}
): PreparedExpression | null {
  const fetchCall = dependencies.emitPreparedFetchCallExpression(expression, context, options)

  if (fetchCall != null) {
    return {
      ...fetchCall,
      valueType: resolvePromiseExpressionValueType(expression, context) ?? fetchCall.valueType ?? 'unknown'
    }
  }

  const fsCall = dependencies.emitPreparedFsCallExpression(expression, context, options)

  if (fsCall != null) {
    return {
      ...fsCall,
      valueType: resolvePromiseExpressionValueType(expression, context) ?? 'unknown'
    }
  }

  const promiseConstructor = emitPreparedPromiseConstructorExpression(expression, context, dependencies, options)

  if (promiseConstructor != null) {
    return {
      ...promiseConstructor,
      valueType: resolvePromiseExpressionValueType(expression, context) ?? promiseConstructor.valueType ?? 'unknown'
    }
  }

  const promiseResolve = emitPreparedPromiseStaticExpression(expression, context, dependencies, options)

  if (promiseResolve != null) {
    return {
      ...promiseResolve,
      valueType: resolvePromiseExpressionValueType(expression, context) ?? 'unknown'
    }
  }

  const promiseMethod = emitPreparedPromiseMethodExpression(expression, context, dependencies, options)

  if (promiseMethod != null) {
    return {
      ...promiseMethod,
      valueType: resolvePromiseExpressionValueType(expression, context) ?? 'unknown'
    }
  }

  const asyncPromiseCall = dependencies.emitPreparedAsyncFunctionPromiseCallExpression(expression, context, options)

  if (asyncPromiseCall != null) {
    return {
      ...asyncPromiseCall,
      valueType: resolvePromiseExpressionValueType(expression, context) ?? 'unknown'
    }
  }

  const promiseCall = emitPreparedPromiseReturningCallExpression(expression, context, dependencies, options)

  if (promiseCall != null) {
    return promiseCall
  }

  if (expression?.type === 'Reference' && expression.path.length === 1) {
    const name = expression.path[0]

    if (context.variables.get(name) === 'promise') {
      return {
        lines: [],
        expression: name,
        valueType: context.promiseValueTypes.get(name) ?? 'unknown',
        rejectionValueType: context.promiseRejectionValueTypes.get(name) ?? 'unknown'
      }
    }
  }

  return null
}

export function emitPreparedPromiseReturningCallExpression(
  expression: AnyNode,
  context: CFunctionContext,
  dependencies: PromiseLoweringDependencies,
  options: PreparedCallOptions = {}
): PreparedExpression | null {
  if (expression?.type !== 'CallExpression' || !isPromiseReturningFunctionCallee(expression.callee, context)) {
    return null
  }

  const out = options.out ?? nextCName(context, 'ccjs_promise')
  const valueType = resolvePromiseReturningFunctionValueType(expression.callee, context)
  const call = dependencies.emitPreparedCallExpression(expression, context)

  if (options.owned !== false) {
    registerOwnedPromise(context, out, valueType)
  }

  return {
    lines: [...call.lines, `${out} = ${call.expression};`, `if (${out} == 0) ${emitFailureStatement(context)}`],
    expression: out,
    valueType,
    rejectionValueType: 'unknown'
  }
}

function withPromiseConstructorHandlers(
  context: CFunctionContext,
  resolveName: string | null,
  rejectName: string | null,
  promise: string,
  callback: () => string[]
): string[] {
  const previous = context.promiseConstructorHandlers
  context.promiseConstructorHandlers = new Map(previous)

  if (resolveName != null) {
    context.promiseConstructorHandlers.set(resolveName, {
      kind: 'resolve',
      promise
    })
  }

  if (rejectName != null) {
    context.promiseConstructorHandlers.set(rejectName, {
      kind: 'reject',
      promise
    })
  }

  try {
    return callback()
  } finally {
    context.promiseConstructorHandlers = previous
  }
}

function promiseConstructorRejectionValueType(
  executor: AnyNode,
  context: CFunctionContext,
  dependencies: PromiseLoweringDependencies
): string {
  if (executor?.type !== 'ArrowFunctionExpression') {
    return 'unknown'
  }

  const rejectName = executor.params[1]?.name

  if (rejectName == null) {
    return 'unknown'
  }

  const types: string[] = []
  const visit = (node: unknown): void => {
    if (node == null) {
      return
    }

    if (Array.isArray(node)) {
      node.forEach(visit)
      return
    }

    if (typeof node !== 'object') {
      return
    }

    const current = node as AnyNode

    if (
      current.type === 'CallExpression' &&
      current.callee?.type === 'Reference' &&
      current.callee.path.length === 1 &&
      current.callee.path[0] === rejectName
    ) {
      types.push(dependencies.inferRejectedValueType(current.args[0], context))
    }

    for (const [key, value] of Object.entries(current)) {
      if (key === 'loc' || key === 'callee') {
        continue
      }

      visit(value)
    }
  }

  visit(executor.expressionBody ? executor.body : executor.body)

  return uniqueValueTypes(types)
}

function uniqueValueTypes(types: string[]): string {
  const [first] = types

  if (first == null) {
    return 'unknown'
  }

  return types.every((type) => type === first) ? first : 'unknown'
}

function emitPromiseChainCallbackContext(
  wrapper: CPromiseChainWrapper,
  context: CFunctionContext,
  dependencies: PromiseLoweringDependencies
): {
  lines: string[]
  expression: string
  finalizer: string
} {
  if (!dependencies.isPromiseChainCallbackWrapperWithContext(wrapper)) {
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
          'CCJS_C_ASYNC',
          'mutable Promise callback captures are outside the current C backend MVP; use const captures or move mutation outside the Promise callback',
          wrapper.expression.loc
        )
      )
    }

    if (!['number', 'boolean', 'string', 'object'].includes(capture.valueType)) {
      context.diagnostics.push(
        diagnostic(
          'CCJS_C_ASYNC',
          'capturing Promise callbacks currently support only const number/boolean/string/object bindings',
          wrapper.expression.loc
        )
      )
    }
  }

  const contextName = nextCName(context, 'ccjs_promise_callback_ctx')

  lines.push(
    `${wrapper.contextTypeName}* ${contextName} = ccjs_default_alloc(0, sizeof(${wrapper.contextTypeName}), _Alignof(${wrapper.contextTypeName}));`
  )
  lines.push(`if (${contextName} == 0) ${emitFailureStatement(context)}`)

  if (wrapper.needsEventLoop === true) {
    registerEventLoop(context)
    lines.push(`${contextName}->ccjs_loop = ${emitEventLoopReference(context)};`)
  }

  for (const capture of wrapper.captures) {
    lines.push(...dependencies.emitRuntimeArrowCaptureStoreLines(capture, contextName, context))
  }

  return {
    lines,
    expression: contextName,
    finalizer: wrapper.finalizerName
  }
}

function isPromiseMethodCallExpression(
  expression: AnyNode,
  context: CFunctionContext,
  dependencies: PromiseLoweringDependencies
): boolean {
  return (
    expression?.type === 'CallExpression' &&
    expression.callee?.type === 'MemberExpression' &&
    ['catch', 'then'].includes(expression.callee.property) &&
    dependencies.inferExpressionType(expression.callee.object, context) === 'promise'
  )
}

export function collectPromiseChainWrappers(
  irPrograms: IrProgram[],
  context: CEmitContext,
  deps: PromiseChainLoweringDependencies
): Map<string, CPromiseChainWrapper> {
  const wrappers = new Map<string, CPromiseChainWrapper>()
  const declare = (scope: CallbackScope, name: string, info: CallbackScopeBinding): void => {
    scope.set(name, info)
  }
  const declareParams = (scope: CallbackScope, params: AnyNode[]): void => {
    for (const param of params) {
      declare(scope, param.name, {
        name: param.name,
        valueType: param.valueType,
        declaration: param,
        functionType: param.functionType,
        nullable: param.nullable === true,
        shape: param.shape,
        runtimeManaged: ['string', 'object'].includes(param.valueType),
        mutable: false
      })
    }
  }
  const lookup = (name: string, scopes: CallbackScope[]): CallbackScopeBinding | null => {
    for (let index = scopes.length - 1; index >= 0; index -= 1) {
      const entry = scopes[index].get(name)

      if (entry != null) {
        return entry
      }
    }

    return null
  }
  const isRuntimeManagedCaptureBinding = (
    statement: AnyNode,
    scopes: CallbackScope[],
    valueType: string
  ): boolean => {
    if (valueType === 'object') {
      return true
    }

    if (valueType !== 'string') {
      return false
    }

    if (statement.init?.type === 'StringLiteral') {
      return false
    }

    if (statement.init?.type === 'TemplateLiteral' && !statement.init.raw.includes('${')) {
      return false
    }

    if (statement.init?.type === 'Reference' && statement.init.path.length === 1) {
      return lookup(statement.init.path[0], scopes)?.runtimeManaged === true
    }

    return true
  }
  const declareVariable = (scope: CallbackScope, statement: AnyNode, scopes: CallbackScope[]): void => {
    declare(scope, statement.name, {
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
  const register = (expression: AnyNode, scopes: CallbackScope[]): void => {
    if (!isPromiseMethodAst(expression)) {
      return
    }

    const callback = expression.args[0]

    if (
      callback?.type !== 'ArrowFunctionExpression' ||
      callback.params.length > 1 ||
      resolvePromiseChainArrowBody(callback) == null
    ) {
      return
    }

    if (context.promiseChainArrowWrappers.has(callback)) {
      return
    }

    const index = wrappers.size
    const key = `promise-chain-arrow:${index}`
    const captures = deps.collectArrowCaptures(callback, scopes, context, deps.callbackLoweringDependencies)

    for (const capture of captures) {
      if (
        capture.mutable &&
        ['number', 'boolean', 'string', 'object'].includes(capture.valueType) &&
        capture.declaration != null
      ) {
        context.boxedMutableCaptureDeclarations.add(capture.declaration)
      }
    }

    const wrapper: CPromiseChainWrapper = {
      kind: 'promise-chain-arrow',
      key,
      name: `ccjs_promise_chain_arrow_${index}`,
      contextTypeName: `ccjs_promise_chain_context_${index}`,
      finalizerName: `ccjs_promise_chain_context_${index}_finalize`,
      expression: callback,
      returnType: callback.returnType ?? expression.promiseValueType ?? 'unknown',
      returnShape: callback.returnShape ?? null,
      needsEventLoop: deps.functionUsesExternalEventLoop(callback, context.externalEventLoopFunctions),
      captures
    }

    wrappers.set(key, wrapper)
    context.promiseChainArrowWrappers.set(callback, wrapper)
  }
  const visitStatement = (statement: AnyNode | null | undefined, scopes: CallbackScope[]): void => {
    if (statement == null) {
      return
    }

    if (statement.type === 'VariableDeclaration') {
      visitExpression(statement.init, scopes)
      declareVariable(scopes[scopes.length - 1], statement, scopes)
      return
    }

    if (statement.type === 'ExpressionStatement') {
      visitExpression(statement.expression, scopes)
      return
    }

    if (statement.type === 'ReturnStatement' || statement.type === 'ThrowStatement') {
      visitExpression(statement.argument, scopes)
      return
    }

    if (statement.type === 'BlockStatement') {
      const scope: CallbackScope = new Map()
      statement.body.forEach((item) => visitStatement(item, [...scopes, scope]))
      return
    }

    if (statement.type === 'IfStatement') {
      visitExpression(statement.condition, scopes)
      visitStatement(statement.consequent, scopes)
      visitStatement(statement.alternate, scopes)
      return
    }

    if (statement.type === 'WhileStatement') {
      visitExpression(statement.condition, scopes)
      visitStatement(statement.body, scopes)
      return
    }

    if (statement.type === 'ForStatement') {
      const scope: CallbackScope = new Map()
      const loopScopes = [...scopes, scope]

      if (statement.init?.type === 'VariableDeclaration') {
        visitStatement(statement.init, loopScopes)
      } else {
        visitExpression(statement.init, loopScopes)
      }

      visitExpression(statement.test, loopScopes)
      visitExpression(statement.update, loopScopes)
      visitStatement(statement.body, loopScopes)
      return
    }

    if (statement.type === 'ForOfStatement') {
      visitExpression(statement.iterable, scopes)
      const scope: CallbackScope = new Map()
      declare(scope, statement.name, {
        name: statement.name,
        valueType: 'unknown',
        mutable: statement.kind === 'let'
      })
      visitStatement(statement.body, [...scopes, scope])
      return
    }

    if (statement.type === 'SwitchStatement') {
      visitExpression(statement.discriminant, scopes)

      for (const item of statement.cases) {
        visitExpression(item.test, scopes)
        const scope: CallbackScope = new Map()
        item.consequent.forEach((statement: AnyNode) => visitStatement(statement, [...scopes, scope]))
      }
      return
    }

    if (statement.type === 'TryStatement') {
      visitStatement(statement.block, scopes)
      visitStatement(statement.handler?.body, scopes)
      visitStatement(statement.finalizer, scopes)
    }
  }
  const visitExpression = (expression: AnyNode | null | undefined, scopes: CallbackScope[]): void => {
    if (expression == null) {
      return
    }

    if (expression.type === 'CallExpression') {
      register(expression, scopes)
      visitExpression(expression.callee, scopes)
      expression.args.forEach((arg) => visitExpression(arg, scopes))
      return
    }

    if (expression.type === 'OptionalCallExpression' || expression.type === 'NewExpression') {
      visitExpression(expression.callee, scopes)
      expression.args.forEach((arg) => visitExpression(arg, scopes))
      return
    }

    if (expression.type === 'AssignmentExpression') {
      visitExpression(expression.target, scopes)
      visitExpression(expression.value, scopes)
      return
    }

    if (expression.type === 'BinaryExpression') {
      visitExpression(expression.left, scopes)
      visitExpression(expression.right, scopes)
      return
    }

    if (
      expression.type === 'UnaryExpression' ||
      expression.type === 'UpdateExpression' ||
      expression.type === 'AwaitExpression'
    ) {
      visitExpression(expression.argument, scopes)
      return
    }

    if (expression.type === 'MemberExpression' || expression.type === 'OptionalMemberExpression') {
      visitExpression(expression.object, scopes)
      return
    }

    if (expression.type === 'IndexExpression' || expression.type === 'OptionalIndexExpression') {
      visitExpression(expression.object, scopes)
      visitExpression(expression.index, scopes)
      return
    }

    if (expression.type === 'ArrayLiteral') {
      expression.elements.forEach((element) => visitExpression(element, scopes))
      return
    }

    if (expression.type === 'ObjectLiteral') {
      expression.properties.forEach((property) => visitExpression(property.value, scopes))
    }
  }

  for (const ir of irPrograms) {
    const topLevelScope: CallbackScope = new Map()

    for (const item of collectIrTopLevelNodeEntries(ir)) {
      if (item.kind === 'function') {
        const scope: CallbackScope = new Map()
        declareParams(scope, item.node.params)
        item.node.body.forEach((statement) => visitStatement(statement, [topLevelScope, scope]))
      } else if (item.kind === 'statement') {
        visitStatement(item.node, [topLevelScope])
      }
    }
  }

  return wrappers
}

export function emitPromiseChainCallbackWrapperHead(wrapper: CPromiseChainWrapper): string {
  return `static ccjs_status ${wrapper.name}(void* context, ccjs_value ccjs_value_input, ccjs_value* out)`
}

export function emitPromiseChainCallbackWrapperDeclaration(
  wrapper: CPromiseChainWrapper,
  baseContext: CEmitContext,
  deps: PromiseChainLoweringDependencies
): string[] {
  const lines: string[] = []

  if (deps.isPromiseChainCallbackWrapperWithContext(wrapper)) {
    lines.push(...deps.emitRuntimeArrowCallbackContextFinalizerDeclaration(wrapper))
    lines.push('')
  }

  const context = createFunctionContext(baseContext, 'void')
  context.cleanupEnabled = false
  context.statusReturn = true
  context.runtimeCallbackReturnType = wrapper.returnType
  context.runtimeCallbackReturnShape = wrapper.returnShape ?? null
  context.runtimeCallbackReturnOut = '(*out)'
  context.runtimeCallbackCleanupLabel = 'ccjs_promise_callback_cleanup'
  const bodyLines = [
    ...deps.emitRuntimeArrowCallbackContextLocals(wrapper, context, deps.callbackLoweringDependencies),
    ...emitPromiseChainCallbackParamPrelude(wrapper, context)
  ]
  const statementLines = emitPromiseChainCallbackStatementLines(wrapper, context, deps)

  lines.push(
    `${emitPromiseChainCallbackWrapperHead(wrapper)} {`,
    deps.isPromiseChainCallbackWrapperWithContext(wrapper)
      ? '  if (context == 0) return CCJS_ERR_TYPE;'
      : '  (void)context;',
    '  if (out == 0) return CCJS_ERR_TYPE;',
    '  *out = ccjs_undefined_value();',
    ...bodyLines.map((line) => `  ${line}`),
    ...emitLoopFlowDeclarations(context).map((line) => `  ${line}`),
    ...emitReturnFlowDeclarations(context).map((line) => `  ${line}`),
    ...emitOwnedValueDeclarations(context).map((line) => `  ${line}`),
    ...emitErrorChannelDeclarations(context).map((line) => `  ${line}`),
    ...emitBoxedValueDeclarations(context).map((line) => `  ${line}`),
    ...statementLines.map((line) => `  ${line}`),
    ...(context.usedRuntimeCallbackCleanupGoto === true ? [`${context.runtimeCallbackCleanupLabel}:`] : []),
    ...emitOwnedValueCleanup(context).map((line) => `  ${line}`),
    ...emitBoxedValueCleanup(context).map((line) => `  ${line}`),
    '  return CCJS_OK;',
    '}'
  )

  return lines
}

function emitPromiseChainCallbackParamPrelude(wrapper: CPromiseChainWrapper, context: CFunctionContext): string[] {
  const param = wrapper.expression.params[0]

  if (param == null) {
    return ['(void)ccjs_value_input;']
  }

  const valueType = param.valueType ?? 'unknown'
  context.variables.set(param.name, valueType)

  if (valueType === 'number') {
    return [
      emitRuntimeTypeCheck('ccjs_value_input.tag != CCJS_TAG_NUMBER', context),
      `double ${param.name} = ccjs_value_input.as.number;`
    ]
  }

  if (valueType === 'boolean') {
    return [
      emitRuntimeTypeCheck('ccjs_value_input.tag != CCJS_TAG_BOOL', context),
      `double ${param.name} = ccjs_value_input.as.boolean ? 1 : 0;`
    ]
  }

  if (valueType === 'string') {
    context.runtimeStrings.add(param.name)

    return [
      emitRuntimeTypeCheck('ccjs_value_input.tag != CCJS_TAG_STRING || ccjs_value_input.as.ref == 0', context),
      `ccjs_string* ${param.name} = (ccjs_string*)ccjs_value_input.as.ref;`
    ]
  }

  if (valueType === 'object') {
    return [
      emitRuntimeTypeCheck('ccjs_value_input.tag != CCJS_TAG_OBJECT || ccjs_value_input.as.ref == 0', context),
      `ccjs_value ${param.name} = ccjs_value_input;`
    ]
  }

  return [`ccjs_value ${param.name} = ccjs_value_input;`]
}

function emitPromiseChainCallbackStatementLines(
  wrapper: CPromiseChainWrapper,
  context: CFunctionContext,
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

  return [...prefixLines, ...emitPromiseChainCallbackReturnLines(body.returnExpression, wrapper, context, deps)]
}

function emitPromiseChainCallbackReturnLines(
  returnExpression: AnyNode | null,
  wrapper: CPromiseChainWrapper,
  context: CFunctionContext,
  deps: PromiseChainLoweringDependencies
): string[] {
  if (returnExpression == null) {
    return []
  }

  if (wrapper.returnType === 'number' || wrapper.returnType === 'boolean') {
    const value = deps.emitPreparedNumberExpression(returnExpression, context)
    const expression =
      wrapper.returnType === 'number'
        ? `ccjs_number_value(${value.expression})`
        : `ccjs_bool_value((${value.expression}) != 0)`

    return [...value.lines, `*out = ${expression};`]
  }

  if (isManagedRuntimeReturnType(wrapper.returnType)) {
    return deps.emitRuntimeCallbackRuntimeValueReturnLines(returnExpression, context)
  }

  return []
}

export function resolvePromiseChainArrowBody(callback: AnyNode): PromiseChainArrowBody | null {
  if (callback?.type !== 'ArrowFunctionExpression') {
    return null
  }

  if (callback.expressionBody) {
    return {
      kind: 'prepared-return',
      prefixStatements: [],
      returnExpression: callback.body
    }
  }

  const statements = Array.isArray(callback.body)
    ? callback.body
    : callback.body?.type === 'BlockStatement'
      ? callback.body.body
      : null

  if (statements == null || statements.length === 0) {
    return null
  }

  const returnStatement = statements.at(-1)

  if (returnStatement?.type !== 'ReturnStatement') {
    return null
  }

  const prefixStatements = statements.slice(0, -1)

  if (prefixStatements.every(isStraightLinePromiseCallbackStatement)) {
    return {
      kind: 'prepared-return',
      prefixStatements,
      returnExpression: returnStatement.argument ?? null
    }
  }

  if (!statements.every(isPromiseChainCallbackStatement)) {
    return null
  }

  return {
    kind: 'statement-list',
    statements
  }
}

function isStraightLinePromiseCallbackStatement(statement: AnyNode): boolean {
  return statement?.type === 'VariableDeclaration' || statement?.type === 'ExpressionStatement'
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
    return statement.body.every(isPromiseChainCallbackStatement)
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
  return statement.cases.every((item) => item.consequent.every(isPromiseChainCallbackStatement))
}
