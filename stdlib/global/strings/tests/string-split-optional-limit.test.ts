// @targets cc
// @expect pass
// @stdout 1
// @stdout a

console.log('a,b'.split().length)
console.log('a,b,c'.split(',', 1).join('|'))
