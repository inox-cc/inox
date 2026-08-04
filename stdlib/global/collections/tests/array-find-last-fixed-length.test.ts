// @targets cc
// @expect pass
// @stdout 2 4

const values = [1, 2]
let visited = 0

values.findLastIndex(() => {
  visited += 1
  values.push(3)
  return false
})

console.log(visited, values.length)
