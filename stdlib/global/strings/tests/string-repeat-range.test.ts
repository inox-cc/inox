// @targets cc
// @expect pass
// @stdout range

try {
  'x'.repeat(-1)
} catch (_error) {
  console.log('range')
}
