// @targets cc
// @expect pass
// @stdout 0

const value = 1 <
  2 && 3 >
  (4)

console.log(value)
