// @targets cc
// @expect pass
// @stdout Error: bad
// @skip-node

try {
  throw new Error('bad')
} catch (error) {
  console.log(error)
}
