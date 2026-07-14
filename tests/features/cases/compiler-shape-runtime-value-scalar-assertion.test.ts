// @targets cc
// @expect pass
// @stdout 7

type ScalarValue = string | number | boolean

function scalarNumberText(value: ScalarValue): string {
  const numberValue = value as number

  return numberValue.toString()
}

console.log(scalarNumberText(7))
