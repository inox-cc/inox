// @targets c
// @expect pass
// @stdout bad

try {
  throw new Error('bad')
} catch (error) {
  console.log(error.message)
}
