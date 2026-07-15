// @targets cc
// @expect pass
// @stdout 1

class TagBox {
  tags: Set<string>
  opaque: unknown

  constructor() {
    this.opaque = {}
    this.tags = new Set()
  }

  add(tag: string): void {
    this.tags.add(tag)
  }

  size(): number {
    return this.tags.size
  }
}

const box = new TagBox()
box.add('Ada')
console.log(box.size())
