// @targets cc
// @expect pass
// @stdout Item

type AnyNode = { [key: string]: any }

function firstTypeArgument(expression: AnyNode): string {
  const typeArguments: string[] = expression.typeArguments ?? []

  if (typeArguments.length > 0) {
    return typeArguments[0]
  }

  return ''
}

console.log(firstTypeArgument({ typeArguments: ['Item'] }))
