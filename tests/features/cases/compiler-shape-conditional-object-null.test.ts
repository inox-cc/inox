// @targets cc
// @expect pass
// @stdout 1

type Item = {
  value: string
}

const items: Item[] | null = null
const item: Item | null = items === null ? null : items[0]

console.log(item === null)
