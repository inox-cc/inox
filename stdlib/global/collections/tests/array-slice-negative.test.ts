// @targets cc
// @expect pass
// @stdout 3,4
// @stdout 2,3

const values = [1, 2, 3, 4]

console.log(values.slice(-2).join(','))
console.log(values.slice(-3, -1).join(','))
