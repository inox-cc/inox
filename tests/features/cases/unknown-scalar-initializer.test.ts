// @targets cc
// @expect pass
// @stdout 7

const value: unknown = JSON.parse('7')

console.log(JSON.stringify(value))
