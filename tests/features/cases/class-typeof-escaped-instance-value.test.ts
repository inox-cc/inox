// @targets cc
// @expect pass
// @stdout 1

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

function collectValues(): unknown[] {
  const parent = new Parent('Ada')
  const child = new Child(parent)
  return Object.values(child)
}

const values = collectValues()
console.log(typeof values[0] === 'object')
