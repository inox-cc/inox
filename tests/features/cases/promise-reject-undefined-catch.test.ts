// @targets cc
// @expect pass
// @stdout handled

const value = await Promise.reject().catch(() => 'handled')
console.log(value)
