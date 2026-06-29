// @targets cc
// @expect pass
// @stdout {"parent":{"name":"Ada"}}

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

const parent = new Parent('Ada')
const child = new Child(parent)
console.log(JSON.stringify(child))
