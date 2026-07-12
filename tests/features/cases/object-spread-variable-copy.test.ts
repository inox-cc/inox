// @targets cc
// @expect pass
// @stdout copy:3

type Item = {
  name: string
  count: number
}

const base: Item = {
  name: 'copy',
  count: 3
}
const copy = { ...base }

console.log(`${copy.name}:${copy.count}`)
