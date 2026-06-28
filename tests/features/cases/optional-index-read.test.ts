// @targets cc
// @expect pass
// @stdout 7

const values: number[] | null = [7]
console.log(values?.[0] ?? 0)
