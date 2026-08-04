// @targets cc
// @expect pass
// @stdout inox
// @stdout inox compiler

const text = 'inox'

console.log(text.concat())
console.log(text.concat(' ', 'compiler'))
