// @targets c
// @expect pass
// @stdout arrow

import type { CompilerAnyNode } from './modules/compiler-anynode.ts'

type Wrapper = {
  name: string
}

function nodeAt(values: CompilerAnyNode[], index: number): CompilerAnyNode {
  return values[index]
}

function printNodeKind(values: CompilerAnyNode[], wrappers: Map<CompilerAnyNode, Wrapper>): void {
  const node = nodeAt(values, 0)

  if (node.type !== 'ArrowFunctionExpression') {
    console.log('other')
    return
  }

  wrappers.set(node, { name: 'arrow' })
  const wrapper = wrappers.get(node)

  if (wrapper === null || typeof wrapper === 'undefined') {
    console.log('missing')
    return
  }

  console.log(wrapper.name)
}

const wrappers: Map<CompilerAnyNode, Wrapper> = new Map()

printNodeKind(
  [
    {
      type: 'ArrowFunctionExpression'
    }
  ],
  wrappers
)
