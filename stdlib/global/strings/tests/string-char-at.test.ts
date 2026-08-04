// @targets cc
// @expect pass
// @stdout a||

console.log('abc'.charAt(0) + '|' + 'abc'.charAt(-1) + '|' + 'abc'.charAt(3))
