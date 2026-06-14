export function emitCOperator(operator: string): string {
  if (operator === '===' || operator === '==') {
    return '=='
  }

  if (operator === '!==' || operator === '!=') {
    return '!='
  }

  return operator
}

export function cUnsupportedExpressionCode(type: string): string {
  if (type === 'function') {
    return 'CCJS_C_FUNCTION_VALUE'
  }

  if (type === 'optional') {
    return 'CCJS_C_OPTIONAL_CHAINING'
  }

  if (type === 'class') {
    return 'CCJS_C_CLASS'
  }

  if (type === 'async' || type === 'promise') {
    return 'CCJS_C_ASYNC'
  }

  if (type === 'js-global') {
    return 'CCJS_C_JS_GLOBAL'
  }

  if (type === 'map' || type === 'set') {
    return 'CCJS_C_COLLECTION'
  }

  return 'CCJS_C_UNSUPPORTED_EXPR'
}

export function cUnsupportedVariableDeclarationCode(statement: any, type: string): string {
  if (statement?.init?.type === 'AwaitExpression') {
    return 'CCJS_C_ASYNC'
  }

  return cUnsupportedExpressionCode(type)
}

export function containsAwaitExpression(node: any): boolean {
  if (node == null) {
    return false
  }

  if (Array.isArray(node)) {
    return node.some((item) => containsAwaitExpression(item))
  }

  if (typeof node !== 'object') {
    return false
  }

  if (node.type === 'AwaitExpression') {
    return true
  }

  return Object.values(node).some((value) => containsAwaitExpression(value))
}

export function isOptionalChainExpression(expression: any): boolean {
  return (
    expression?.type === 'OptionalMemberExpression' ||
    expression?.type === 'OptionalIndexExpression' ||
    expression?.type === 'OptionalCallExpression'
  )
}

export function isNullishCoalescingExpression(expression: any): boolean {
  return expression?.type === 'BinaryExpression' && expression.operator === '??'
}
