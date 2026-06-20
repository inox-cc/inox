// @targets c
// @expect diagnostics INOX_WEAK_ACCESS

class Parent {
  name: string
  constructor(name: string) {
    this.name = name
  }
}

class Child {
  weak parent: Parent | null
  constructor(parent: Parent | null) {
    this.parent = parent
  }
}

const child = new Child(null)
console.log(child.parent.name)
