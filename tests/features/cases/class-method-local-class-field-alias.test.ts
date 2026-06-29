// @targets cc
// @expect pass
// @stdout Ada

class Child {
  name: string

  constructor(name: string) {
    this.name = name
  }

  label(): string {
    return this.name
  }
}

class Parent {
  child: Child

  constructor(child: Child) {
    this.child = child
  }

  label(): string {
    const current = this.child
    return current.label()
  }
}

const parent = new Parent(new Child('Ada'))
console.log(parent.label())
