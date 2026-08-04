// @targets cc
// @expect pass
// @stdout handled

const value = await Promise.resolve('ok')
  .then((item) => {
    if (item === 'ok') {
      throw 'boom'
    }

    return item
  })
  .catch(() => 'handled')

console.log(value)
