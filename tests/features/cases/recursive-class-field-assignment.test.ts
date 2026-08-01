// @targets cc
// @expect pass
// @stdout child

class Link {
  name: string
  next: Link | null

  constructor(name: string) {
    this.name = name
    this.next = null
  }

  attach(next: Link): void {
    this.next = next
  }
}

const root = new Link('root')

if (root.name === 'root') {
  const child = new Link('child')
  root.attach(child)
}

console.log(root.next?.name ?? 'missing')
