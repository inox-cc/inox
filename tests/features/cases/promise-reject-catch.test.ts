// @targets c
// @expect pass
// @stdout handled

const value = await Promise.reject('failed').catch((error) => 'handled')
console.log(value)
