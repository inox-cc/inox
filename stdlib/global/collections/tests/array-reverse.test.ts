// @targets cc
// @expect pass
// @stdout c,b,a 1

const values = ['a', 'b', 'c']
const reversed = values.reverse()
console.log(reversed.join(','), reversed === values)
