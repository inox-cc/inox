// @targets cc
// @expect pass
// @stdout alpha

function first(value: string | string[]): string {
  if (Array.isArray(value) || Array.isArray(value)) {
    return value[0]
  }

  return value
}

console.log(first(['alpha']))
