// @targets cc
// @expect pass
// @stdout 7
// @stdout empty

type Expression = {
  type: string
  args: Argument[]
}

type Argument = {
  value: number
}

function argumentAt(argumentsList: Argument[], index: number): Argument | null {
  return argumentsList[index]
}

function maybeArgumentAt(argumentsList: Argument[], index: number): Argument | null {
  if (index >= argumentsList.length) {
    return null
  }

  return argumentAt(argumentsList, index)
}

function firstArgumentOrNull(expression: Expression): Argument | null {
  return maybeArgumentAt(expression.args, 0)
}

function fulfilledArgumentOrNull(expression: Expression): Argument | null {
  if (expression.type !== 'fulfill') {
    return null
  }

  const argument = firstArgumentOrNull(expression)

  if (argument === null) {
    return null
  }

  return argument
}

const argument = fulfilledArgumentOrNull({
  type: 'fulfill',
  args: [{ value: 7 }]
})

if (argument !== null) {
  console.log(argument.value)
}

const missing = fulfilledArgumentOrNull({ type: 'fulfill', args: [] })
console.log(missing === null ? 'empty' : 'present')
