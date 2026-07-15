// @targets cc
// @expect pass
// @stdout 1

type Item = {
  selected: number
}

const groups: Map<string, Item[]> = new Map()
groups.set('first', [{ selected: 1 }])

for (const items of groups.values()) {
  for (let index = 0; index < items.length; index = index + 1) {
    console.log(items[index].selected)
  }
}
