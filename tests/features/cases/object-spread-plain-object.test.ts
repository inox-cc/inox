// @targets cc
// @expect pass
// @stdout item:2

type Base = {
  name: string
  count: number
}

function withCount(base: Base): Base {
  return {
    ...base,
    count: 2
  }
}

const result = withCount({ name: 'item', count: 1 })

console.log(`${result.name}:${result.count}`)
