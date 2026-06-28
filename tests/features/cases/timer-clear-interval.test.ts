// @targets cc
// @expect pass

const handle = setInterval(() => {
  console.log('nope')
}, 0)
clearInterval(handle)
