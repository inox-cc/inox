// @targets cc
// @expect pass
// @stdout alpha

function first(value: string | string[]): string {
  if (Array.isArray(value) || Array.isArray(value)) {
    if (value.length > 0) {
      return value[0]
    }

    return ''
  }

  return value
}

console.log(first(['alpha']))
