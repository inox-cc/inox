// @targets cc
// @expect pass
// @stdout 3 0

const values = [1, 2, 3]
console.log(values.at(-1) ?? 0, values.at(9) ?? 0)
