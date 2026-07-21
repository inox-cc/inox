// @targets cc
// @expect pass
// @stdout alpha

const enabled = true
const values = enabled ? ['alpha'] : undefined

if (values) {
  console.log(values[0])
}
