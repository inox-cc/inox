// @targets c
// @expect pass
// @stdout next

setImmediate(() => {
  console.log('next')
})
