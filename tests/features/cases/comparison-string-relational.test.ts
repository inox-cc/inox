// @targets cc
// @expect pass
// @stdout 1
// @stdout 1
// @stdout 1
// @stdout 1
// @stdout 1

console.log('Ada' < 'Grace')
console.log('Ada' <= 'Ada')
console.log('Grace' > 'Ada')
console.log('Grace' >= 'Grace')
console.log('😀' < '')
