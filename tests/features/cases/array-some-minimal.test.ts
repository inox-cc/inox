// @targets cc
// @expect pass
// @stdout true:false

const values = [1, 2, 3]
const hasLarge = values.length !== 3 || values.some((value) => value > 2)
const hasMissing = values.length !== 3 || values.some((value) => value > 3)
console.log(`${hasLarge}:${hasMissing}`)
