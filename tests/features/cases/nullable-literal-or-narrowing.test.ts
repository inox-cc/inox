// @targets cc
// @expect pass
// @stdout filter
// @stdout 1

function narrowed(value: string | null): string | null {
  if (value === 'filter' || value === 'map') {
    return value
  }

  return null
}

const selected = narrowed('filter')

if (selected !== null) {
  console.log(selected)
}

console.log(narrowed('other') === null)
