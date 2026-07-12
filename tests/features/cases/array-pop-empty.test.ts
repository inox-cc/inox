// @targets cc
// @expect pass
// @stdout none

const values: number[] = []
const value = values.pop()
console.log(value ?? 'none')
