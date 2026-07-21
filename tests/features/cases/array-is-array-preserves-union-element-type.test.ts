// @targets cc
// @expect pass

type Item = {
  name: string
}

function printItems(value: Item | Item[] | null | undefined): void {
  if (Array.isArray(value)) {
    const items: Item[] = value

    items[0].name
  }
}
