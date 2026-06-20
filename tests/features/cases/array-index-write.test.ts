// @targets c
// @expect pass
// @stdout 9

const values: number[] = [1]
values[0] = 9
console.log(values[0])
