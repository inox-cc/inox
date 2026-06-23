// @targets c
// @expect pass
// @stdout (int)2

import type { CompilerAnyNode, CompilerStatementNode } from './modules/compiler-anynode.ts'

type Token = {
  value: string
}

function createNumberLiteral(token: Token): CompilerAnyNode {
  return {
    type: 'NumberLiteral',
    value: token.value
  }
}

function switchCaseLabel(expression: CompilerStatementNode | null | undefined): string {
  if (expression !== null && typeof expression !== 'undefined' && expression.type === 'NumberLiteral') {
    return `(int)${expression.value}`
  }

  return '0'
}

const node = createNumberLiteral({ value: '2' })

console.log(switchCaseLabel(node))
