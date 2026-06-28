// @targets cc
// @expect pass
// @stdout none

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

const child = new Child(null)
console.log(child.parent?.name ?? 'none')
