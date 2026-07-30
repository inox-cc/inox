// @targets cc
// @expect pass
// @stdout 1:string

type Param = {
  valueType?: string
}

type Node = {
  params?: Param[]
}

function refinedParams(node: Node): Param[] {
  if (typeof node.params?.[0]?.valueType !== 'string') {
    return []
  }

  return node.params
}

const params = refinedParams({ params: [{ valueType: 'string' }] })
console.log(`${params.length}:${params[0].valueType ?? 'unknown'}`)
