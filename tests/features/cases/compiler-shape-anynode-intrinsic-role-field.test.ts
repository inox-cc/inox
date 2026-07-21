// @targets cc
// @expect pass
// @stdout exception-value

type IntrinsicRole = 'array-literal' | 'exception-value'

function rejectionRole(expression: AnyNode): IntrinsicRole | null {
  const role = expression.asyncResultRejectionIntrinsicRole

  if (role !== null && typeof role !== 'undefined') {
    return role
  }

  return null
}

console.log(rejectionRole({ asyncResultRejectionIntrinsicRole: 'exception-value' }))
