// @targets cc
// @expect pass
// @stdout 1
// @stdout 1
// @stdout 1

const value = 'Ada'
console.log(value.includes('d'))
console.log(value.startsWith('A'))
console.log(value.endsWith('a'))
