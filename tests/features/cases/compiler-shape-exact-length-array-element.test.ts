// @targets cc
// @expect pass
// @stdout only

function onlyValue(values: string[]): string | null {
  if (values.length !== 1) {
    return null
  }

  return values[0]
}

console.log(onlyValue(['only']))
