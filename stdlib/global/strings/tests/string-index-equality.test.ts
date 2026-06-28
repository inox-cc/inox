// @targets cc
// @expect pass
// @stdout 1
// @stdout 1
// @stdout 1

const value = 'A_B'

console.log(value[1] === '_')
console.log(value[0] !== '_')
console.log(value[2] === 'B')
