// @targets cc
// @expect pass
// @stdout 2
// @stdout 😀|a

const values = Array.from('😀a')

console.log(values.length)
console.log(values.join('|'))
