// @targets cc
// @expect pass
// @stdout 2 -1

const values = ['a', 'b', 'a']
console.log(values.indexOf('a', 1), values.indexOf('a', 9))
