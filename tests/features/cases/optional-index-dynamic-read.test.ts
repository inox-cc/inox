// @targets cc
// @expect pass
// @stdout 7

const values: number[] | null = [7]
const index = 0
console.log(values?.[index] ?? 0)
