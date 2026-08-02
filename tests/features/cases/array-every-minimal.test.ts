// @targets cc
// @expect pass
// @stdout true:false

const values = [2, 4, 6]
const allEven = values.every((value) => value % 2 === 0)
const allSmall = values.every((value) => value < 6)

console.log(`${allEven}:${allSmall}`)
