// @targets cc
// @expect pass
// @stdout alpha

function values(): string[] | null {
  return ['alpha']
}

const result = values()

console.log(result?.[0] ?? 'missing')
