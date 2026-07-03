// @targets cc
// @expect pass
// @stderr TypeError: Cannot read properties of null (reading 'v')

try {
  const foo = JSON.parse('null')
  console.log(foo.v)
} catch (error) {
  console.error(error)
}
