// @targets cc
// @expect pass
// @stdout alpha

class Box {
  value: string

  constructor(value: string) {
    this.value = value
  }
}

function first(value: Box | string[]): string {
  if (Array.isArray(value)) {
    if (value.length > 0) {
      return value[0]
    }

    return ''
  }

  return 'box'
}

console.log(first(['alpha']))
