// @targets cc
// @expect pass
// @stdout Replacement

type Item = {
  name: string
}

type DynamicContainer = {
  [key: string]: any
  children: Item[]
}

function replaceChild(container: DynamicContainer, index: number, replacement: Item): void {
  container.children[index] = replacement
}

const container: DynamicContainer = {
  children: [{ name: 'Original' }]
}

replaceChild(container, 0, { name: 'Replacement' })

if (container.children.length > 0) {
  console.log(container.children[0].name)
}
