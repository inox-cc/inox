// @targets cc
// @expect pass
// @stdout a b 1

const values = ['a', 'b']
console.log(values.shift(), values[0], values.length)
