// @targets js cc
// @expect pass
// @stdout tick

let interval: IntervalHandle

interval = setInterval(() => {
  console.log('tick')
  clearInterval(interval)
})
