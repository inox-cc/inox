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
