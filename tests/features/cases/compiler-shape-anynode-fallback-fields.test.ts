// @targets cc
// @expect pass
// @stdout Identifier:fallback:1

type NodeLike = {
  type: string
  value?: string
  children: string[]
}

function createNode(): NodeLike {
  return {
    type: 'Identifier',
    children: ['name']
  }
}

const node = createNode()
console.log(`${node.type}:${node.value ?? 'fallback'}:${node.children.length}`)
