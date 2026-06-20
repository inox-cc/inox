// @targets c
// @expect pass
// @stdout 1

const scores: Map<string, number> = new Map()
scores.set('Ada', 7)
console.log(scores.has('Ada'))
