// @targets cc
// @expect pass
// @stdout Ada

type Bag = { [key: string]: string }

function pick(body: Bag | string[], key: string): string | null {
  if (!Array.isArray(body)) {
    return body[key]
  }

  return null
}

console.log(pick({ name: 'Ada' }, 'name'))
