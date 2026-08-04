// @targets cc
// @expect pass
// @stdout a a 1
// @stdout b b 1

const values = new Set<string>(['a', 'b'])

values.forEach((value, key, set) => {
  console.log(value, key, set === values)
})
