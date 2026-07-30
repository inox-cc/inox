// @targets cc
// @expect pass
// @stdout first

type AnyNode = { [key: string]: any }

type ArrayBindingElement = {
  name: string
  index: number
}

function firstBindingName(node: AnyNode): string {
  const bindingElements: ArrayBindingElement[] = node.bindingElements ?? []

  if (bindingElements.length === 0) {
    return ''
  }

  return bindingElements[0].name
}

console.log(firstBindingName({ bindingElements: [{ name: 'first', index: 0 }] }))
