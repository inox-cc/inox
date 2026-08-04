// @targets cc
// @expect pass
// @stdout ababab|

console.log('ab'.repeat(3) + '|' + 'x'.repeat(0))
