// @targets cc
// @expect pass
// @stdout many
// @stdout 2

function formatMaximum(maximum: number | null): string {
  return `${maximum ?? 'many'}`
}

console.log(formatMaximum(null))
console.log(formatMaximum(2))
