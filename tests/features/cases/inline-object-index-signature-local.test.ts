// @targets cc
// @expect pass
// @stdout Ada

function readName(): string {
  const values: { [key: string]: string } = { name: 'Ada' }
  return values.name
}

console.log(readName())
