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
    return value[0]
  }

  return 'box'
}

console.log(first(['alpha']))
