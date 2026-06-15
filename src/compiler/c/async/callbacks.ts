import { collectIrTopLevelNodeEntries } from '../../ir.ts'
import { isCJsGlobalRoot } from '../globals.ts'
import { emitCFunctionName, emitCIdentifier } from '../identifiers.ts'
import { isManagedRuntimeReturnType, emitCType } from '../value-types.ts'
import { isPromiseConstructorExpression, functionTakesEventLoopParam } from './promises.ts'
import { isTimerStartCallExpression, timerCallbackFunctionType } from '../stdlib/timers.ts'
import {
  createFunctionContext,
  emitBoxedValueCleanup,
  emitBoxedValueDeclarations,
  emitCleanupReturn,
  emitErrorChannelDeclarations,
  emitLoopFlowDeclarations,
  emitOwnedValueCleanup,
  emitOwnedValueDeclarations,
  emitReturnFlowDeclarations,
  shouldEmitCleanupLabel,
  type CEmitContext,
  type CFunctionContext
} from '../context.ts'
import type {
  CCallbackContextWrapper,
  CCallbackWrapper,
  CFunctionParam,
  CFunctionType,
  CPlainArrowCallbackWrapper,
  CPromiseChainWrapper,
  CRuntimeArrowCallbackWrapper,
  CRuntimeArrowCapture,
  CRuntimeCallbackWrapper
} from '../types.ts'
import type { AnyNode, IrProgram } from '../../types.ts'
import type { CPreparedExpression as PreparedExpression } from '../types.ts'


export type CallbackLoweringDependencies = {
  collectTemplatePlaceholderExpressions: (expression: AnyNode) => AnyNode[]
  emitPreparedNumberExpression: (expression: AnyNode, context: CFunctionContext) => PreparedExpression
  emitRuntimeCallbackRuntimeValueReturnLines: (argument: AnyNode, context: CFunctionContext) => string[]
  emitStatementList: (statements: AnyNode[], context: CFunctionContext) => string[]
  registerObjectShape: (context: CFunctionContext, name: string, shape: any) => void
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
  shape?: any
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

export function functionUsesExternalEventLoop(node: AnyNode, externalNames: Set<string>): boolean {
  let found = false
  const visit = (value: unknown): void => {
    if (found || value == null) {
      return
    }

    if (Array.isArray(value)) {
      value.forEach(visit)
      return
    }

    if (typeof value !== 'object') {
      return
    }

    const current = value as AnyNode

    if (isTimerStartCallExpression(current)) {
      found = true
      return
    }

    if (
      current.type === 'CallExpression' &&
      current.callee?.type === 'Reference' &&
      current.callee.path.length === 1 &&
      externalNames.has(current.callee.path[0])
    ) {
      found = true
      return
    }

    for (const [key, child] of Object.entries(current)) {
      if (key === 'loc' || key === 'shape') {
        continue
      }

      visit(child)
    }
  }

  visit(node)

  return found
}

const genericFunctionType: CFunctionType = {
  kind: 'function',
  params: [],
  returnType: 'void'
}

export function normalizeFunctionType(functionType: CFunctionType | null | undefined): CFunctionType {
  return functionType ?? genericFunctionType
}

export function isPlainFunctionPointerType(functionType: CFunctionType | null | undefined): boolean {
  return (
    functionType == null ||
    (functionType.returnType === 'void' &&
      functionType.params.every((param) => ['number', 'boolean'].includes(param.valueType)))
  )
}

export function isRuntimeFunctionType(functionType: CFunctionType | null | undefined): boolean {
  return (
    functionType != null &&
    isSupportedRuntimeCallbackReturnType(functionType.returnType) &&
    functionType.params.some((param) => ['string', 'object'].includes(param.valueType)) &&
    functionType.params.every((param) => ['number', 'boolean', 'string', 'object'].includes(param.valueType))
  )
}

export function isNullableFunctionType(valueType: string | null | undefined, nullable: boolean | null | undefined): boolean {
  return valueType === 'function' && nullable === true
}

export function isSupportedRuntimeCallbackType(functionType: CFunctionType | null | undefined): boolean {
  const normalized = normalizeFunctionType(functionType)

  return (
    isSupportedRuntimeCallbackReturnType(normalized.returnType) &&
    normalized.params.every((param) => ['number', 'boolean', 'string', 'object'].includes(param.valueType))
  )
}

export function isSupportedRuntimeCallbackReturnType(returnType: string | null | undefined): boolean {
  if (returnType == null) {
    return false
  }

  return ['void', 'number', 'boolean', 'string', 'object'].includes(returnType)
}

function runtimeFunctionParamKey(functionName: string, index: number): string {
  return `${functionName}:${index}`
}

export function markRuntimeFunctionParam(
  callee: AnyNode,
  index: number,
  functionType: CFunctionType | null | undefined,
  context: CEmitContext
): void {
  if (callee?.type !== 'Reference' || callee.path.length !== 1) {
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
  context: CEmitContext
): CFunctionType | null {
  const promoted = context.runtimeFunctionParams.get(runtimeFunctionParamKey(functionName, index))

  if (promoted != null) {
    return promoted
  }

  if (isNullableFunctionType(param.valueType, param.nullable)) {
    return normalizeFunctionType(param.functionType)
  }

  return isRuntimeFunctionType(param.functionType) ? normalizeFunctionType(param.functionType) : null
}

export function resolveRuntimeFunctionArgumentType(
  callee: AnyNode,
  index: number,
  param: CFunctionParam,
  context: CEmitContext
): CFunctionType | null {
  if (param?.valueType !== 'function') {
    return null
  }

  if (callee?.type === 'Reference' && callee.path.length === 1) {
    const promoted = context.runtimeFunctionParams.get(runtimeFunctionParamKey(callee.path[0], index))

    if (promoted != null) {
      return promoted
    }
  }

  if (isNullableFunctionType(param.valueType, param.nullable)) {
    return normalizeFunctionType(param.functionType)
  }

  return isRuntimeFunctionType(param.functionType) ? normalizeFunctionType(param.functionType) : null
}

export function collectCallbackWrappers(
  irPrograms: IrProgram[],
  context: CEmitContext,
  deps: CallbackLoweringDependencies
): Map<string, CCallbackWrapper> {
  const wrappers = new Map<string, CCallbackWrapper>()
  const pendingPlainFunctionArgs: PendingPlainFunctionArg[] = []
  const register = (
    expression: AnyNode,
    functionType: CFunctionType | null | undefined,
    scopes: CallbackScope[]
  ): void => {
    const arrowNeedsEventLoop =
      expression?.type === 'ArrowFunctionExpression' &&
      functionUsesExternalEventLoop(expression, context.externalEventLoopFunctions)

    if (
      isPlainFunctionPointerType(functionType) &&
      expression?.type === 'ArrowFunctionExpression' &&
      !arrowNeedsEventLoop
    ) {
      registerPlainArrow(expression, normalizeFunctionType(functionType), scopes)
      return
    }

    if (arrowNeedsEventLoop && isSupportedRuntimeCallbackType(functionType)) {
      registerRuntime(expression, functionType, scopes)
      return
    }

    if (!isRuntimeFunctionType(functionType)) {
      return
    }

    if (expression?.type === 'ArrowFunctionExpression') {
      registerArrow(expression, normalizeFunctionType(functionType), scopes)
      return
    }

    registerNamed(expression, normalizeFunctionType(functionType))
  }
  const registerRuntime = (
    expression: AnyNode,
    functionType: CFunctionType | null | undefined,
    scopes: CallbackScope[]
  ): void => {
    const normalized = normalizeFunctionType(functionType)

    if (!isSupportedRuntimeCallbackType(normalized)) {
      return
    }

    if (expression?.type === 'ArrowFunctionExpression') {
      registerArrow(expression, normalized, scopes)
      return
    }

    registerNamed(expression, normalized)
  }
  const registerPlain = (
    expression: AnyNode,
    functionType: CFunctionType | null | undefined,
    scopes: CallbackScope[]
  ): void => {
    if (expression?.type === 'ArrowFunctionExpression') {
      registerPlainArrow(expression, normalizeFunctionType(functionType), scopes)
    }
  }
  const hasCaptures = (expression: AnyNode, scopes: CallbackScope[]): boolean =>
    expression?.type === 'ArrowFunctionExpression' && collectArrowCaptures(expression, scopes, context, deps).length > 0
  const shouldPromotePlainFunctionExpression = (
    expression: AnyNode,
    functionType: CFunctionType | null | undefined,
    scopes: CallbackScope[]
  ): boolean =>
    isPlainFunctionPointerType(functionType) &&
    isSupportedRuntimeCallbackType(functionType) &&
    hasCaptures(expression, scopes)
  const registerNamed = (expression: AnyNode, functionType: CFunctionType): void => {
    if (expression?.type !== 'Reference' || expression.path.length !== 1) {
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
      key,
      name: `ccjs_callback_${emitCIdentifier(target)}_${wrappers.size}`,
      target,
      functionType
    }

    wrappers.set(key, wrapper)
  }
  const registerArrow = (expression: AnyNode, functionType: CFunctionType, scopes: CallbackScope[]): void => {
    if (context.callbackArrowWrappers.has(expression)) {
      return
    }

    const index = wrappers.size
    const key = `arrow:${index}`
    const captures = collectArrowCaptures(expression, scopes, context, deps)

    for (const capture of captures) {
      if (
        capture.mutable &&
        ['number', 'boolean', 'string', 'object'].includes(capture.valueType) &&
        capture.declaration != null
      ) {
        context.boxedMutableCaptureDeclarations.add(capture.declaration)
      }
    }

    const wrapper: CCallbackWrapper = {
      kind: 'arrow',
      key,
      name: `ccjs_callback_arrow_${index}`,
      contextTypeName: `ccjs_callback_context_${index}`,
      finalizerName: `ccjs_callback_context_${index}_finalize`,
      expression,
      functionType,
      needsEventLoop: functionUsesExternalEventLoop(expression, context.externalEventLoopFunctions),
      captures
    }

    wrappers.set(key, wrapper)
    context.callbackArrowWrappers.set(expression, wrapper)
  }
  const registerPlainArrow = (expression: AnyNode, functionType: CFunctionType, scopes: CallbackScope[]): void => {
    if (context.callbackArrowWrappers.has(expression)) {
      return
    }

    const captures = collectArrowCaptures(expression, scopes, context, deps)

    if (captures.length > 0) {
      return
    }

    const index = wrappers.size
    const key = `plain-arrow:${index}`
    const wrapper: CCallbackWrapper = {
      kind: 'plain-arrow',
      key,
      name: `ccjs_callback_arrow_${index}`,
      expression,
      functionType
    }

    wrappers.set(key, wrapper)
    context.callbackArrowWrappers.set(expression, wrapper)
  }
  const declare = (scope: CallbackScope, name: string, info: CallbackScopeBinding): void => {
    scope.set(name, info)
  }
  const declareParams = (scope: CallbackScope, params: CFunctionParam[]): void => {
    for (const param of params) {
      declare(scope, param.name, {
        name: param.name,
        valueType: param.valueType,
        declaration: param,
        functionType: param.functionType,
        nullable: param.nullable === true,
        shape: param.shape,
        runtimeManaged: ['string', 'object'].includes(param.valueType),
        mutable: true
      })
    }
  }
  const declareVariable = (scope: CallbackScope, statement: AnyNode, scopes: CallbackScope[]): void => {
    const valueType =
      statement.valueType === 'unknown' ? inferCapturedExpressionValueType(statement.init, scopes) : statement.valueType

    declare(scope, statement.name, {
      name: statement.name,
      valueType,
      functionType: statement.functionType,
      declaration: statement,
      nullable: statement.nullable === true,
      shape: statement.shape,
      runtimeCallback:
        isNullableFunctionType(valueType, statement.nullable) ||
        isRuntimeFunctionType(statement.functionType) ||
        shouldPromotePlainFunctionExpression(statement.init, statement.functionType, scopes),
      runtimeManaged: isRuntimeManagedCaptureBinding(statement, scopes, valueType),
      mutable: statement.kind === 'let'
    })
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
  const inferCapturedExpressionValueType = (expression: AnyNode, scopes: CallbackScope[]): string => {
    if (expression?.valueType != null && expression.valueType !== 'unknown') {
      return expression.valueType
    }

    if (expression?.type === 'Reference' && expression.path.length === 1) {
      return lookup(expression.path[0], scopes)?.valueType ?? 'unknown'
    }

    if (expression?.type === 'MemberExpression') {
      const object = inferCapturedExpressionInfo(expression.object, scopes)
      const field = object.shape?.fields?.find((field) => field.name === expression.property)

      return field?.valueType ?? 'unknown'
    }

    if (expression?.type === 'IndexExpression' && expression.index.type === 'StringLiteral') {
      const object = inferCapturedExpressionInfo(expression.object, scopes)
      const field = object.shape?.fields?.find((field) => field.name === expression.index.value)

      return field?.valueType ?? 'unknown'
    }

    return 'unknown'
  }
  const inferCapturedExpressionInfo = (expression: AnyNode, scopes: CallbackScope[]): CallbackScopeBinding => {
    if (expression?.type === 'Reference' && expression.path.length === 1) {
      const entry = lookup(expression.path[0], scopes)

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
  const visitStatement = (statement: AnyNode | null | undefined, scopes: CallbackScope[]): void => {
    if (statement?.type === 'VariableDeclaration') {
      if (isNullableFunctionType(statement.valueType, statement.nullable)) {
        registerRuntime(statement.init, statement.functionType, scopes)
      } else if (shouldPromotePlainFunctionExpression(statement.init, statement.functionType, scopes)) {
        registerRuntime(statement.init, statement.functionType, scopes)
      } else {
        register(statement.init, statement.functionType, scopes)
      }

      visitExpression(statement.init, scopes)
      declareVariable(scopes[scopes.length - 1], statement, scopes)
      return
    }

    if (statement?.type === 'ExpressionStatement') {
      visitExpression(statement.expression, scopes)
      return
    }

    if (statement?.type === 'ReturnStatement') {
      visitExpression(statement.argument, scopes)
      return
    }

    if (statement?.type === 'ThrowStatement') {
      visitExpression(statement.argument, scopes)
      return
    }

    if (statement?.type === 'BlockStatement') {
      const scope: CallbackScope = new Map()
      statement.body.forEach((item) => visitStatement(item, [...scopes, scope]))
      return
    }

    if (statement?.type === 'IfStatement') {
      visitExpression(statement.condition, scopes)
      visitStatement(statement.consequent, scopes)
      visitStatement(statement.alternate, scopes)
      return
    }

    if (statement?.type === 'WhileStatement') {
      visitExpression(statement.condition, scopes)
      visitStatement(statement.body, scopes)
      return
    }

    if (statement?.type === 'ForStatement') {
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

    if (statement?.type === 'ForOfStatement') {
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

    if (statement?.type === 'SwitchStatement') {
      visitExpression(statement.discriminant, scopes)

      for (const item of statement.cases) {
        visitExpression(item.test, scopes)
        const scope: CallbackScope = new Map()
        item.consequent.forEach((statement: AnyNode) => visitStatement(statement, [...scopes, scope]))
      }
    }

    if (statement?.type === 'TryStatement') {
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
      if (isTimerStartCallExpression(expression)) {
        registerRuntime(expression.args[0], timerCallbackFunctionType(), scopes)
      }

      const params = resolveStaticFunctionParams(expression.callee, context)

      for (const [index, arg] of expression.args.entries()) {
        const param = params?.[index]

        if (param?.valueType === 'function') {
          if (isNullableFunctionType(param.valueType, param.nullable)) {
            registerRuntime(arg, param.functionType, scopes)
          } else if (isRuntimeFunctionType(param.functionType)) {
            registerRuntime(arg, param.functionType, scopes)
          } else {
            pendingPlainFunctionArgs.push({
              callee: expression.callee,
              index,
              arg,
              functionType: normalizeFunctionType(param.functionType),
              scopes
            })

            const argInfo = arg.type === 'Reference' && arg.path.length === 1 ? lookup(arg.path[0], scopes) : null

            if (hasCaptures(arg, scopes) || argInfo?.runtimeCallback === true) {
              markRuntimeFunctionParam(expression.callee, index, param.functionType, context)
            }
          }
        }

        visitExpression(arg, scopes)
      }

      visitExpression(expression.callee, scopes)
      return
    }

    if (expression.type === 'AssignmentExpression') {
      const targetInfo =
        expression.target?.type === 'Reference' && expression.target.path.length === 1
          ? lookup(expression.target.path[0], scopes)
          : null

      if (targetInfo != null && isNullableFunctionType(targetInfo.valueType, targetInfo.nullable)) {
        registerRuntime(expression.value, targetInfo.functionType, scopes)
      }

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

    if (expression.type === 'NewExpression' && isPromiseConstructorExpression(expression)) {
      visitExpression(expression.callee, scopes)

      const executor = expression.args[0]

      if (executor?.type === 'ArrowFunctionExpression') {
        const scope: CallbackScope = new Map()

        for (const [index, param] of executor.params.entries()) {
          declare(scope, param.name, {
            name: param.name,
            valueType: 'promise-settlement',
            promiseSettlementKind: index === 1 ? 'reject' : 'resolve',
            loc: param.loc,
            mutable: false
          })
        }

        const executorScopes = [...scopes, scope]

        if (executor.expressionBody) {
          visitExpression(executor.body, executorScopes)
        } else {
          executor.body.forEach((statement) => visitStatement(statement, executorScopes))
        }

        return
      }

      expression.args.forEach((arg) => visitExpression(arg, scopes))
      return
    }

    if (expression.type === 'OptionalCallExpression' || expression.type === 'NewExpression') {
      visitExpression(expression.callee, scopes)
      expression.args.forEach((arg) => visitExpression(arg, scopes))
      return
    }

    if (expression.type === 'ArrayLiteral') {
      expression.elements.forEach((element) => visitExpression(element, scopes))
      return
    }

    if (expression.type === 'ObjectLiteral') {
      expression.properties.forEach((property) => visitExpression(property.value, scopes))
      return
    }

    if (expression.type === 'ArrowFunctionExpression') {
      const scope: CallbackScope = new Map()

      for (const param of expression.params) {
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

      const arrowScopes = [...scopes, scope]

      if (expression.expressionBody) {
        visitExpression(expression.body, arrowScopes)
      } else {
        expression.body.forEach((statement) => visitStatement(statement, arrowScopes))
      }

      return
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

  for (const pending of pendingPlainFunctionArgs) {
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
      registerRuntime(pending.arg, pending.functionType, pending.scopes)
    } else {
      registerPlain(pending.arg, pending.functionType, pending.scopes)
    }
  }

  return wrappers
}

export function collectArrowCaptures(
  expression: AnyNode,
  outerScopes: CallbackScope[],
  context: CEmitContext,
  deps: CallbackLoweringDependencies
): CRuntimeArrowCapture[] {
  const captures = new Map<string, CRuntimeArrowCapture>()
  const localScope: CallbackScope = new Map()
  const localScopes = [localScope]

  for (const param of expression.params) {
    localScope.set(param.name, {
      name: param.name,
      valueType: param.valueType,
      mutable: true
    })
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
  const addReference = (reference: AnyNode): void => {
    if (reference.path.length !== 1) {
      return
    }

    const name = reference.path[0]

    if (lookup(name, localScopes) != null || context.functionNames.has(name) || isCJsGlobalRoot(name, context)) {
      return
    }

    const outer = lookup(name, outerScopes)

    if (outer != null && !captures.has(name)) {
      captures.set(name, {
        ...outer,
        name
      })
    }
  }
  const declareLocal = (statement: AnyNode): void => {
    localScopes[localScopes.length - 1].set(statement.name, {
      name: statement.name,
      valueType: statement.valueType,
      functionType: statement.functionType,
      shape: statement.shape,
      mutable: statement.kind === 'let'
    })
  }
  const visitStatement = (statement: AnyNode | null | undefined): void => {
    if (statement == null) {
      return
    }

    if (statement.type === 'VariableDeclaration') {
      visitExpression(statement.init)
      declareLocal(statement)
      return
    }

    if (statement.type === 'ExpressionStatement') {
      visitExpression(statement.expression)
      return
    }

    if (statement.type === 'ReturnStatement' || statement.type === 'ThrowStatement') {
      visitExpression(statement.argument)
      return
    }

    if (statement.type === 'BlockStatement') {
      localScopes.push(new Map<string, CallbackScopeBinding>())
      statement.body.forEach(visitStatement)
      localScopes.pop()
      return
    }

    if (statement.type === 'IfStatement') {
      visitExpression(statement.condition)
      visitStatement(statement.consequent)
      visitStatement(statement.alternate)
      return
    }

    if (statement.type === 'WhileStatement') {
      visitExpression(statement.condition)
      visitStatement(statement.body)
      return
    }

    if (statement.type === 'ForStatement') {
      localScopes.push(new Map<string, CallbackScopeBinding>())

      if (statement.init?.type === 'VariableDeclaration') {
        visitStatement(statement.init)
      } else {
        visitExpression(statement.init)
      }

      visitExpression(statement.test)
      visitExpression(statement.update)
      visitStatement(statement.body)
      localScopes.pop()
      return
    }

    if (statement.type === 'ForOfStatement') {
      visitExpression(statement.iterable)
      localScopes.push(
        new Map<string, CallbackScopeBinding>([
          [
            statement.name,
            {
              name: statement.name,
              valueType: 'unknown',
              mutable: statement.kind === 'let'
            }
          ]
        ])
      )
      visitStatement(statement.body)
      localScopes.pop()
      return
    }

    if (statement.type === 'SwitchStatement') {
      visitExpression(statement.discriminant)

      for (const item of statement.cases) {
        visitExpression(item.test)
        localScopes.push(new Map<string, CallbackScopeBinding>())
        item.consequent.forEach(visitStatement)
        localScopes.pop()
      }
    }

    if (statement.type === 'TryStatement') {
      visitStatement(statement.block)

      if (statement.handler != null) {
        const catchScope: CallbackScope = new Map()

        if (statement.handler.param != null) {
          catchScope.set(statement.handler.param, {
            name: statement.handler.param,
            valueType: 'string',
            mutable: true
          })
        }

        localScopes.push(catchScope)
        visitStatement(statement.handler.body)
        localScopes.pop()
      }

      visitStatement(statement.finalizer)
    }
  }
  const visitExpression = (node: AnyNode | null | undefined): void => {
    if (node == null) {
      return
    }

    if (node.type === 'TemplateLiteral') {
      for (const expression of deps.collectTemplatePlaceholderExpressions(node)) {
        visitExpression(expression)
      }

      return
    }

    if (node.type === 'Reference') {
      addReference(node)
      return
    }

    if (node.type === 'MemberExpression' || node.type === 'OptionalMemberExpression') {
      visitExpression(node.object)
      return
    }

    if (node.type === 'IndexExpression' || node.type === 'OptionalIndexExpression') {
      visitExpression(node.object)
      visitExpression(node.index)
      return
    }

    if (node.type === 'CallExpression' || node.type === 'OptionalCallExpression' || node.type === 'NewExpression') {
      visitExpression(node.callee)
      node.args.forEach(visitExpression)
      return
    }

    if (node.type === 'AssignmentExpression') {
      visitExpression(node.target)
      visitExpression(node.value)
      return
    }

    if (node.type === 'BinaryExpression') {
      visitExpression(node.left)
      visitExpression(node.right)
      return
    }

    if (node.type === 'UnaryExpression' || node.type === 'UpdateExpression' || node.type === 'AwaitExpression') {
      visitExpression(node.argument)
      return
    }

    if (node.type === 'ArrayLiteral') {
      node.elements.forEach(visitExpression)
      return
    }

    if (node.type === 'ObjectLiteral') {
      node.properties.forEach((property) => visitExpression(property.value))
    }
  }

  if (expression.expressionBody) {
    visitExpression(expression.body)
  } else {
    expression.body.forEach(visitStatement)
  }

  return [...captures.values()]
}

function resolveStaticFunctionParams(callee: AnyNode, context: CEmitContext): CFunctionParam[] | null {
  if (callee?.type !== 'Reference' || callee.path.length !== 1) {
    return null
  }

  return context.functionParams.get(callee.path[0]) ?? null
}

function runtimeCallbackWrapperKey(target: string, functionType: CFunctionType): string {
  return `${target}:${functionType.returnType}(${functionType.params.map((param) => param.valueType).join(',')})`
}

export function runtimeCallbackWrapperFor(
  target: string,
  functionType: CFunctionType,
  context: CEmitContext
): CCallbackWrapper | null {
  return context.callbackWrappers.get(runtimeCallbackWrapperKey(target, functionType)) ?? null
}

export function emitRuntimeCallbackWrapperHead(wrapper: CRuntimeCallbackWrapper): string {
  return `static ccjs_status ${wrapper.name}(void* context, const ccjs_value* args, size_t arg_count, ccjs_value* out)`
}

export function isRuntimeCallbackWrapper(wrapper: CCallbackWrapper): wrapper is CRuntimeCallbackWrapper {
  return wrapper.kind !== 'plain-arrow'
}

export function emitPlainArrowCallbackWrapperHead(wrapper: CPlainArrowCallbackWrapper): string {
  return `static ${emitFunctionPointerReturnType(wrapper.functionType)} ${wrapper.name}(${emitPlainArrowCallbackParams(wrapper)})`
}

function emitPlainArrowCallbackParams(wrapper: CPlainArrowCallbackWrapper): string {
  const params = wrapper.functionType?.params ?? []

  if (params.length === 0) {
    return 'void'
  }

  return params
    .map((param, index) => `${emitCType(param.valueType)} ${plainArrowCallbackParamName(wrapper, index)}`)
    .join(', ')
}

export function emitPlainArrowCallbackWrapperDeclaration(
  wrapper: CPlainArrowCallbackWrapper,
  baseContext: CEmitContext,
  deps: CallbackLoweringDependencies
): string[] {
  const context = createFunctionContext(baseContext, wrapper.functionType?.returnType ?? 'void')
  context.cleanupEnabled = false

  for (const [index, param] of (wrapper.functionType?.params ?? []).entries()) {
    context.variables.set(plainArrowCallbackParamName(wrapper, index), param.valueType)
  }

  const statements = wrapper.expression.expressionBody
    ? [
        {
          type: 'ExpressionStatement',
          expression: wrapper.expression.body
        }
      ]
    : wrapper.expression.body
  const statementLines = deps.emitStatementList(statements, context)
  const lines = [
    `${emitPlainArrowCallbackWrapperHead(wrapper)} {`,
    ...emitOwnedValueDeclarations(context).map((line) => `  ${line}`),
    ...emitBoxedValueDeclarations(context).map((line) => `  ${line}`),
    ...statementLines.map((line) => `  ${line}`)
  ]

  if (shouldEmitCleanupLabel(context)) {
    lines.push('ccjs_cleanup:')
    lines.push(...emitOwnedValueCleanup(context).map((line) => `  ${line}`))
    lines.push(...emitBoxedValueCleanup(context).map((line) => `  ${line}`))
    lines.push(`  ${emitCleanupReturn(context)}`)
  }

  lines.push('}')

  return lines
}

function plainArrowCallbackParamName(wrapper: CPlainArrowCallbackWrapper, index: number): string {
  return wrapper.expression.params[index]?.name ?? `ccjs_arg_${index}`
}

export function emitRuntimeCallbackWrapperDeclaration(
  wrapper: CRuntimeCallbackWrapper,
  context: CEmitContext,
  deps: CallbackLoweringDependencies
): string[] {
  if (wrapper.kind === 'arrow') {
    return emitRuntimeArrowCallbackWrapperDeclaration(wrapper, context, deps)
  }

  const targetTakesEventLoop = functionTakesEventLoopParam(wrapper.target, context)
  const lines = [
    `${emitRuntimeCallbackWrapperHead(wrapper)} {`,
    targetTakesEventLoop ? '  if (context == 0) return CCJS_ERR_TYPE;' : '  (void)context;',
    `  if (out == 0 || arg_count != ${wrapper.functionType.params.length}${wrapper.functionType.params.length === 0 ? '' : ' || args == 0'}) return CCJS_ERR_TYPE;`,
    '  *out = ccjs_undefined_value();'
  ]
  const args: string[] = []

  for (const [index, param] of wrapper.functionType.params.entries()) {
    lines.push(...emitRuntimeCallbackWrapperArgChecks(param, index).map((line) => `  ${line}`))
    args.push(emitRuntimeCallbackWrapperArg(param, index))
  }

  const callArgs = targetTakesEventLoop ? ['(ccjs_loop*)context', ...args] : args
  const call = `${context.functionNames.get(wrapper.target) ?? emitCFunctionName(wrapper.target)}(${callArgs.join(', ')})`

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
): wrapper is CRuntimeArrowCallbackWrapper {
  return wrapper?.kind === 'arrow' && hasRuntimeArrowCallbackContext(wrapper)
}

export function isPromiseChainCallbackWrapperWithContext(
  wrapper: CPromiseChainWrapper | null | undefined
): wrapper is CPromiseChainWrapper {
  return wrapper?.kind === 'promise-chain-arrow' && hasRuntimeArrowCallbackContext(wrapper)
}

export function hasRuntimeArrowCallbackContext(wrapper: CCallbackContextWrapper): boolean {
  return wrapper.captures.length > 0 || wrapper.needsEventLoop === true
}

export function emitRuntimeArrowCallbackContextType(wrapper: CCallbackContextWrapper): string[] {
  return [
    `typedef struct ${wrapper.contextTypeName} {`,
    ...(wrapper.needsEventLoop === true ? ['  ccjs_loop* ccjs_loop;'] : []),
    ...wrapper.captures.map(
      (capture) => `  ${emitRuntimeArrowCaptureCType(capture)} ${emitRuntimeArrowCaptureField(capture)};`
    ),
    `} ${wrapper.contextTypeName};`
  ]
}

export function emitRuntimeArrowCallbackContextFinalizerDeclaration(wrapper: CCallbackContextWrapper): string[] {
  const lines = [
    `static void ${wrapper.finalizerName}(void* context) {`,
    '  if (context == 0) return;',
    `  ${wrapper.contextTypeName}* captured = (${wrapper.contextTypeName}*)context;`
  ]

  for (const capture of wrapper.captures.filter(isRetainedRuntimeArrowCapture)) {
    lines.push(`  ccjs_release(captured->${emitRuntimeArrowCaptureField(capture)});`)
  }

  for (const capture of wrapper.captures.filter(isPromiseSettlementRuntimeArrowCapture)) {
    lines.push(`  if (captured->${emitRuntimeArrowCaptureField(capture)} != 0) {`)
    lines.push(`    ccjs_promise_release(captured->${emitRuntimeArrowCaptureField(capture)});`)
    lines.push('  }')
  }

  lines.push(
    `  ccjs_default_free(0, context, sizeof(${wrapper.contextTypeName}), _Alignof(${wrapper.contextTypeName}));`
  )
  lines.push('}')

  return lines
}

function emitRuntimeArrowCallbackWrapperDeclaration(
  wrapper: CRuntimeArrowCallbackWrapper,
  baseContext: CEmitContext,
  deps: CallbackLoweringDependencies
): string[] {
  const lines: string[] = []

  if (isRuntimeArrowCallbackWrapperWithContext(wrapper)) {
    lines.push(...emitRuntimeArrowCallbackContextFinalizerDeclaration(wrapper))
    lines.push('')
  }

  const context = createFunctionContext(baseContext, 'void')
  context.cleanupEnabled = false
  context.statusReturn = true
  context.runtimeCallbackReturnType = wrapper.functionType.returnType
  context.runtimeCallbackReturnShape = wrapper.functionType.returnShape ?? null
  context.runtimeCallbackReturnOut = '(*out)'
  context.runtimeCallbackCleanupLabel = 'ccjs_callback_cleanup'
  const bodyLines: string[] = []

  bodyLines.push(...emitRuntimeArrowCallbackContextLocals(wrapper, context, deps))
  bodyLines.push(...emitRuntimeArrowCallbackParamPrelude(wrapper, context, deps))
  const statementLines = emitRuntimeArrowCallbackStatementLines(wrapper, context, deps)

  lines.push(`${emitRuntimeCallbackWrapperHead(wrapper)} {`)

  if (isRuntimeArrowCallbackWrapperWithContext(wrapper)) {
    lines.push('  if (context == 0) return CCJS_ERR_TYPE;')
  } else {
    lines.push('  (void)context;')
  }

  lines.push(
    `  if (out == 0 || arg_count != ${wrapper.functionType.params.length}${wrapper.functionType.params.length === 0 ? '' : ' || args == 0'}) return CCJS_ERR_TYPE;`
  )
  lines.push('  *out = ccjs_undefined_value();')
  lines.push(...bodyLines.map((line) => `  ${line}`))
  lines.push(...emitLoopFlowDeclarations(context).map((line) => `  ${line}`))
  lines.push(...emitReturnFlowDeclarations(context).map((line) => `  ${line}`))
  lines.push(...emitOwnedValueDeclarations(context).map((line) => `  ${line}`))
  lines.push(...emitErrorChannelDeclarations(context).map((line) => `  ${line}`))
  lines.push(...emitBoxedValueDeclarations(context).map((line) => `  ${line}`))
  lines.push(...statementLines.map((line) => `  ${line}`))
  if (context.usedRuntimeCallbackCleanupGoto === true) {
    lines.push(`${context.runtimeCallbackCleanupLabel}:`)
  }
  lines.push(...emitOwnedValueCleanup(context).map((line) => `  ${line}`))
  lines.push(...emitBoxedValueCleanup(context).map((line) => `  ${line}`))
  lines.push('  return CCJS_OK;')
  lines.push('}')

  return lines
}

function emitRuntimeArrowCallbackStatementLines(
  wrapper: CRuntimeArrowCallbackWrapper,
  context: CFunctionContext,
  deps: CallbackLoweringDependencies
): string[] {
  if (wrapper.functionType.returnType === 'number' || wrapper.functionType.returnType === 'boolean') {
    if (!wrapper.expression.expressionBody) {
      return deps.emitStatementList(wrapper.expression.body, context)
    }

    const value = deps.emitPreparedNumberExpression(wrapper.expression.body, context)
    const expression =
      wrapper.functionType.returnType === 'number'
        ? `ccjs_number_value(${value.expression})`
        : `ccjs_bool_value((${value.expression}) != 0)`

    return [...value.lines, `*out = ${expression};`]
  }

  if (isManagedRuntimeReturnType(wrapper.functionType.returnType)) {
    if (!wrapper.expression.expressionBody) {
      return deps.emitStatementList(wrapper.expression.body, context)
    }

    return deps.emitRuntimeCallbackRuntimeValueReturnLines(wrapper.expression.body, context)
  }

  const statements = wrapper.expression.expressionBody
    ? [
        {
          type: 'ExpressionStatement',
          expression: wrapper.expression.body
        }
      ]
    : wrapper.expression.body

  return deps.emitStatementList(statements, context)
}

export function emitRuntimeArrowCallbackContextLocals(
  wrapper: CCallbackContextWrapper,
  context: CFunctionContext,
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

      context.promiseConstructorHandlers.set(capture.name, {
        kind: capture.promiseSettlementKind ?? 'resolve',
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
  context: CFunctionContext,
  deps: CallbackLoweringDependencies
): string[] {
  const lines: string[] = []

  for (const [index, param] of wrapper.functionType.params.entries()) {
    const name = wrapper.expression.params[index]?.name ?? `ccjs_arg_${index}`

    lines.push(...emitRuntimeCallbackWrapperArgChecks(param, index))
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
  }

  return lines
}

export function emitRuntimeArrowCaptureCType(capture: CRuntimeArrowCapture): string {
  if (capture.mutable) {
    if (['number', 'boolean'].includes(capture.valueType)) {
      return 'double*'
    }

    if (['string', 'object'].includes(capture.valueType)) {
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
  return capture.runtimeManaged === true && ['string', 'object'].includes(capture.valueType) && !capture.mutable
}

export function isPromiseSettlementRuntimeArrowCapture(capture: CRuntimeArrowCapture): boolean {
  return capture.valueType === 'promise-settlement'
}

export function isSupportedMutableRuntimeArrowCapture(
  capture: CRuntimeArrowCapture,
  context: CFunctionContext
): boolean {
  return (
    capture.mutable === true &&
    ['number', 'boolean', 'string', 'object'].includes(capture.valueType) &&
    capture.declaration != null &&
    context.boxedMutableCaptureDeclarations.has(capture.declaration)
  )
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
  return emitCType(functionType?.returnType ?? 'void')
}

export function emitFunctionPointerParams(functionType: CFunctionType | null | undefined): string {
  if (functionType == null || functionType.params.length === 0) {
    return 'void'
  }

  return functionType.params.map((param) => emitCType(param.valueType)).join(', ')
}
