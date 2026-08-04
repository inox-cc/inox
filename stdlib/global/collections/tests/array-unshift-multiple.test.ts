// @targets cc
// @expect pass
// @stdout 4
// @stdout 1,2,3,4

const values = [3, 4]
const length = values.unshift(1, 2)

console.log(length)
console.log(values.join(','))
