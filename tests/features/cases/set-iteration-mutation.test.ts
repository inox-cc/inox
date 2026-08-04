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

const values: Set<string> = new Set(['a', 'b', 'c', 'd'])

for (const value of values) {
  console.log(value)

  if (value === 'a') {
    values.add('e')
    values.add('f')
    values.add('g')
    values.add('h')
    values.delete('b')
    values.add('b')
  }
}
