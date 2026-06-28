// @targets cc
// @expect pass
// @stdout 1

const names = new Set(['Ada'])
console.log(names.has('Ada'))
