// @targets cc
// @expect pass
// @stdout 1

function countSources(sources: Array<{ argumentIndex: number; objectFieldName?: string } | null>): number {
  return sources.length
}

console.log(countSources([{ argumentIndex: 0 }]))
