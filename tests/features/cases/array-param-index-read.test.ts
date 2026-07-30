// @targets cc
// @expect pass
// @stdout 2

function second(values: number[]): number {
  if (values.length > 1) {
    return values[1]
  }

  return 0
}

console.log(second([1, 2]))
