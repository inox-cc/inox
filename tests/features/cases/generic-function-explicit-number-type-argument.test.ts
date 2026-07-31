// @targets cc
// @expect pass
// @stdout 14

function identity<T>(value: T): T {
  return value
}

const value = identity<number>(7)
console.log(value * 2)
