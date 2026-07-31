// @targets cc
// @expect pass
// @stdout ADA

type Name = ReturnType<(value: number) => string>
const name: Name = 'Ada'

console.log(name.toUpperCase())
