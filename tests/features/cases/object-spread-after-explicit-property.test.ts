// @targets cc
// @expect pass
// @stdout spread:2

type Item = {
  name: string
  count: number
}

const tail: Item = {
  name: 'spread',
  count: 2
}
const copy = { name: 'explicit', count: 1, ...tail }

console.log(`${copy.name}:${copy.count}`)
