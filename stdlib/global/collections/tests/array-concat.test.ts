// @targets cc
// @expect pass
// @stdout 1 2 3 4 5 6 1 2 2 6

const values = [1, 2]
const combined = values.concat(3, [4, 5], 6)

console.log(combined.join(' '), values.join(' '), values.length, combined.length)
