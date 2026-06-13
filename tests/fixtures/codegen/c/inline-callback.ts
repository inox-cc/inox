// @targets c
// @expect pass
// @stdout inline

function run(callback: Function): void {
  callback()
}

run(() => {
  console.log('inline')
})

