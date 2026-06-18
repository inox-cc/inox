import type { AnyNode } from '../types.ts'

type VariableDeclarationCodeNode = {
  init?: VariableDeclarationInitNode | null
}

type VariableDeclarationInitNode = {
  type?: string | null
}

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
  const declaration = statement as VariableDeclarationCodeNode
  const init = declaration.init

  if (init != null && init.type === 'AwaitExpression') {
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

  return containsAwaitChildExpression(current)
}

function containsAwaitChild(value: any): boolean {
  if (value == null || typeof value !== 'object') {
    return false
  }

  return containsAwaitExpression(value)
}

function containsAwaitChildExpression(current: any): boolean {
  return (
    containsAwaitChild(current.body) ||
    containsAwaitChild(current.params) ||
    containsAwaitChild(current.fields) ||
    containsAwaitChild(current.methods) ||
    containsAwaitChild(current.init) ||
    containsAwaitChild(current.condition) ||
    containsAwaitChild(current.consequent) ||
    containsAwaitChild(current.alternate) ||
    containsAwaitChild(current.test) ||
    containsAwaitChild(current.update) ||
    containsAwaitChild(current.iterable) ||
    containsAwaitChild(current.discriminant) ||
    containsAwaitChild(current.cases) ||
    containsAwaitChild(current.block) ||
    containsAwaitChild(current.handler) ||
    containsAwaitChild(current.finalizer) ||
    containsAwaitChild(current.argument) ||
    containsAwaitChild(current.args) ||
    containsAwaitChild(current.callee) ||
    containsAwaitChild(current.object) ||
    containsAwaitChild(current.index) ||
    containsAwaitChild(current.target) ||
    containsAwaitChild(current.value) ||
    containsAwaitChild(current.valueType) ||
    containsAwaitChild(current.functionType) ||
    containsAwaitChild(current.returnShape) ||
    containsAwaitChild(current.left) ||
    containsAwaitChild(current.right) ||
    containsAwaitChild(current.elements) ||
    containsAwaitChild(current.properties) ||
    containsAwaitChild(current.expression)
  )
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
