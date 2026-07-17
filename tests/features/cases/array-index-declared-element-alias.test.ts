// @targets cc
// @expect pass
// @stdout 1

type CompilerNode = {
  [key: string]: any
}

type ExpressionNode = CompilerNode

function propertyCount(expressions: ExpressionNode[]): number {
  const expression = expressions[0]
  const properties: ExpressionNode[] = expression.properties

  return properties.length
}

console.log(propertyCount([{ properties: [{}] }]))
