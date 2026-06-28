// @targets cc
// @expect pass
// @stdout delayed

const promise: Promise<string> = new Promise((resolve) => {
  setTimeout(() => {
    resolve('delayed')
  }, 0)
})
console.log(await promise)
