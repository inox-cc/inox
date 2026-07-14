// @targets cc
// @expect pass
// @stdout 1
// @stdout 7

function optionalNumber(value?: number): number {
  if (value === undefined) {
    return 1
  }

  return value
}

console.log(optionalNumber())
console.log(optionalNumber(7))
