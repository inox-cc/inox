// @targets cc
// @expect pass
// @stdout 1
// @stdout 1

const text = 'inox compiler'

console.log(text.startsWith('compiler', 5))
console.log(text.endsWith('inox', 4))
