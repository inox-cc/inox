// @targets cc
// @expect pass
// @stdout 1

const first: Map<string, number> = new Map()
first.set('a', 1)
const second: Map<string, number> = new Map(first)
console.log(second.get('a') ?? 0)
