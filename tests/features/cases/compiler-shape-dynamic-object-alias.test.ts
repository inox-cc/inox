// @targets cc
// @expect pass
// @stdout node:check

type NodeLike = {
  kind: string
  value: string
}

function identity(node: NodeLike): NodeLike {
  return node
}

function createNode(kind: string): NodeLike {
  return {
    kind,
    value: 'check'
  }
}

const nodes: NodeLike[] = [identity(createNode('node'))]
const selected = nodes[0]
console.log(`${selected.kind}:${selected.value}`)
