// @targets cc
// @expect pass
// @stdout ready

type OptionalValue = {
  name: string
}

function valueName(value: OptionalValue | null): string {
  const selected = value
  const present = selected !== null

  return present ? selected.name : 'missing'
}

console.log(valueName({ name: 'ready' }))
