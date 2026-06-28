// @targets cc
// @expect pass
// @stdout Ada

const scores: Map<string, number> = new Map()
scores.set('Ada', 7)
for (const key of scores.keys()) {
  console.log(key)
}
