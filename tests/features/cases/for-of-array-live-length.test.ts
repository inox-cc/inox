// @targets cc
// @expect pass
// @stdout 1
// @stdout 2
// @stdout 3

const values = [1, 2]

for (const value of values) {
  console.log(value)

  if (value === 1) {
    values.push(3)
  }
}
