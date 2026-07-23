// @targets cc
// @expect pass
// @stdout caught

try {
  console.log((1).toString(1))
} catch {
  console.log('caught')
}
