// @targets c
// @expect pass
// @stdout 7

const value = Number(' 7 ')
console.log(value ?? 0)
