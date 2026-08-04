// @targets cc
// @expect pass
// @stdout a a
// @stdout b b

const values = new Set<string>(['a', 'b'])

for (const entry of values.entries()) {
  console.log(entry[0], entry[1])
}
