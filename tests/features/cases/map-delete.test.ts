// @targets cc
// @expect pass
// @stdout 0

const scores: Map<string, number> = new Map()
scores.set('Ada', 7)
scores.delete('Ada')
console.log(scores.has('Ada'))
