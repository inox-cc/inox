// @targets cc
// @expect pass
// @stdout ready

function lookup(found: boolean): { value: string } | null {
  if (found) {
    return { value: 'ready' }
  }

  return null
}

const result = lookup(true)

if (result !== null) {
  console.log(result.value)
}
