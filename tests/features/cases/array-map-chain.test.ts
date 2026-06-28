// @targets cc
// @expect pass
// @stdout [4, 6]

const values = [1, 2, 3]
const mapped = values.filter((value) => value > 1).map((value) => value * 2)
console.log(mapped)
