// @targets cc
// @expect pass
// @stdout 3 1 2 3

const values = await Promise.all([Promise.resolve(1), 2, Promise.resolve(3)])

console.log(values.length, values[0], values[1], values[2])
