// @targets cc
// @expect pass
// @stdout Item

type AnyNode = { [key: string]: any }

function firstTypeArgument(expression: AnyNode): string {
  const typeArguments: string[] = expression.typeArguments ?? []
  return typeArguments[0]
}

console.log(firstTypeArgument({ typeArguments: ['Item'] }))
