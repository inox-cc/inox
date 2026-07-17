// @targets cc
// @expect pass
// @stdout 0

function isInvalidIndex(value: string | number): boolean {
  return typeof value !== 'number' || value < 0 || Math.floor(value) !== value
}

console.log(isInvalidIndex(2))
