// @targets c
// @expect pass
// @stdout timer

import type { CompilerAnyNode } from './modules/compiler-anynode.ts'

type Wrapper = {
  name: string
}

function nodeAt(values: CompilerAnyNode[], index: number): CompilerAnyNode {
  return values[index]
}

function referenceName(expression: CompilerAnyNode | null | undefined): string {
  if (
    expression === null ||
    typeof expression === 'undefined' ||
    expression.type !== 'Reference' ||
    expression.path.length !== 1
  ) {
    return ''
  }

  return expression.path[0]
}

function isTimerStartCallExpression(expression: CompilerAnyNode | null | undefined): boolean {
  if (expression === null || typeof expression === 'undefined' || expression.type !== 'CallExpression') {
    return false
  }

  return referenceName(expression.callee) === 'setTimeout'
}

function printCallbackWrapper(callback: CompilerAnyNode, wrappers: Map<CompilerAnyNode, Wrapper>): void {
  wrappers.set(callback, { name: 'timer' })

  const wrapper = wrappers.get(callback)

  if (wrapper === null || typeof wrapper === 'undefined') {
    console.log('missing')
  } else {
    console.log(wrapper.name)
  }
}

function visitTimerCallExpression(expression: CompilerAnyNode, wrappers: Map<CompilerAnyNode, Wrapper>): void {
  if (!isTimerStartCallExpression(expression)) {
    return
  }

  printCallbackWrapper(nodeAt(expression.args, 0), wrappers)
}

const timerCall: CompilerAnyNode = {
  type: 'CallExpression',
  valueType: 'timer',
  callee: {
    type: 'Reference',
    path: ['setTimeout']
  },
  args: [
    {
      type: 'ArrowFunctionExpression',
      expressionBody: false,
      params: [],
      body: []
    },
    {
      type: 'NumberLiteral',
      value: '0'
    }
  ]
}

const wrappers: Map<CompilerAnyNode, Wrapper> = new Map()

visitTimerCallExpression(timerCall, wrappers)
