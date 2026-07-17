// @targets cc
// @expect pass
// @stdout 2,3 3

const values = [1, 2, 3]

console.log(values.slice(1).join(','), values.slice().length)
