// @targets cc
// @expect diagnostics INOX_TYPE_MISMATCH

let value: number = 1
value = 'two'
console.log(value)
