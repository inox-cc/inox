// @targets cc
// @expect pass
// @stdout ArrowFunctionExpression

type Body = { type: string; valueType?: string | null }
type Arrow = { type: string; body?: Body | null }

const node: Arrow = { type: 'ArrowFunctionExpression' }

console.log(node.type)
