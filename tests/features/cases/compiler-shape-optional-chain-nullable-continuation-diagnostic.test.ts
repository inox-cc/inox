// @targets c
// @expect diagnostics INOX_WEAK_ACCESS

type Child = {
  count: number
}

type Parent = {
  child: Child | null
}

const parent: Parent | null = { child: null }
console.log(parent?.child.count)
