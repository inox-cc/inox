// @targets cc
// @expect pass
// @stdout Ada

function readName(values: { [key: string]: string }[]): string {
  const first = values[0]

  if (first === null || typeof first === 'undefined') {
    return ''
  }

  return first.name
}

console.log(readName([{ name: 'Ada' }]))
