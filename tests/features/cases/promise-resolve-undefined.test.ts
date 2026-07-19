// @targets cc
// @expect pass
// @stdout undefined

const value = await Promise.resolve()
console.log(value)
