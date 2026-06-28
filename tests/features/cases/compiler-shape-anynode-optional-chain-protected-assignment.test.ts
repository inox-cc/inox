// @targets cc
// @expect pass
// @stdout ok

type AnyNode = { [key: string]: any }

function markOptionalChain(expression: AnyNode): boolean {
  expression.optionalChainProtected = true
  return expression.optionalChainProtected === true
}

const expression: AnyNode = {
  type: 'OptionalMemberExpression',
  property: 'name'
}

if (markOptionalChain(expression)) {
  console.log('ok')
}
