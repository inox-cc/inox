// @targets cc
// @expect pass
// @stdout target

type Renderer = {
  render: (value: string) => string
}

function render(value: string, seenTypes: string[] = []): string {
  if (seenTypes.length === 0) {
    return value
  }

  return seenTypes[0]
}

const renderer: Renderer = {
  render
}

console.log(renderer.render('target'))
