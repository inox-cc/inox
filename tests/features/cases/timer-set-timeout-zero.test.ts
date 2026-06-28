// @targets cc
// @expect pass
// @stdout later

setTimeout(() => {
  console.log('later')
}, 0)
