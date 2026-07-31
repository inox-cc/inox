// @targets cc
// @expect pass
// @stdout 1

function containsFirst(values: string[]): boolean {
  const first = values[0]
  return values.find((value) => value === first) !== undefined
}

console.log(containsFirst(['inox']))
