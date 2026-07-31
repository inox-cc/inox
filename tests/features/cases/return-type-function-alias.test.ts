// @targets cc
// @expect pass
// @stdout ADA

type Factory<T> = (value: T) => T
type Name = ReturnType<Factory<string>>

const name: Name = 'Ada'

console.log(name.toUpperCase())
