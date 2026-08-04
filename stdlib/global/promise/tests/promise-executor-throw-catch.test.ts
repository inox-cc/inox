// @targets cc
// @expect pass
// @stdout handled

const value = await new Promise<string>(() => {
  throw 'boom'
}).catch(() => 'handled')

console.log(value)
