// @targets cc
// @expect pass
// @stdout first 1

import type { AnyNode, ArrayBindingElement } from '../../../compiler/types.ts'

function firstBindingName(node: AnyNode): string {
  const bindingElements = node.bindingElements ?? null

  if (bindingElements === null) {
    return 'missing'
  }

  for (const binding of bindingElements) {
    return `${binding.name} ${binding.loc.line}`
  }

  return 'missing'
}

const binding: ArrayBindingElement = {
  name: 'first',
  index: 0,
  loc: { line: 1, column: 1 }
}

console.log(firstBindingName({ bindingElements: [binding] }))
