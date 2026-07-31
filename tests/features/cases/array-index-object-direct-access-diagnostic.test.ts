// @targets cc
// @expect diagnostics INOX_NULLABLE_ACCESS

type Item = {
  value: string
}

const items: Item[] = []
const first = items[0]

console.log(first.value)
