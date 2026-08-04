// @targets js cc
// @expect pass
// @stdout done

setTimeout(() => {
  console.log('unexpected')
}, 1000).unref()

console.log('done')
