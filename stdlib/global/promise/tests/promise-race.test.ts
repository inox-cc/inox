// @targets cc
// @expect pass
// @stdout first

const value = await Promise.race([Promise.resolve('first'), Promise.resolve('second')])

console.log(value)
