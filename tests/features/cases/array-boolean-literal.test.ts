// @targets cc
// @expect pass
// @stdout 1

const values = [true, false]

if (values.length > 0) {
  console.log(values[0])
}
