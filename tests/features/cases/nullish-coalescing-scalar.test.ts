// @targets c
// @expect pass
// @stdout 7

const value: number | null = null
console.log(value ?? 7)
