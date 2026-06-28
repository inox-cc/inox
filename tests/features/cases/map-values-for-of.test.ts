// @targets cc
// @expect pass
// @stdout 7

const scores: Map<string, number> = new Map()
scores.set('Ada', 7)
for (const score of scores.values()) {
  console.log(score)
}
