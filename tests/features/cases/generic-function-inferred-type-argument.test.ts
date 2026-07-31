// @targets cc
// @expect pass
// @stdout ADA

function identity<T>(value: T): T {
  return value
}

const value = identity('Ada')
console.log(value.toUpperCase())
