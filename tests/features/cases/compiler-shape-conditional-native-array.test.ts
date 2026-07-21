// @targets cc
// @expect pass
// @stdout alpha

const values = true ? ['alpha'] : ['beta']

console.log(values[0])
