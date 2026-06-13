// @targets js,c
// @expect pass

try {
  throw 'boom'
} catch (error) {
  console.log(`caught ${error}`)
} finally {
  console.log('finally')
}
