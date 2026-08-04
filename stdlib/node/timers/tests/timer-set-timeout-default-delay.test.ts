// @targets js cc
// @expect pass
// @stdout now
// @stdout later

setTimeout(() => {
  console.log('later')
})

console.log('now')
