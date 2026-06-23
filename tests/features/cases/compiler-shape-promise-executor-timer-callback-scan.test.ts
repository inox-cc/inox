// @targets c
// @expect pass
// @stdout setTimeout

import type { CompilerAnyNode } from './modules/compiler-anynode.ts'

function stringAt(values: string[], index: number): string {
  return values[index]
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

  return stringAt(expression.path, 0)
}

function isPromiseConstructorExpression(expression: CompilerAnyNode | null | undefined): boolean {
  if (expression === null || typeof expression === 'undefined' || expression.type !== 'NewExpression') {
    return false
  }

  return referenceName(expression.callee) === 'Promise'
}

function isTimerStartCallExpression(expression: CompilerAnyNode | null | undefined): boolean {
  if (expression === null || typeof expression === 'undefined' || expression.type !== 'CallExpression') {
    return false
  }

  return referenceName(expression.callee) === 'setTimeout' || expression.timerRuntimeMethod === 'setTimeout'
}

function promiseExecutorTimerMethod(expression: CompilerAnyNode): string {
  if (!isPromiseConstructorExpression(expression)) {
    return 'missing'
  }

  if (nodeAt(expression.args, 0).type !== 'ArrowFunctionExpression') {
    return 'missing'
  }

  if (
    nodeAt(nodeAt(expression.args, 0).body, 0).type === 'ExpressionStatement' &&
    isTimerStartCallExpression(nodeAt(nodeAt(expression.args, 0).body, 0).expression)
  ) {
    return nodeAt(nodeAt(expression.args, 0).body, 0).expression.timerRuntimeMethod
  }

  return 'missing'
}

const expression: CompilerAnyNode = {
  type: 'NewExpression',
  valueType: 'promise',
  promiseValueType: 'string',
  callee: {
    type: 'Reference',
    path: ['Promise']
  },
  args: [
    {
      type: 'ArrowFunctionExpression',
      params: [
        {
          type: 'Parameter',
          name: 'resolve',
          valueType: 'function'
        }
      ],
      expressionBody: false,
      body: [
        {
          type: 'ExpressionStatement',
          expression: {
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
                body: [
                  {
                    type: 'ExpressionStatement',
                    expression: {
                      type: 'CallExpression',
                      callee: {
                        type: 'Reference',
                        path: ['resolve']
                      },
                      args: [
                        {
                          type: 'StringLiteral',
                          value: 'delayed'
                        }
                      ]
                    }
                  }
                ]
              },
              {
                type: 'NumberLiteral',
                value: '0'
              }
            ]
          }
        }
      ]
    }
  ]
}

console.log(promiseExecutorTimerMethod(expression))
