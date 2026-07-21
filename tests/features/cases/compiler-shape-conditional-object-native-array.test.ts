// @targets cc
// @expect pass
// @stdout 1

const value = true ? { label: 'object' } : ['array']

console.log(typeof value === 'object')
