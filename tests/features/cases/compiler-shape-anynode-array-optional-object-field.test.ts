// @targets cc
// @expect pass
// @stdout ready

function callbackType(expression: AnyNode): object | null {
  const callback = expression.args[0]
  const functionType = callback?.functionType

  if (functionType !== null && typeof functionType !== 'undefined') {
    return functionType
  }

  return null
}

const value = callbackType({
  args: [
    {
      functionType: { kind: 'function' }
    }
  ]
})

if (value !== null) {
  console.log('ready')
}
