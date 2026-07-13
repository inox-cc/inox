// @targets cc
// @expect pass
// @stdout Payload

type AnyNode = { [key: string]: any }

function constraintName(node: AnyNode): string {
  if (typeof node.constraint === 'string' && node.constraint.length > 0) {
    return node.constraint
  }

  return 'unknown'
}

console.log(constraintName({ constraint: 'Payload' }))
