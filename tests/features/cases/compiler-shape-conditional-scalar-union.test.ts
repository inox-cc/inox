// @targets cc
// @expect pass
// @stdout selected

type Scalar = string | number | boolean
type Entry = {
  present: boolean
  value: Scalar
}

const entry: Entry = { present: false, value: 'mapped' }
let selected: Scalar | null = null
selected = false ? entry.present : entry.value

console.log('selected')
