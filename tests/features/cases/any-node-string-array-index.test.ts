// @targets cc
// @expect pass
// @stdout root

type CompilerNode = {
  [key: string]: any
}

function firstPathPart(node: CompilerNode): string | null {
  if (!Array.isArray(node.path) || node.path.length === 0) {
    return null
  }

  return node.path[0]
}

console.log(firstPathPart({ path: ['root'] }))
