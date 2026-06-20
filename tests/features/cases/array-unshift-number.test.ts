// @targets c
// @expect pass
// @stdout [1, 2]

const values = [2]
values.unshift(1)
console.log(values)
