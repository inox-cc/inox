// @targets cc
// @expect pass
// @stdout 1

type Narrowing = {
  trueValueType?: string | null
}

type DynamicNode = {
  [key: string]: any
}

function matches(expression: DynamicNode, valueType: string): boolean {
  const narrowing: Narrowing = expression.libraryArgumentNarrowing

  if (narrowing === null || typeof narrowing !== 'object') {
    return false
  }

  return narrowing.trueValueType === valueType
}

console.log(matches({ libraryArgumentNarrowing: { trueValueType: 'array' } }, 'array'))
