// @targets cc
// @expect pass
// @stdout boom

const value = await Promise.reject(new Error('boom')).catch((error) => error.message)
console.log(value)
