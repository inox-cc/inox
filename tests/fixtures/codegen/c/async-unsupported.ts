// @targets c
// @expect pass

function getPromise(): Promise<number> {
  return Promise.resolve(2)
}

const value = await getPromise()
console.log(value)

