// @targets cc
// @expect pass
// @stdout 1

type AnyNode = { [key: string]: any }

function isArrayFrom(callee: AnyNode): boolean {
  return (
    callee.type === 'MemberExpression' &&
    callee.property === 'from' &&
    callee.object.type === 'Reference' &&
    callee.object.path.length === 1 &&
    callee.object.path[0] === 'Array'
  )
}

console.log(
  isArrayFrom({
    type: 'MemberExpression',
    property: 'from',
    object: {
      type: 'Reference',
      path: ['Array']
    }
  })
)
