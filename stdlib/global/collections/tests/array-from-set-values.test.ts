// @targets js cc
// @expect pass
// @stdout 2 3

const values = new Set<number>([2, 3])
console.log(Array.from(values.values()).join(' '))
