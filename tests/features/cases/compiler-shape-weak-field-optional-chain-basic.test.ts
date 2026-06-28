// @targets cc
// @expect pass
// @stdout Ada

class Parent {
  name: string
  constructor(name: string) {
    this.name = name
  }
}

class Child {
  parent: weak<Parent | null>
  constructor(parent: Parent | null) {
    this.parent = parent
  }
}

const parent = new Parent('Ada')
const child = new Child(parent)
console.log(child.parent?.name ?? 'none')
