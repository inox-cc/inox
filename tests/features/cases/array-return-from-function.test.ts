// @targets cc
// @expect pass
// @stdout 2

function makeValues(): number[] {
  return [1, 2]
}

const values = makeValues()
console.log(values.length)
