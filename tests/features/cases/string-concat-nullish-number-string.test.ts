// @targets cc
// @expect pass
// @stdout max:
// @stdout max:2

function formatMaximum(maximum: number | null): string {
  return 'max:' + (maximum ?? '')
}

console.log(formatMaximum(null))
console.log(formatMaximum(2))
