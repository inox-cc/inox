// @targets cc
// @expect pass
// @stdout outer inner 7

const value = 7
console.log(`outer ${`inner ${value}`}`)
