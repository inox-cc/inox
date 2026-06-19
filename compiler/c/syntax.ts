import type { AnyNode } from '../types.ts'

type SyntaxNode = {
  type?: string | null
  body?: any
  params?: any
  fields?: any
  methods?: any
  init?: any
  condition?: any
  consequent?: any
  alternate?: any
  test?: any
  update?: any
  iterable?: any
  discriminant?: any
  cases?: any
  block?: any
  handler?: any
  finalizer?: any
  argument?: any
  args?: any
  callee?: any
  object?: any
  index?: any
  target?: any
  value?: any
  valueType?: any
  functionType?: any
  returnShape?: any
  left?: any
  right?: any
  elements?: any
  properties?: any
  expression?: any
}

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
    return 'INOX_C_FUNCTION_VALUE'
  }

  if (valueType === 'optional') {
    return 'INOX_C_OPTIONAL_CHAINING'
  }

  if (valueType === 'class') {
    return 'INOX_C_CLASS'
  }

  if (valueType === 'async' || valueType === 'promise') {
    return 'INOX_C_ASYNC'
  }

  if (valueType === 'js-global') {
    return 'INOX_C_JS_GLOBAL'
  }

  if (valueType === 'map' || valueType === 'set') {
    return 'INOX_C_COLLECTION'
  }

  return 'INOX_C_UNSUPPORTED_EXPR'
}

export function cUnsupportedVariableDeclarationCode(statement: AnyNode, valueType: string): string {
  const declaration = statement as VariableDeclarationCodeNode
  const init = declaration.init

  if (init !== null && typeof init !== 'undefined' && init.type === 'AwaitExpression') {
    return 'INOX_C_ASYNC'
  }

  return cUnsupportedExpressionCode(valueType)
}

export function containsAwaitExpression(node: SyntaxNode | SyntaxNode[] | null | undefined): boolean {
  if (node === null || typeof node === 'undefined') {
    return false
  }

  if (Array.isArray(node)) {
    return containsAwaitExpressionList(node)
  }

  const current = node

  if (current.type === 'AwaitExpression') {
    return true
  }

  return containsAwaitChildExpression(current)
}

function containsAwaitExpressionList(nodes: SyntaxNode[]): boolean {
  for (const item of nodes) {
    if (containsAwaitExpression(item)) {
      return true
    }
  }

  return false
}

function containsAwaitChild(value: any): boolean {
  if (value === null || typeof value === 'undefined' || typeof value !== 'object') {
    return false
  }

  return containsAwaitExpression(value)
}

function containsAwaitChildExpression(current: SyntaxNode): boolean {
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
  if (expression === null || typeof expression === 'undefined') {
    return false
  }

  return (
    expression.type === 'OptionalMemberExpression' ||
    expression.type === 'OptionalIndexExpression' ||
    expression.type === 'OptionalCallExpression'
  )
}

export function isCoalesceExpression(expression: AnyNode | null | undefined): boolean {
  return (
    expression !== null &&
    typeof expression !== 'undefined' &&
    expression.type === 'BinaryExpression' &&
    expression.operator === '??'
  )
}
