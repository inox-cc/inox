// @targets js cc
// @expect pass
// @stdout after

function stop(): void {
  return
  const unreachable = 'wrong'
  console.log(unreachable)
}

stop()
console.log('after')
