// @targets c
// @expect pass
// @stdout later

setTimeout(() => {
  console.log('later')
}, 0)
