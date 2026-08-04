// @targets cc
// @expect pass
// @stdout 1
// @stdout 2

const values = new Set<number>([1, 2])

for (const value of values.values()) {
  console.log(value)
}
