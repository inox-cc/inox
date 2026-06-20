// @targets c
// @expect pass
// @stdout 2

const values = [1, 2, 3]
const filtered = values.filter((value) => value > 1)
console.log(filtered.length)
