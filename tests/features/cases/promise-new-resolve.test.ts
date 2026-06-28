// @targets cc
// @expect pass
// @stdout 4

const promise: Promise<number> = new Promise((resolve) => {
  resolve(4)
})
const value = await promise
console.log(value)
