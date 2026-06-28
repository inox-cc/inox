// @targets cc
// @expect pass
// @stdout caught

try {
  await Promise.reject('bad')
} catch (error) {
  console.log('caught')
}
