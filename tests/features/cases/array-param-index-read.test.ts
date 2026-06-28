// @targets cc
// @expect pass
// @stdout 2

function second(values: number[]): number {
  return values[1]
}

console.log(second([1, 2]))
