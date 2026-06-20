// @targets c
// @expect pass
// @stdout 4
// @stdout 0

const values: number[] = [4]
console.log(values.pop() ?? 0)
console.log(values.length)
