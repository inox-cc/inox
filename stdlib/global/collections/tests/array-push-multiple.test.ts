// @targets cc
// @expect pass
// @stdout 3 1,2,3

const values = [1]

console.log(values.push(2, 3), values.join(','))
