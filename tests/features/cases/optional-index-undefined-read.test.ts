// @targets cc
// @expect pass
// @stdout 0

const values: number[] | undefined = undefined

console.log(values?.[0] ?? 0)
