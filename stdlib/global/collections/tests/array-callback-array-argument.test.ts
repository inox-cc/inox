// @targets cc
// @expect pass
// @stdout 2,4

const values = [1, 2]
const doubled = values.map((value, _index, array) => (array === values ? value * 2 : 0))

console.log(doubled.join(','))
