// @targets cc
// @expect pass
// @stdout 2

const values = [1, 2, 3]
const found = values.find((value) => value > 1)
console.log(found ?? 0)
