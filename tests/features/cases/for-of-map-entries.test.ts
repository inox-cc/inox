// @targets c
// @expect pass
// @stdout [Ada, 7]
// @stdout Ada
// @stdout 7

const scores: Map<string, number> = new Map()
scores.set('Ada', 7)
for (const entry of scores.entries()) {
  console.log(entry)
  console.log(entry[0])
  console.log(entry[1])
}
