// @targets c
// @expect pass
// @stdout parent:none

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

function parentName(child: Child): string {
  return child.parent?.name ?? 'none'
}

const parent = new Parent('parent')
const first = new Child(parent)
const second = new Child(null)
console.log(`${parentName(first)}:${parentName(second)}`)
