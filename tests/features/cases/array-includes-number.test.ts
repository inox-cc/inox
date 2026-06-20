// @targets c
// @expect pass
// @stdout 1
// @stdout 0

const values = [1, 2]
console.log(values.includes(2))
console.log(values.includes(3))
