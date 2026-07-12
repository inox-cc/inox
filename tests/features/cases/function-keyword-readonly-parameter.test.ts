// @targets cc
// @expect pass
// @stdout 7

function identity(readonly: number): number {
  return readonly
}

console.log(identity(7))
