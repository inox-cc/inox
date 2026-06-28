// @targets cc
// @expect pass

const handle = setTimeout(() => {
  console.log('later')
}, 0)
clearTimeout(handle)
