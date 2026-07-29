// @targets cc
// @expect pass
// @stdout 9

function firstSize(values: Array<{ size: number } | null>): number {
  for (const value of values) {
    if (value !== null) {
      return value.size
    }
  }

  return 0
}

console.log(firstSize([null, { size: 9 }]))
