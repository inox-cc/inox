// @targets cc
// @expect pass
// @stdout 8
// @stdout 1

let value: string | number | boolean = 'text'

value = 7
console.log((value as number) + 1)

value = true
console.log((value as boolean) === true)
