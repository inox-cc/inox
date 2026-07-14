// @targets cc
// @expect pass
// @stdout 7
// @stdout 1
// @stdout text

type ScalarValue = string | number | boolean

function printScalar(value: ScalarValue): void {
  if (typeof value === 'number') {
    console.log((value as number).toString())
  } else if (typeof value === 'boolean') {
    console.log((value as boolean) === true)
  } else if (typeof value === 'string' && (value as string) === 'text') {
    console.log(value as string)
  }
}

printScalar(7)
printScalar(true)
printScalar('text')
