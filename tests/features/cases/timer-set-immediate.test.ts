// @targets cc
// @expect pass
// @stdout next

setImmediate(() => {
  console.log('next')
})
