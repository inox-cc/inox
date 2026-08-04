// @targets cc
// @expect pass
// @stdout 6

const values = [1, 2, 3]
const total = values.reduce((result, value, _index, array) => {
  return array === values ? result + value : result
}, 0)

console.log(total)
