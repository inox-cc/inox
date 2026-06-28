// @targets cc
// @expect pass
// @stdout arrow

import type { CompilerAnyNode } from './modules/compiler-anynode.ts'

function nodeAt(values: CompilerAnyNode[], index: number): CompilerAnyNode {
  return values[index]
}

function printNodeKind(values: CompilerAnyNode[]): void {
  const node = nodeAt(values, 0)

  if (node.type !== 'ArrowFunctionExpression') {
    console.log('other')
    return
  }

  console.log('arrow')
}

printNodeKind([
  {
    type: 'ArrowFunctionExpression'
  }
])
