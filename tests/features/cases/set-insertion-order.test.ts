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

const values: Set<string> = new Set()
values.add('a')
values.add('b')
values.add('c')
values.add('d')
values.add('e')
values.add('f')
values.add('g')
values.add('h')
values.delete('b')
values.add('b')

for (const value of values) {
  console.log(value)
}
