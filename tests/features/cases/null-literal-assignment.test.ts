// @targets cc
// @expect pass
// @stdout 1

const value: null = null
if (value === null) {
  console.log(1)
}
