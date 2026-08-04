// @targets cc
// @expect pass
// @stdout handled

const value = await Promise.resolve('ok')
  .then(() => {
    JSON.parse('{')
    return 'unreachable'
  })
  .catch(() => 'handled')

console.log(value)
