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

const values: Map<string, number> = new Map()
values.set('a', 1)
values.set('b', 2)
values.set('c', 3)
values.set('d', 4)
values.set('e', 5)
values.set('f', 6)
values.set('g', 7)
values.set('h', 8)
values.delete('b')
values.set('b', 9)

for (const key of values.keys()) {
  console.log(key)
}
