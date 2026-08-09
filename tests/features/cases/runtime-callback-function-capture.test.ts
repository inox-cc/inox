// @targets cc
// @expect pass
// @stdout captured callback

const report = (): void => {
  console.log('captured callback')
}

setTimeout(() => {
  report()
}, 0)
