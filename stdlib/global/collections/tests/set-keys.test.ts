// @targets cc
// @expect pass
// @stdout a
// @stdout b

const values = new Set<string>(['a', 'b'])

for (const value of values.keys()) {
  console.log(value)
}
