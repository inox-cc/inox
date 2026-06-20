// @targets c
// @expect pass
// @stdout 3

const values = [1, 3, 2]
values.sort((a, b) => b - a)
console.log(values[0])
