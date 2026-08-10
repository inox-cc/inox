// @targets cc
// @expect pass
// @stdout B

const prefix = 'B'
const values = false ? ['A'] : [''].map((value) => `${prefix}${value}`)

console.log(values[0])
