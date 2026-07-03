// @targets cc
// @expect pass
// @stdout 0

const foo = JSON.parse('null')
console.log(Array.isArray(foo))
