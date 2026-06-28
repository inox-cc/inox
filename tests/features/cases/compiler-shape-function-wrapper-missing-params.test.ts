// @targets cc
// @expect pass
// @stdout inox_callback_arrow_0

import type { CompilerAnyNode } from './modules/compiler-anynode.ts'

type Wrapper = {
  kind: string
  name: string
}

type CallbackContext = {
  callbackArrowWrappers: Map<CompilerAnyNode, Wrapper>
  callbackWrappers: Map<string, Wrapper>
}

function callbackArrowParams(expression: CompilerAnyNode | null | undefined): CompilerAnyNode[] {
  if (
    expression !== null &&
    typeof expression !== 'undefined' &&
    expression.params !== null &&
    typeof expression.params !== 'undefined' &&
    Array.isArray(expression.params)
  ) {
    return expression.params
  }

  return []
}

function callbackNodeMayContainReference(value: CompilerAnyNode | CompilerAnyNode[] | null | undefined): boolean {
  if (value === null || typeof value === 'undefined') {
    return false
  }

  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index = index + 1) {
      if (callbackNodeMayContainReference(value[index])) {
        return true
      }
    }

    return false
  }

  return value.type === 'Reference'
}

function registerPlainFunctionValueVariable(statement: CompilerAnyNode, context: CallbackContext): void {
  if (
    statement.init === null ||
    typeof statement.init === 'undefined' ||
    statement.init.type !== 'ArrowFunctionExpression' ||
    callbackNodeMayContainReference(statement.init.body)
  ) {
    return
  }

  for (const _param of callbackArrowParams(statement.init)) {
  }

  const index = context.callbackWrappers.size
  const wrapper: Wrapper = {
    kind: 'plain-arrow',
    name: `inox_callback_arrow_${index}`
  }

  context.callbackWrappers.set(`plain-arrow:${index}`, wrapper)
  context.callbackArrowWrappers.set(statement.init, wrapper)
}

function emitFunctionValueExpression(expression: CompilerAnyNode, context: CallbackContext): string {
  const wrapper = context.callbackArrowWrappers.get(expression)

  if (wrapper !== null && typeof wrapper !== 'undefined' && wrapper.kind === 'plain-arrow') {
    return wrapper.name
  }

  return 'missing'
}

const statement: CompilerAnyNode = {
  type: 'VariableDeclaration',
  name: 'fn',
  valueType: 'function',
  init: {
    type: 'ArrowFunctionExpression',
    expressionBody: true,
    body: {
      type: 'NumberLiteral',
      value: '5',
      valueType: 'number'
    }
  }
}

const context: CallbackContext = {
  callbackArrowWrappers: new Map(),
  callbackWrappers: new Map()
}

registerPlainFunctionValueVariable(statement, context)
console.log(emitFunctionValueExpression(statement.init, context))
