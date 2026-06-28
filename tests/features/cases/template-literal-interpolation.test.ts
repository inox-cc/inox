// @targets cc
// @expect pass
// @stdout Hello Ada

const name: string = 'Ada'
const value: string = `Hello ${name}`
console.log(value)
