// @targets cc
// @expect pass
// @stdout 1

const value = Math.random()
console.log(value >= 0 && value < 1)
