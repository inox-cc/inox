// @targets cc
// @expect pass
// @stdout 1
// @stdout 0

const pattern = /Hopper/
console.log(pattern.test('Grace Hopper'))
console.log(pattern.test('Ada Lovelace'))
