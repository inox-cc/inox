// @targets cc
// @expect pass
// @stdout 0

const values = await Promise.all<number>([])

console.log(values.length)
