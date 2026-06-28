// @targets cc
// @expect pass
// @stdout Ada

const seed = 'Ada'

function echo(value: string): string {
  return value
}

console.log(echo(seed))
