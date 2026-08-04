// @targets cc
// @expect pass
// @stdout 700|😀a

console.log('7'.padEnd(3, '0') + '|' + '😀'.padEnd(3, 'ab'))
