// @targets cc
// @expect pass
// @stdout Parent { name: Ada }

class Parent {
  name: string

  constructor(name: string) {
    this.name = name
  }
}

type Holder = {
  parent: object
}

function makeHolder(): Holder {
  const parent = new Parent('Ada')

  return {
    parent
  }
}

const holder = makeHolder()
const parent = holder.parent
console.log(parent)
