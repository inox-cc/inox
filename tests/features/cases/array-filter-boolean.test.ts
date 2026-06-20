// @targets c
// @expect pass
// @stdout 2

const values = [0, 2, 3]
const filtered = values.filter(Boolean)
console.log(filtered.length)
