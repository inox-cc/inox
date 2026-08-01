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

const second = new Link('second', null)
const first = new Link('first', second)
console.log(first.next?.name ?? 'missing')
