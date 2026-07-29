// @targets cc
// @expect pass
// @stdout 7

function firstSize(values: { size: number }[]): number {
  for (const value of values) {
    return value.size
  }

  return 0
}

console.log(firstSize([{ size: 7 }]))
