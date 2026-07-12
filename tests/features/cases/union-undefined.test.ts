// @targets cc
// @expect pass
// @stdout none

const value: string | undefined = undefined
console.log(value ?? 'none')
