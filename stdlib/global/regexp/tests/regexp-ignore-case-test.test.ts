// @targets cc
// @expect pass
// @stdout 1
// @stdout 0

console.log(/ada/i.test('Ada Lovelace'))
console.log(/ada/i.test('Grace Hopper'))
