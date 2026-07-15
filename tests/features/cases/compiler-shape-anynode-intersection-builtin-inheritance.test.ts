// @targets cc
// @expect pass
// @stdout array

type ChildNode = AnyNode & {
  valueType?: string | null
}

type ParentNode = AnyNode & {
  callee?: ChildNode | null
}

function nestedObjectValueType(expression: ParentNode): string {
  const callee = expression.callee

  if (callee === null || typeof callee === 'undefined') {
    return 'missing'
  }

  const object = callee.object

  if (object === null || typeof object === 'undefined' || typeof object.valueType !== 'string') {
    return 'missing'
  }

  return object.valueType
}

console.log(nestedObjectValueType({ callee: { object: { valueType: 'array' } } }))
