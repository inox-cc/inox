// @targets cc
// @expect pass
// @stdout present

type AnyNode = {
  [key: string]: any
}

function stringForObject(context: AnyNode, name: string): string | null {
  const value = context[name]

  if (typeof value === 'string') {
    return value
  }

  return null
}

function isExpectedName(context: AnyNode, name: string, value: string): boolean {
  return typeof context[name] === 'string' && name.length > 0 && value.length > 0
}

function resolveName(expression: AnyNode, context: AnyNode): string {
  if (expression.path.length === 0) {
    return 'missing'
  }

  const name = expression.path[0]
  let value = ''
  const objectValue = stringForObject(context, name)

  if (objectValue !== null && typeof objectValue !== 'undefined' && isExpectedName(context, name, objectValue)) {
    value = objectValue
  } else {
    const expressionValue = expression.value

    if (
      expressionValue !== null &&
      typeof expressionValue !== 'undefined' &&
      isExpectedName(context, name, expressionValue)
    ) {
      value = expressionValue
    }
  }

  if (value !== '') {
    return value
  }

  return 'missing'
}

console.log(resolveName({ path: ['entry'], value: 'present' }, { entry: 'present' }))
