// @targets cc
// @expect pass
// @stdout { parent: Parent { name: Ada } }

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

type Holder = {
  parent: unknown
}

function collectHolder(): Holder {
  const parent = new Parent('Ada')
  const child = new Child(parent)
  const values = Object.values(child)
  return {
    parent: values[0]
  }
}

const holder = collectHolder()
console.log(holder)
