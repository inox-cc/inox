// @targets cc
// @expect pass
// @stdout exception-value

type IntrinsicRole = 'array-literal' | 'exception-value'

function rejectionRole(expression: AnyNode): IntrinsicRole | null {
  const role = expression.promiseRejectionIntrinsicRole

  if (role !== null && typeof role !== 'undefined') {
    return role
  }

  return null
}

console.log(rejectionRole({ promiseRejectionIntrinsicRole: 'exception-value' }))
