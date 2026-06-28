// @targets cc
// @expect pass
// @stdout 2

type Scores = number[]

const values: Scores = [1, 2]
console.log(values.length)
