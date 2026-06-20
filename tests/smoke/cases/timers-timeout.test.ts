// @targets c
// @expect pass
// @stdout timeout

setTimeout(() => {
  console.log('timeout')
}, 0)
