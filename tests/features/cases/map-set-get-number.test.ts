// @targets c
// @expect pass
// @stdout 7

const scores: Map<string, number> = new Map()
scores.set('Ada', 7)
console.log(scores.get('Ada') ?? 0)
