// @targets cc
// @expect pass
// @stdout a
// @stdout c
// @stdout d
// @stdout e
// @stdout f
// @stdout g
// @stdout h
// @stdout b

const values: Map<string, number> = new Map([
  ['a', 1],
  ['b', 2],
  ['c', 3],
  ['d', 4]
])

for (const key of values.keys()) {
  console.log(key)

  if (key === 'a') {
    values.set('e', 5)
    values.set('f', 6)
    values.set('g', 7)
    values.set('h', 8)
    values.delete('b')
    values.set('b', 9)
  }
}
