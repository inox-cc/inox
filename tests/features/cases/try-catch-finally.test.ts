// @targets cc
// @expect pass
// @stdout caught
// @stdout finally

try {
  throw 'caught'
} catch (error) {
  console.log(error)
} finally {
  console.log('finally')
}
