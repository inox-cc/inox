// @targets cc
// @expect pass
// @stdout empty

type Item = {
  value: string
}

function firstValue(items: Item[]): string {
  if (items.length === 0) {
    return 'empty'
  }

  return items[0].value
}

console.log(firstValue([]))
