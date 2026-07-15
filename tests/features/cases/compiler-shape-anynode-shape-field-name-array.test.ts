// @targets cc
// @expect pass
// @stdout base

function shapeFieldNames(expression: AnyNode): string[] {
  const fields = expression.shape?.fields ?? []
  const names: string[] = []

  for (let index = 0; index < fields.length; index = index + 1) {
    names.push(fields[index].name)
  }

  return names
}

console.log(shapeFieldNames({ shape: { fields: [{ name: 'base' }] } })[0])
