// @targets cc
// @expect pass
// @stdout 1

class TagBox {
  tags: Set<string>

  constructor(tags: Set<string>) {
    this.tags = tags
  }

  size(): number {
    return this.tags.size
  }
}

const tags: Set<string> = new Set()
tags.add('Ada')
const box = new TagBox(tags)
console.log(box.size())
