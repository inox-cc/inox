// @targets cc
// @expect pass
// @stdout 2 0

const values = ['a', 'b', 'a']
console.log(values.lastIndexOf('a'), values.lastIndexOf('a', -2))
