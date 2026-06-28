// @targets cc
// @expect pass
// @stdout 2:0

type Child = {
  count: number
}

type Parent = {
  child: Child
}

class Owner {
  parent: weak<Parent | null>

  constructor(parent: Parent | null) {
    this.parent = parent
  }
}

function childCount(owner: Owner): number {
  return owner.parent?.child.count ?? 0
}

const first = new Owner({ child: { count: 2 } })
const second = new Owner(null)
console.log(`${childCount(first)}:${childCount(second)}`)
