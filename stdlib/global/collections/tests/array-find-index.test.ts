// @targets cc
// @expect pass
// @stdout 1 -1

const values = ['a', 'bb', 'ccc']
console.log(values.findIndex((value) => value.length === 2), values.findIndex((value) => value.length === 4))
