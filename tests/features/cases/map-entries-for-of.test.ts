// @targets c
// @expect pass
// @stdout Ada
// @stdout 7

const scores: Map<string, number> = new Map()
scores.set('Ada', 7)
for (const entry of scores) {
  console.log(entry.key)
  console.log(entry.value)
}
