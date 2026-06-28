// @targets cc
// @expect pass
// @stdout 2

function count(values: number[]): number {
  return values.length
}

console.log(count([1, 2]))
