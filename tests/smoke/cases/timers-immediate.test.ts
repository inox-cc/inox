// @targets c
// @expect pass
// @stdout immediate:next

setImmediate(() => {
  console.log('immediate:next')
})
