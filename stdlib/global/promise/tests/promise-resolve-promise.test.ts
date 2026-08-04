// @targets cc
// @expect pass
// @stdout value

const source = Promise.resolve('value')
const value = await Promise.resolve(source)

console.log(value)
