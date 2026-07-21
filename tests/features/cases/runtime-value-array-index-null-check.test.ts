// @targets cc
// @expect pass
// @stdout 7

type Item = {
  value: number
}

const items: Item[] = [{ value: 7 }]

if (items[0] !== null && typeof items[0] !== 'undefined') {
  console.log(items[0].value)
}
