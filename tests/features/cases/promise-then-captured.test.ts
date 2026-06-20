// @targets c
// @expect pass
// @stdout 8

const add = 3
const value = await Promise.resolve(5).then((item) => item + add)
console.log(value)
