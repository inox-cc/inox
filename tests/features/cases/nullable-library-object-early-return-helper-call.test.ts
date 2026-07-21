// @targets cc
// @expect pass
// @stdout value

function firstValue(values: string[]): string {
  return values[0]
}

function readSingleValue(values: string[] | null | undefined): string | null {
  if (values === null || typeof values === 'undefined' || values.length !== 1) {
    return null
  }

  return firstValue(values)
}

console.log(readSingleValue(['value']))
