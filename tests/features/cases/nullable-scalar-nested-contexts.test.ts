// @targets cc
// @expect pass
// @stdout 7
// @stdout null

function maybeValue(value: number, present: boolean): number | null {
  return present ? value : null
}

function identity(value: number | null): number | null {
  return value
}

console.log(identity(maybeValue(7, true)))
console.log(identity(maybeValue(7, false)))
