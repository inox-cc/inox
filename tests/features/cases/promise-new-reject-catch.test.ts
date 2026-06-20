// @targets c
// @expect pass
// @stdout handled

const promise: Promise<string> = new Promise((resolve, reject) => {
  reject('no')
})
const value = await promise.catch((error) => 'handled')
console.log(value)
