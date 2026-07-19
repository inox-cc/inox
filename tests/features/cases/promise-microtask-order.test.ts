// @targets cc
// @expect pass
// @stdout sync
// @stdout microtask

const promise = Promise.resolve('microtask')
promise.then((value) => {
  console.log(value)
  return value
})
console.log('sync')
await promise
