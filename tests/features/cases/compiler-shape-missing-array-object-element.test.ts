// @targets cc
// @expect pass
// @stdout missing

type Item = {
  value: string
}

const items: Item[] = []
const first = items[0]

if (first !== undefined) {
  console.log(first.value)
} else {
  console.log('missing')
}
