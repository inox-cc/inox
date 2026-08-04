// @targets cc
// @expect pass
// @stdout 4 3 1

const values = [1, 2, 3, 4]
let visited = 0
const value = values.findLast((item, index, array) => {
  visited += 1
  return array === values && index < array.length && item % 2 === 0
})

console.log(value ?? 0, values.findLastIndex((item) => item % 2 === 0), visited)
