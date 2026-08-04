// @targets cc
// @expect pass
// @stdout 9

let total = 0
const values = [2, 3, 4]

values.forEach((value) => {
  total += value
})

console.log(total)
