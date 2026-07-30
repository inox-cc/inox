// @targets cc
// @expect pass
// @stdout string

type Param = {
  valueType?: string
}

type Node = {
  params: Param[]
}

function describe(node: Node): string {
  if (node.params.length === 0) {
    return 'unknown'
  }

  if (node.params[0].valueType === null || typeof node.params[0].valueType === 'undefined') {
    return 'unknown'
  }

  return node.params[0].valueType
}

console.log(describe({ params: [{ valueType: 'string' }] }))
