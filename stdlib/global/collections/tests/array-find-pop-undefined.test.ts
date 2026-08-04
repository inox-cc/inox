// @targets cc
// @expect pass
// @stdout 1
// @stdout 1

const values: number[] = []

console.log(values.pop() === undefined)
console.log(values.find((value) => value > 0) === undefined)
