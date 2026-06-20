// @targets c
// @expect pass
// @stdout 1

const value = null
if (value === null) {
  console.log(1)
}
