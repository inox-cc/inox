// @targets c
// @expect pass
// @stdout 7

const value = await Promise.resolve(7)
console.log(value)
