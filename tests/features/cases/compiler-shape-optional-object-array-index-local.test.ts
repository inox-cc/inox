// @targets cc
// @expect pass
// @stdout checked

function optionalSecondArgument(expression: AnyNode): object | null {
  const options = expression.args[1]
  console.log('checked')

  if (options === null || typeof options === 'undefined') {
    return null
  }

  return options
}

optionalSecondArgument({ args: [{ type: 'first' }] })
