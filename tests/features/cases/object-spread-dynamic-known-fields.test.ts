// @targets cc
// @expect pass
// @stdout next:2

type Metadata = {
  [key: string]: unknown
  name: string
  count: number
}

function renamed(base: Metadata): Metadata {
  return {
    ...base,
    name: 'next'
  }
}

const result = renamed({ name: 'base', count: 2 })

console.log(`${result.name}:${result.count}`)
