// @targets c
// @expect pass

const handle = setImmediate(() => {
  console.log('nope')
})
clearImmediate(handle)
