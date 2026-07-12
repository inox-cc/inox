// @targets cc
// @expect pass
// @stdout 1,2,3,4

const middle = [2, 3]
const values = [1, ...middle, 4]
console.log(values.join(','))
