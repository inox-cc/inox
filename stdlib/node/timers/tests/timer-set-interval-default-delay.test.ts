// @targets js cc
// @expect pass
// @stdout tick

setInterval(() => {
  console.log('tick')
  process.exit(0)
})
