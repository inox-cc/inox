// @targets cc
// @expect pass
// @stdout 7
// @stdout 1

type Scalar = string | number | boolean

function parseScalar(kind: string, source: string): Scalar {
  let value: Scalar = source

  if (kind === 'number') {
    value = Number(source)
  } else if (kind === 'boolean') {
    value = true
  }

  return value
}

console.log(parseScalar('number', '7') as number)
console.log((parseScalar('boolean', 'false') as boolean) === true)
