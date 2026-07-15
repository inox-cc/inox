// @targets cc
// @expect pass
// @stdout 1

type Options = {
  values?: string[]
}

function count(values: NonNullable<Options['values']>): number {
  return values.length
}

console.log(count(['ready']))
