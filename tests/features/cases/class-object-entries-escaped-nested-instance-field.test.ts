// @targets cc
// @expect pass
// @stdout [parent, Parent { name: Ada }]

class Parent {
  name: string

  constructor(name: string) {
    this.name = name
  }
}

class Child {
  parent: Parent

  constructor(parent: Parent) {
    this.parent = parent
  }
}

function collectEntries(): unknown[] {
  const parent = new Parent('Ada')
  const child = new Child(parent)
  return Object.entries(child)
}

const entries = collectEntries()
console.log(entries[0])
