// @targets cc
// @expect pass
// @stdout ok

function createPromise(): Promise<string> {
  return Promise.resolve('ok')
}

console.log(await createPromise())
