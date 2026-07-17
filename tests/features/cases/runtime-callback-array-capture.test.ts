// @targets cc
// @expect pass
// @stdout alpha

const values = ['alpha']

setTimeout(() => {
  console.log(values[0])
}, 0)
