// @targets cc
// @expect pass
// @stdout fallback 2

function createEntries(primary: boolean) {
  const fallback = 'fallback'

  if (primary) {
    return [{ name: 'primary', count: 1 }]
  }

  return [{ name: fallback, count: 2 }]
}

const entries = createEntries(false)

console.log(entries[0].name, entries[0].count)
