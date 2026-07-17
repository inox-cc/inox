// @targets cc
// @expect pass
// @stdout value:1:1

import { checkerNodeAt } from './modules/compiler-anynode-helper.ts'

const node = checkerNodeAt(
  [
    {
      type: 'VariableDeclaration',
      name: 'value',
      params: [{}],
      loc: { line: 1, column: 1 }
    }
  ],
  0
)

node.shape = null
node.typeRef = null
console.log(`${node.name}:${node.params.length}:${node.loc.line}`)
