// @targets cc
// @expect pass
// @stdout 1

type AnyNode = { [key: string]: any }

function nodeOrNull(node: AnyNode | null | undefined): AnyNode | null {
  if (node === null || typeof node === 'undefined') {
    return null
  }

  return node
}

function blockStatements(block: AnyNode | null | undefined): AnyNode[] {
  if (block === null || typeof block === 'undefined' || block.body === null || typeof block.body === 'undefined') {
    return []
  }

  return block.body
}

function hasTryWork(statement: AnyNode): boolean {
  const handler = nodeOrNull(statement.handler)
  const finalizer = nodeOrNull(statement.finalizer)

  if (handler === null && finalizer === null) {
    return false
  }

  return blockStatements(finalizer).length > 0
}

console.log(hasTryWork({ finalizer: { body: [{}] } }))
