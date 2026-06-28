// @targets cc
// @expect pass
// @stdout setTimeout
// @stdout setTimeout

import type { CompilerAnyNode } from './modules/compiler-anynode.ts'

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

function timerStartCallName(callee: CompilerAnyNode | null | undefined): string | null {
  if (referenceName(callee) === 'setImmediate') {
    return 'setImmediate'
  }

  if (referenceName(callee) === 'setInterval') {
    return 'setInterval'
  }

  if (referenceName(callee) === 'setTimeout') {
    return 'setTimeout'
  }

  return null
}

function timerRuntimeMethodForExpression(expression: CompilerAnyNode | null | undefined): string | null {
  if (expression === null || typeof expression === 'undefined') {
    return null
  }

  if (expression.timerRuntimeMethod !== null && typeof expression.timerRuntimeMethod !== 'undefined') {
    return expression.timerRuntimeMethod
  }

  return timerStartCallName(expression.callee)
}

function copyRuntimeMetadata(target: CompilerAnyNode, source: CompilerAnyNode): CompilerAnyNode {
  if (source.timerRuntimeMethod !== null && typeof source.timerRuntimeMethod !== 'undefined') {
    target.timerRuntimeMethod = source.timerRuntimeMethod
  }

  return target
}

function lowerTimerCallExpression(expression: CompilerAnyNode): CompilerAnyNode {
  return copyRuntimeMetadata(
    {
      type: 'CallExpression',
      callee: {
        type: 'Reference',
        path: expression.callee.path
      },
      args: expression.args,
      valueType: expression.valueType
    },
    expression
  )
}

function clearTimerRuntimeMethod(expression: CompilerAnyNode): CompilerAnyNode {
  expression.timerRuntimeMethod = null
  return expression
}

const timerCall: CompilerAnyNode = {
  type: 'CallExpression',
  timerRuntimeMethod: 'setTimeout',
  valueType: 'timer',
  callee: {
    type: 'Reference',
    path: ['setTimeout']
  },
  args: [
    {
      type: 'ArrowFunctionExpression',
      params: [],
      expressionBody: false,
      body: []
    },
    {
      type: 'NumberLiteral',
      value: '0'
    }
  ]
}

console.log(timerRuntimeMethodForExpression(lowerTimerCallExpression(timerCall)))
console.log(timerRuntimeMethodForExpression(clearTimerRuntimeMethod(lowerTimerCallExpression(timerCall))))
