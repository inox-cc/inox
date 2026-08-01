// @targets cc
// @expect pass
// @stdout second

class Link {
  name: string
  next: Link | null

  constructor(name: string, next: Link | null) {
    this.name = name
    this.next = next
  }
}

function createLinks(): Link {
  const second = new Link('second', null)
  return new Link('first', second)
}

const links = createLinks()
console.log(links.next?.name ?? 'missing')
