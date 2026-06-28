// @targets cc
// @expect pass
// @stdout 2

const min = 1
const values = [1, 2, 3]
const filtered = values.filter((value) => value > min)
console.log(filtered.length)
