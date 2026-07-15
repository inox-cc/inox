// @targets cc
// @expect pass
// @stdout missing

function describe(expression: AnyNode): string {
  const argumentKinds = expression.libraryCArgumentKinds

  if (argumentKinds !== null && typeof argumentKinds !== 'undefined' && argumentKinds.length > 0) {
    return argumentKinds[0]
  }

  return 'missing'
}

console.log(describe({ type: 'NumberLiteral', value: '1' }))
