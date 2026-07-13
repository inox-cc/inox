// @targets cc
// @expect pass

const handle = setTimeout(() => {
  console.log('nope')
}, 0)

clearTimeout(handle)
clearTimeout(handle)
