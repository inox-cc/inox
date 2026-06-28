// @targets cc
// @expect pass
// @stdout ok

function run(callback: Function): void {
  call(callback)
}

function call(callback: Function): void {
  callback()
}

run(() => {
  console.log('ok')
})
