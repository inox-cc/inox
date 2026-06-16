import type { AnyNode } from '../types.ts'

const NODE_CHILD_KEYS = [
  'body',
  'params',
  'fields',
  'methods',
  'init',
  'condition',
  'consequent',
  'alternate',
  'test',
  'update',
  'iterable',
  'discriminant',
  'cases',
  'block',
  'handler',
  'finalizer',
  'argument',
  'args',
  'callee',
  'object',
  'index',
  'target',
  'value',
  'valueType',
  'functionType',
  'returnShape',
  'left',
  'right',
  'elements',
  'properties',
  'expression'
]

export function emitCOperator(operator: string): string {
  if (operator === '===' || operator === '==') {
    return '=='
  }

  if (operator === '!==' || operator === '!=') {
    return '!='
  }

  return operator
}

export function cUnsupportedExpressionCode(valueType: string): string {
  if (valueType === 'function') {
    return 'CCJS_C_FUNCTION_VALUE'
  }

  if (valueType === 'optional') {
    return 'CCJS_C_OPTIONAL_CHAINING'
  }

  if (valueType === 'class') {
    return 'CCJS_C_CLASS'
  }

  if (valueType === 'async' || valueType === 'promise') {
    return 'CCJS_C_ASYNC'
  }

  if (valueType === 'js-global') {
    return 'CCJS_C_JS_GLOBAL'
  }

  if (valueType === 'map' || valueType === 'set') {
    return 'CCJS_C_COLLECTION'
  }

  return 'CCJS_C_UNSUPPORTED_EXPR'
}

export function cUnsupportedVariableDeclarationCode(statement: AnyNode, valueType: string): string {
  if (statement.init != null && statement.init.type === 'AwaitExpression') {
    return 'CCJS_C_ASYNC'
  }

  return cUnsupportedExpressionCode(valueType)
}

export function containsAwaitExpression(node: AnyNode | AnyNode[] | null | undefined): boolean {
  if (node == null) {
    return false
  }

  if (Array.isArray(node)) {
    for (const item of node) {
      if (containsAwaitExpression(item)) {
        return true
      }
    }

    return false
  }

  const current = node

  if (current.type === 'AwaitExpression') {
    return true
  }

  for (const key of NODE_CHILD_KEYS) {
    const value = current[key]

    if (value != null && containsAwaitExpression(value)) {
      return true
    }
  }

  return false
}

export function isOptionalChainExpression(expression: AnyNode | null | undefined): boolean {
  if (expression == null) {
    return false
  }

  return (
    expression.type === 'OptionalMemberExpression' ||
    expression.type === 'OptionalIndexExpression' ||
    expression.type === 'OptionalCallExpression'
  )
}

export function isNullishCoalescingExpression(expression: AnyNode | null | undefined): boolean {
  return expression != null && expression.type === 'BinaryExpression' && expression.operator === '??'
}
