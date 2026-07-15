// @targets cc
// @expect pass
// @stdout field 7

type AnyNode = {
  [key: string]: any
  type?: string
}

type NodeList = {
  nodes: AnyNode[]
}

const list: NodeList = { nodes: [{ field: 7 }] }

for (const node of list.nodes) {
  console.log(`field ${node.field}`)
}
