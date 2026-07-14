// @targets cc
// @expect pass
// @stdout 1

type Bounds = {
  integer: boolean
  minimum?: number
}

function hasIntegerMinimum(bounds: Bounds): boolean {
  const minimum = bounds.minimum
  const hasMinimum = minimum !== null && typeof minimum !== 'undefined'

  return bounds.integer === true && hasMinimum && (minimum as number) % 1 === 0
}

console.log(hasIntegerMinimum({ integer: true, minimum: 3 }))
