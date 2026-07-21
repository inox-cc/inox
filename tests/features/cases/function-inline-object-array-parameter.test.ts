// @targets cc
// @expect pass
// @stdout 1

function countValues(values: { value: string }[]): number {
  return values.length
}

console.log(countValues([{ value: 'ready' }]))
