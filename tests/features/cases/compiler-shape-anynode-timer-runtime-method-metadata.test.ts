// @targets c
// @expect pass
// @stdout setTimeout

import type { CompilerAnyNode } from './modules/compiler-anynode.ts'

function attachTimerMetadata(expression: CompilerAnyNode): void {
  expression.timerRuntimeMethod = 'setTimeout'
  expression.valueType = 'timer'
}

function isTimerStartCallExpression(expression: CompilerAnyNode | null | undefined): boolean {
  if (expression === null || typeof expression === 'undefined') {
    return false
  }

  if (expression.timerRuntimeMethod === null || typeof expression.timerRuntimeMethod === 'undefined') {
    return false
  }

  return expression.timerRuntimeMethod.startsWith('set')
}

const call: CompilerAnyNode = {
  type: 'CallExpression',
  callee: {
    type: 'Reference',
    path: ['setTimeout']
  },
  args: [
    {
      type: 'ArrowFunctionExpression',
      params: [],
      body: [],
      expressionBody: false
    },
    {
      type: 'NumberLiteral',
      value: '0'
    }
  ]
}

attachTimerMetadata(call)

if (isTimerStartCallExpression(call)) {
  console.log(call.timerRuntimeMethod)
}
