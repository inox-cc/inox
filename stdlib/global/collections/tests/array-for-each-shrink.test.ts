// @targets cc
// @expect pass
// @stdout 2 2

const values = [1, 2, 3]
let visited = 0

values.forEach((_value, index) => {
  visited += 1

  if (index === 0) {
    values.pop()
  }
})

console.log(visited, values.length)
