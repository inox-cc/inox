// @targets c
// @expect pass
// @stdout 8

const value = await Promise.resolve(7).then((item) => item + 1)
console.log(value)
