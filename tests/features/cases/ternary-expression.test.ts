// @targets cc
// @expect pass
// @stdout 3

const value: number = true ? 3 : 4
console.log(value)
