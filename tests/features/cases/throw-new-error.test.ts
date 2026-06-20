// @targets c
// @expect pass
// @stdout Error: bad

try {
  throw new Error('bad')
} catch (error) {
  console.log(error)
}
