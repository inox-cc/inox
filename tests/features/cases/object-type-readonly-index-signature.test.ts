// @targets cc
// @expect pass
// @stdout Ada

type ReadonlyBag = {
  readonly [key: string]: string
}

function readName(values: ReadonlyBag): string {
  return values.name
}

console.log(readName({ name: 'Ada' }))
