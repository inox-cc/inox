// @targets cc
// @expect pass
// @stdout count 0

const count: number | null = null
console.log(`count ${count ?? 0}`)
