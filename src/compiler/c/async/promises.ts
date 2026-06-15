export function cPromiseRuntimeCallName(callee: any): string | null {
  if (callee?.type !== 'MemberExpression' || callee.object.type !== 'Reference' || callee.object.path.length !== 1) {
    return null
  }

  if (callee.object.path[0] !== 'Promise') {
    return null
  }

  return ['resolve', 'reject'].includes(callee.property) ? callee.property : null
}

export function isPromiseConstructorExpression(expression: any): boolean {
  return (
    expression?.type === 'NewExpression' &&
    expression.callee?.type === 'Reference' &&
    expression.callee.path.length === 1 &&
    expression.callee.path[0] === 'Promise'
  )
}

export function isPromiseMethodAst(expression: any): boolean {
  return (
    expression?.type === 'CallExpression' &&
    expression.callee?.type === 'MemberExpression' &&
    ['catch', 'then'].includes(expression.callee.property)
  )
}

export function isPlainPromiseReturningFunctionName(name: string, context: any): boolean {
  return context.functionReturnTypes.get(name) === 'promise' && context.functionAsyncFlags.get(name) !== true
}

export function functionTakesEventLoopParam(name: string, context: any): boolean {
  return isPlainPromiseReturningFunctionName(name, context) || context.externalEventLoopFunctions.has(name)
}

export function isPromiseReturningFunctionCallee(callee: any, context: any): boolean {
  return (
    callee?.type === 'Reference' &&
    callee.path.length === 1 &&
    isPlainPromiseReturningFunctionName(callee.path[0], context)
  )
}

export function isExternalEventLoopFunctionCallee(callee: any, context: any): boolean {
  return (
    callee?.type === 'Reference' && callee.path.length === 1 && context.externalEventLoopFunctions.has(callee.path[0])
  )
}

export function resolvePromiseReturningFunctionValueType(callee: any, context: any): string {
  if (!isPromiseReturningFunctionCallee(callee, context)) {
    return 'unknown'
  }

  return context.functionReturnPromiseValueTypes.get(callee.path[0]) ?? 'unknown'
}

export function resolvePromiseExpressionValueType(expression: any, context: any): string | null {
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

export function knownValueType(valueType: any): string | null {
  return valueType == null || valueType === 'unknown' ? null : valueType
}

export function isAsyncFunctionCallee(callee: any, context: any): boolean {
  return (
    callee?.type === 'Reference' && callee.path.length === 1 && context.functionAsyncFlags.get(callee.path[0]) === true
  )
}

export function resolveCAsyncFunctionAwaitValueType(callee: any, context: any): string | null {
  if (!isAsyncFunctionCallee(callee, context)) {
    return null
  }

  return context.functionReturnPromiseValueTypes.get(callee.path[0]) ?? 'unknown'
}


import { collectIrTopLevelNodeEntries } from '../../ir.ts'
import {
  createFunctionContext,
  emitBoxedValueCleanup,
  emitBoxedValueDeclarations,
  emitErrorChannelDeclarations,
  emitLoopFlowDeclarations,
  emitOwnedValueCleanup,
  emitOwnedValueDeclarations,
  emitReturnFlowDeclarations,
  emitRuntimeTypeCheck
} from '../context.ts'
import { isManagedRuntimeReturnType } from '../value-types.ts'
import type { CallbackLoweringDependencies } from './callbacks.ts'
import type { IrProgram } from '../../types.ts'

type PreparedExpression = {
  lines: string[]
  expression: string
}

export type PromiseChainLoweringDependencies = {
  callbackLoweringDependencies: CallbackLoweringDependencies
  collectArrowCaptures: (expression: any, outerScopes: Map<string, any>[], context: any, deps: CallbackLoweringDependencies) => any[]
  emitPreparedNumberExpression: (expression: any, context: any) => PreparedExpression
  emitRuntimeArrowCallbackContextFinalizerDeclaration: (wrapper: any) => string[]
  emitRuntimeArrowCallbackContextLocals: (wrapper: any, context: any, deps: CallbackLoweringDependencies) => string[]
  emitRuntimeCallbackRuntimeValueReturnLines: (argument: any, context: any) => string[]
  emitStatementList: (statements: any[], context: any) => string[]
  functionUsesExternalEventLoop: (node: any, externalNames: Set<any>) => boolean
  isPromiseChainCallbackWrapperWithContext: (wrapper: any) => boolean
}

export function collectPromiseChainWrappers(irPrograms: IrProgram[], context: any, deps: PromiseChainLoweringDependencies): Map<any, any> {
  const wrappers = new Map()
  const declare = (scope, name, info) => {
    scope.set(name, info)
  }
  const declareParams = (scope, params) => {
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
  const lookup = (name, scopes) => {
    for (let index = scopes.length - 1; index >= 0; index -= 1) {
      const entry = scopes[index].get(name)

      if (entry != null) {
        return entry
      }
    }

    return null
  }
  const isRuntimeManagedCaptureBinding = (statement, scopes, valueType) => {
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
  const declareVariable = (scope, statement, scopes) => {
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
  const register = (expression, scopes) => {
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

    const wrapper = {
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
  const visitStatement = (statement, scopes) => {
    if (statement == null) {
      return
    }

    if (statement.type === 'VariableDeclaration') {
      visitExpression(statement.init, scopes)
      declareVariable(scopes.at(-1), statement, scopes)
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
      const scope = new Map()
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
      const scope = new Map()
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
      const scope = new Map()
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
        const scope = new Map()
        item.consequent.forEach((statement) => visitStatement(statement, [...scopes, scope]))
      }
      return
    }

    if (statement.type === 'TryStatement') {
      visitStatement(statement.block, scopes)
      visitStatement(statement.handler?.body, scopes)
      visitStatement(statement.finalizer, scopes)
    }
  }
  const visitExpression = (expression, scopes) => {
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
    const topLevelScope = new Map()

    for (const item of collectIrTopLevelNodeEntries(ir)) {
      if (item.kind === 'function') {
        const scope = new Map()
        declareParams(scope, item.node.params)
        item.node.body.forEach((statement) => visitStatement(statement, [topLevelScope, scope]))
      } else if (item.kind === 'statement') {
        visitStatement(item.node, [topLevelScope])
      }
    }
  }

  return wrappers
}

export function emitPromiseChainCallbackWrapperHead(wrapper: any): string {
  return `static ccjs_status ${wrapper.name}(void* context, ccjs_value ccjs_value_input, ccjs_value* out)`
}

export function emitPromiseChainCallbackWrapperDeclaration(wrapper: any, baseContext: any, deps: PromiseChainLoweringDependencies): string[] {
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

function emitPromiseChainCallbackParamPrelude(wrapper: any, context: any): string[] {
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

function emitPromiseChainCallbackStatementLines(wrapper: any, context: any, deps: PromiseChainLoweringDependencies): string[] {
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

function emitPromiseChainCallbackReturnLines(returnExpression: any, wrapper: any, context: any, deps: PromiseChainLoweringDependencies): string[] {
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

export function resolvePromiseChainArrowBody(callback: any): any | null {
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

function isStraightLinePromiseCallbackStatement(statement: any): boolean {
  return statement?.type === 'VariableDeclaration' || statement?.type === 'ExpressionStatement'
}

function isPromiseChainCallbackStatement(statement: any): boolean {
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

function isPromiseChainCallbackSwitchStatement(statement: any): boolean {
  return statement.cases.every((item) => item.consequent.every(isPromiseChainCallbackStatement))
}
