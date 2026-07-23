// @targets cc
// @expect pass
// @stdout caught

try {
  console.log(new Date('not-a-date').toISOString())
} catch {
  console.log('caught')
}
