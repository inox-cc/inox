// @targets cc
// @expect diagnostics INOX_C_NUMBER_EXPR

const values: number[] = []
const value = values.pop()
console.log(value ?? 'none')
