// @targets cc
// @expect pass
// @stdout beta

type Values = {
  primary: string[]
  fallback: string[]
}

function select(values: Values): string[] {
  let selected = values.primary

  if (selected.length === 0) {
    selected = values.fallback
  }

  return selected
}

console.log(select({ primary: [], fallback: ['beta'] })[0])
