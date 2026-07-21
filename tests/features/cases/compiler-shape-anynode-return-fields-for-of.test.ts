// @targets cc
// @expect pass
// @stdout value

import type { AnyNode } from '../../../compiler/types.ts'

type LowerTypeNode = AnyNode

function firstNode(): LowerTypeNode | null {
  return {
    fields: [{ name: 'value' }]
  }
}

function firstFieldName(): string {
  const node = firstNode()

  if (node === null) {
    return 'missing'
  }

  for (const field of node.fields) {
    return field.name
  }

  return 'missing'
}

console.log(firstFieldName())
