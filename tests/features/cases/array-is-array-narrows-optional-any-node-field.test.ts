// @targets cc
// @expect pass
// @stdout yes

function hasRuntimeValue(expression: AnyNode): boolean {
  const kinds = expression.libraryCArgumentKinds

  if (!Array.isArray(kinds)) {
    return false
  }

  return kinds.includes('runtime-value')
}

console.log(hasRuntimeValue({
  type: 'CallExpression',
  libraryCArgumentKinds: ['runtime-value']
}) ? 'yes' : 'no')
