// @targets cc
// @expect pass
// @stdout 2

type AnyNode = { [key: string]: any }

function nodeArray(value: unknown): AnyNode[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value
}

function constructorPlan(constructorMethod: AnyNode): number {
  const body: AnyNode[] = []
  let canMoveInitializer = true

  for (const statement of nodeArray(constructorMethod.body)) {
    if (canMoveInitializer && statement.initializer === true) {
      continue
    }

    canMoveInitializer = false
    body.push(statement)
  }

  return body.length
}

const planned = constructorPlan({
  body: [
    { initializer: true, name: 'moved-first' },
    { initializer: true, name: 'moved-second' },
    { initializer: false, name: 'first' },
    { initializer: true, name: 'rest' }
  ]
})

console.log(planned)
