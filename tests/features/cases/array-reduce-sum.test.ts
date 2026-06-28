// @targets cc
// @expect pass
// @stdout 6

const values = [1, 2, 3]
const sum = values.reduce((total, value) => total + value, 0)
console.log(sum)
