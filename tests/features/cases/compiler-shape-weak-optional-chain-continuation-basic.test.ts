// @targets c
// @expect pass
// @stdout 2:0
// @skip-node node: inox weak field syntax

type Child = {
  count: number
}

type Parent = {
  child: Child
}

class Owner {
  weak parent: Parent | null

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
