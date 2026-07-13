// @targets cc
// @expect pass
// @stdout -1
// @stdout 3

type Source = {
  argumentIndex: number
}

function firstIndex(sources: Array<Source | null>): number {
  const source = sources[0]

  if (source === null || typeof source === 'undefined') {
    return -1
  }

  return source.argumentIndex
}

console.log(firstIndex([null]))
console.log(firstIndex([{ argumentIndex: 3 }]))
