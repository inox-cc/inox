// @targets cc
// @expect pass
// @stdout nested

setImmediate(() => {
  setImmediate(() => {
    console.log('nested')
  })
})
