// @targets cc
// @expect pass

type Item = {
  name: string
}

function printItems(value: Item | Item[] | null | undefined): void {
  if (Array.isArray(value)) {
    const items: Item[] = value

    if (items.length > 0) {
      items[0].name
    }
  }
}
