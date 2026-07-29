// @targets cc
// @expect pass
// @stdout 7

const values: number[] = [true ? 7 : 9]

console.log(values[0])
