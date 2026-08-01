// @targets cc
// @expect pass
// @stdout nested

type LeafMetadata = {
  kind: 'leaf'
  name: string
}

type BranchMetadata = {
  kind: 'branch'
  child?: Metadata | null
}

type Metadata = LeafMetadata | BranchMetadata

function leafName(value: LeafMetadata): string {
  return value.name
}

function nestedName(value: Metadata): string {
  if (value.kind !== 'branch') {
    return 'not-branch'
  }

  const child = value.child

  if (child === null || typeof child === 'undefined' || child.kind !== 'leaf') {
    return 'missing'
  }

  return leafName(child)
}

console.log(nestedName({ kind: 'branch', child: { kind: 'leaf', name: 'nested' } }))
